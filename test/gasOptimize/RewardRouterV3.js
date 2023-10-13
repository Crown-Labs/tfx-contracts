const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed } = require("../shared/utilities")
const { toXOraclePrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getEthConfig, getBtcConfig, getDaiConfig, validateVaultBalance, tokenIndexs } = require("../core/Vault/helpers")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")
const { sleep } = require("../../scripts/tfx_deploy/shared/helpers")

use(solidity)

describe("BuyGLP", function () {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, tokenManager] = provider.getWallets()

    const vestingDuration = 365 * 24 * 60 * 60
  
    let vaultPriceFeed
  
    beforeEach(async () => {
        // bnb = await deployContract("Token", [])
        btc = await deployContract("Token", [])
        eth = await deployContract("Token", [])
        dai = await deployContract("Token", [])
        usdc = await deployContract("Token", [])
        busd = await deployContract("Token", [])
        rewardManager = await deployContract("RewardManager", [])
        timelock = await deployContract("Timelock", [
            wallet.address,
            10,
            rewardManager.address,
            tokenManager.address,
            tokenManager.address,
            expandDecimals(1000000, 18),
            10,
            100
        ])
    
        vault = await deployContract("Vault", [])
        vaultPositionController = await deployContract("VaultPositionController", [])
        usdx = await deployContract("USDX", [vault.address])
        router = await deployContract("Router", [vault.address, vaultPositionController.address, usdx.address, eth.address])
        vaultPriceFeed = await deployContract("VaultPriceFeed", [])
        xlp = await deployContract("XLP", [])
        rewardRouter = await deployContract("RewardRouterV3", [])

        await initVault(vault, vaultPositionController, router, usdx, vaultPriceFeed)
        xlpManager = await deployContract("XlpManager", [vault.address, usdx.address, xlp.address, 24 * 60 * 60])

        distributor0 = await deployContract("TimeDistributor", [])
        yieldTracker0 = await deployContract("YieldTracker", [usdx.address])

        await yieldTracker0.setDistributor(distributor0.address)
        await distributor0.setDistribution([yieldTracker0.address], [1000], [eth.address])

        await eth.mint(distributor0.address, 5000)
        await usdx.setYieldTrackers([yieldTracker0.address])
        
        // deploy xOracle
        xOracle = await deployXOracle(eth);
        const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

        // deploy fulfillController
        fulfillController = await deployContract("FulfillController", [xOracle.address, eth.address, 0])

        // deposit req fund to fulfillController
        await eth.mint(fulfillController.address, ethers.utils.parseEther("1.0"))
    
        // set fulfillController
        await fulfillController.setController(wallet.address, true)
        await fulfillController.setHandler(xlpManager.address, true)

        // set xlpManager
        await xlpManager.setFulfillController(fulfillController.address);
    
        // set vaultPriceFeed
        await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
        // await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT
        await vaultPriceFeed.setTokenConfig(busd.address, busdPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(usdc.address, usdcPriceFeed.address, 8, false)

        // set vault
        await vault.setTokenConfig(...getDaiConfig(dai))
        await vault.setTokenConfig(...getBtcConfig(btc))
        await vault.setTokenConfig(...getBnbConfig(eth))

        await xlp.setInPrivateTransferMode(true)
        await xlp.setMinter(xlpManager.address, true)
    
        await vault.setInManagerMode(true)
    
        await xlp.setInPrivateTransferMode(true)
        await xlp.setMinter(xlpManager.address, true)

        await xlpManager.setInPrivateMode(true)

        // gmx = await deployContract("GMX", []);
        // esGmx = await deployContract("EsGMX", []);
        // bnGmx = await deployContract("MintableBaseToken", ["Bonus GMX", "bnGMX", 0]);

        // GMX
        // stakedGmxTracker = await deployContract("RewardTracker", ["Staked GMX", "sGMX"])
        // stakedGmxDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGmxTracker.address])
        // await stakedGmxTracker.initialize([gmx.address, esGmx.address], stakedGmxDistributor.address)
        // await stakedGmxDistributor.updateLastDistributionTime()

        // bonusGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus GMX", "sbGMX"])
        // bonusGmxDistributor = await deployContract("BonusDistributor", [bnGmx.address, bonusGmxTracker.address])
        // await bonusGmxTracker.initialize([stakedGmxTracker.address], bonusGmxDistributor.address)
        // await bonusGmxDistributor.updateLastDistributionTime()

        // feeGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee GMX", "sbfGMX"])
        // feeGmxDistributor = await deployContract("RewardDistributor", [eth.address, feeGmxTracker.address])
        // await feeGmxTracker.initialize([bonusGmxTracker.address, bnGmx.address], feeGmxDistributor.address)
        // await feeGmxDistributor.updateLastDistributionTime()

        // GLP
        feeXlpTracker = await deployContract("RewardTracker", ["Fee XLP", "fXLP"])
        feeXlpDistributor = await deployContract("RewardDistributor", [eth.address, feeXlpTracker.address])
        await feeXlpTracker.initialize([xlp.address], feeXlpDistributor.address)
        await feeXlpDistributor.updateLastDistributionTime()

        // stakedXlpTracker = await deployContract("RewardTracker", ["Fee + Staked GLP", "fsGLP"])
        // stakedXlpDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedXlpTracker.address])
        // await stakedXlpTracker.initialize([feeXlpTracker.address], stakedXlpDistributor.address)
        // await stakedXlpDistributor.updateLastDistributionTime()

        // gmxVester = await deployContract("Vester", [
        // "Vested GMX", // _name
        // "vGMX", // _symbol
        // vestingDuration, // _vestingDuration
        // esGmx.address, // _esToken
        // feeGmxTracker.address, // _pairToken
        // gmx.address, // _claimableToken
        // stakedGmxTracker.address, // _rewardTracker
        // ])

        // xlpVester = await deployContract("Vester", [
        // "Vested GLP", // _name
        // "vGLP", // _symbol
        // vestingDuration, // _vestingDuration
        // esGmx.address, // _esToken
        // stakedXlpTracker.address, // _pairToken
        // gmx.address, // _claimableToken
        // stakedXlpTracker.address, // _rewardTracker
        // ])

        // await stakedGmxTracker.setInPrivateTransferMode(true)
        // await stakedGmxTracker.setInPrivateStakingMode(true)
        // await bonusGmxTracker.setInPrivateTransferMode(true)
        // await bonusGmxTracker.setInPrivateStakingMode(true)
        // await bonusGmxTracker.setInPrivateClaimingMode(true)
        // await feeGmxTracker.setInPrivateTransferMode(true)
        // await feeGmxTracker.setInPrivateStakingMode(true)

        await feeXlpTracker.setInPrivateTransferMode(true)
        await feeXlpTracker.setInPrivateStakingMode(true)
        // await stakedXlpTracker.setInPrivateTransferMode(true)
        // await stakedXlpTracker.setInPrivateStakingMode(true)

        // await esGmx.setInPrivateTransferMode(true)

        await rewardRouter.initialize(
        eth.address,
        // gmx.address,
        // esGmx.address,
        // bnGmx.address,
        xlp.address,
        // stakedGmxTracker.address,
        // bonusGmxTracker.address,
        // feeGmxTracker.address,
        feeXlpTracker.address,
        // stakedXlpTracker.address,
        xlpManager.address,
        // gmxVester.address,
        // xlpVester.address
        0
        )

        await rewardManager.initialize(
        timelock.address,
        rewardRouter.address,
        xlpManager.address,
        // stakedGmxTracker.address,
        // bonusGmxTracker.address,
        // feeGmxTracker.address,
        feeXlpTracker.address,
        // stakedXlpTracker.address,
        // stakedGmxDistributor.address,
        // stakedXlpDistributor.address,
        // esGmx.address,
        // bnGmx.address,
        // gmxVester.address,
        // xlpVester.address
        )

        // allow bonusGmxTracker to stake stakedGmxTracker
        // await stakedGmxTracker.setHandler(bonusGmxTracker.address, true)
        // allow bonusGmxTracker to stake feeGmxTracker
        // await bonusGmxTracker.setHandler(feeGmxTracker.address, true)
        // await bonusGmxDistributor.setBonusMultiplier(10000)
        // allow feeGmxTracker to stake bnGmx
        // await bnGmx.setHandler(feeGmxTracker.address, true)

        // allow stakedXlpTracker to stake feeXlpTracker
        // await feeXlpTracker.setHandler(stakedXlpTracker.address, true)

        // allow fulfillController
        // await stakedXlpTracker.setHandler(fulfillController.address, true)

        // allow feeXlpTracker to stake xlp
        await xlp.setHandler(feeXlpTracker.address, true)

        // mint esGmx for distributors
        // await esGmx.setMinter(wallet.address, true)
        // await esGmx.mint(stakedGmxDistributor.address, expandDecimals(50000, 18))
        // await stakedGmxDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second
        // await esGmx.mint(stakedXlpDistributor.address, expandDecimals(50000, 18))
        // await stakedXlpDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second

        // mint bnGmx for distributor
        // await bnGmx.setMinter(wallet.address, true)
        // await bnGmx.mint(bonusGmxDistributor.address, expandDecimals(1500, 18))

        // await esGmx.setHandler(tokenManager.address, true)
        // await gmxVester.setHandler(wallet.address, true)

        // setFulfillController
        await fulfillController.setHandler(rewardRouter.address, true)
        await rewardRouter.setFulfillController(fulfillController.address);
        await xlpManager.setHandler(rewardRouter.address, true);

        await xlpManager.setGov(timelock.address)
        // await stakedGmxTracker.setGov(timelock.address)
        // await bonusGmxTracker.setGov(timelock.address)
        // await feeGmxTracker.setGov(timelock.address)
        await feeXlpTracker.setGov(timelock.address)
        // await stakedXlpTracker.setGov(timelock.address)
        // await stakedGmxDistributor.setGov(timelock.address)
        // await stakedXlpDistributor.setGov(timelock.address)
        // await esGmx.setGov(timelock.address)
        // await bnGmx.setGov(timelock.address)
        // await gmxVester.setGov(timelock.address)
        // await xlpVester.setGov(timelock.address)

        // await rewardManager.updateEsGmxHandlers()
        await rewardManager.enableRewardRouter() 

    }) 
    it("BuyGLP by rewardRouterV3", async () => {
        for (let i = 0; i < 10; i++){
            await eth.mint(feeXlpDistributor.address, expandDecimals(100, 18))
            await feeXlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second
        
            await eth.mint(user1.address, expandDecimals(1, 18))
            await eth.connect(user1).approve(rewardRouter.address, expandDecimals(1, 18))
        
            const tx0 = await rewardRouter.connect(user1).mintAndStakeXlp(
              eth.address,
              expandDecimals(1, 18),
              expandDecimals(299, 18),
              expandDecimals(299, 18)
            )
        
            await reportGasUsed(provider, tx0, "mintAndStakeXlp gas used")
            await sleep(1000)

            await xOracle.fulfillRequest([
              { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
              { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
              { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
            ], 0)
        }
    });
  })