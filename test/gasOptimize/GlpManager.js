const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed } = require("../shared/utilities")
const { toXOraclePrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getEthConfig, getBtcConfig, getDaiConfig, validateVaultBalance, tokenIndexs } = require("../core/Vault/helpers")
const { sleep } = require("../../scripts/tfx_deploy/shared/helpers")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")

use(solidity)

describe("BuyGLP", function () {
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
        glp = await deployContract("GLP", [])

        await initVault(vault, vaultPositionController, router, usdg, vaultPriceFeed)
        glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, 24 * 60 * 60])

        distributor0 = await deployContract("TimeDistributor", [])
        yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

        await yieldTracker0.setDistributor(distributor0.address)
        await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

        await bnb.mint(distributor0.address, 5000)
        await usdg.setYieldTrackers([yieldTracker0.address])
        
        // deploy xOracle
        xOracle = await deployXOracle();
        const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

        // deploy fulfillController
        fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address, 0])
        await fulfillController.setController(deployer.address, true)

        // send fund to fulfillController
        await deployer.sendTransaction({ to: fulfillController.address, value: ethers.utils.parseEther("1.0") })

        // set fulfillController
        await fulfillController.setController(deployer.address, true)
        await fulfillController.setHandler(glpManager.address, true)

        // set glpManager
        await glpManager.setFulfillController(fulfillController.address);
    
        // set vaultPriceFeed
        await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT
        await vaultPriceFeed.setTokenConfig(busd.address, busdPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(usdc.address, usdcPriceFeed.address, 8, false)

        // set vault
        await vault.setTokenConfig(...getDaiConfig(dai))
        await vault.setTokenConfig(...getBtcConfig(btc))
        await vault.setTokenConfig(...getBnbConfig(bnb))

        await glp.setInPrivateTransferMode(true)
        await glp.setMinter(glpManager.address, true)

        await vault.setInManagerMode(true)
    })

    it("BuyGLP by glpManager", async () => {

        await vault.setManager(glpManager.address, true)

        for (let i = 0; i < 10; i++){
        await dai.mint(user0.address, expandDecimals(100, 18))
        await dai.connect(user0).approve(glpManager.address, expandDecimals(100, 18))
        await fulfillController.requestUpdatePrices()
        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(1500), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.USDC, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
          ], 0)

        const tx0 = await glpManager.connect(user0).addLiquidity(
            dai.address,
            expandDecimals(100, 18),
            expandDecimals(99, 18),
            expandDecimals(99, 18)
          )
        await reportGasUsed(provider, tx0, "addLiquidity gas used")
        await sleep(1000)
        }
    });
    
    


  })