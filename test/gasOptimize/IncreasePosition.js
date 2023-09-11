const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed, gasUsed } = require("../shared/utilities")
const { toXOraclePrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getEthConfig, getBtcConfig, getDaiConfig, validateVaultBalance, tokenIndexs } = require("../core/Vault/helpers")
const { sleep } = require("../../scripts/tfx_deploy/shared/helpers")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")

use(solidity)

describe("Test Gas Optimize", function () {
    const provider = waffle.provider
    const [deployer, wallet, user0, user1, user2] = provider.getWallets()
  
    let vaultPriceFeed
  
    beforeEach(async () => {
        bnb = await deployContract("Token", [])
        btc = await deployContract("Token", [])
        eth = await deployContract("Token", [])
        dai = await deployContract("Token", [])
        usdc = await deployContract("Token", [])
        busd = await deployContract("Token", [])
    
    
        vault = await deployContract("Vault", [])
        vaultPositionController = await deployContract("VaultPositionController", [])
        usdg = await deployContract("USDG", [vault.address])
        router = await deployContract("Router", [vault.address, vaultPositionController.address, usdg.address, bnb.address])
        vaultPriceFeed = await deployContract("VaultPriceFeed", [])

        await initVault(vault, vaultPositionController, router, usdg, vaultPriceFeed)

        distributor0 = await deployContract("TimeDistributor", [])
        yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

        await yieldTracker0.setDistributor(distributor0.address)
        await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

        await bnb.mint(distributor0.address, 5000)
        await usdg.setYieldTrackers([yieldTracker0.address])
        
        // deploy xOracle
        xOracle = await deployXOracle(bnb);
        const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

        // deploy fulfillController
        fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address, 0])
        await fulfillController.setController(deployer.address, true)

        // deposit req fund to fulfillController
        await bnb.mint(fulfillController.address, ethers.utils.parseEther("1.0"))
    
        // set vaultPriceFeed
        await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT
        await vaultPriceFeed.setTokenConfig(busd.address, busdPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(usdc.address, usdcPriceFeed.address, 8, false)
        await vaultPriceFeed.setPriceSampleSpaceTime(30);
    })

    it("VaultPriceFeed: updatePrice", async () => {
        for (let i = 0; i < 10; i++) {
            await fulfillController.requestUpdatePrices()
            const tx = await xOracle.fulfillRequest([
                { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
                { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
                { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(1500), lastUpdate: 0 },
                { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
                { tokenIndex: tokenIndexs.USDC, price: toXOraclePrice(1), lastUpdate: 0 },
                { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
                ], 0)
            await reportGasUsed(provider, tx, "updatePrice gas used")
            await sleep(1000)
        }
    });

    it("VaultPositionController: Increase and Decrease Position", async () => {
        await vault.setTokenConfig(...getDaiConfig(dai))
        await vault.setTokenConfig(...getBtcConfig(btc))

        for (let i = 0; i < 10; i++){
            await fulfillController.requestUpdatePrices()
            await xOracle.fulfillRequest([
                { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
                { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
                { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(1500), lastUpdate: 0 },
                { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
                { tokenIndex: tokenIndexs.USDC, price: toXOraclePrice(1), lastUpdate: 0 },
                { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
            ], 0)
            await btc.mint(user1.address, expandDecimals(1, 8))

            await btc.connect(user1).transfer(vault.address, 250000) // 0.0025 BTC => 100 USD
            await vault.buyUSDG(btc.address, user1.address)

            await btc.mint(user0.address, expandDecimals(1, 8))
            await btc.connect(user1).transfer(vault.address, 25000) // 0.00025 BTC => 10 USD

            const tx1 = await vaultPositionController.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true)
            const gasUsed1 = await gasUsed(provider, tx1)
            const tx2 = await vaultPositionController.connect(user0).decreasePosition(user0.address, btc.address, btc.address, toUsd(10), toUsd(90), true, user2.address)
            const gasUsed2 = await gasUsed(provider, tx2)

            console.log(`Gas Used IncreasePosition: ${gasUsed1.toString()}, DecreasePosition: ${gasUsed2.toString()}`)
            await sleep(1000)
        }
    });

  })