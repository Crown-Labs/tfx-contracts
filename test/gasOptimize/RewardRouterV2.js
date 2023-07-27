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
        bnb = await deployContract("Token", [])
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
        usdg = await deployContract("USDG", [vault.address])
        router = await deployContract("Router", [vault.address, vaultPositionController.address, usdg.address, bnb.address])
        vaultPriceFeed = await deployContract("VaultPriceFeed", [])
        glp = await deployContract("GLP", [])
        rewardRouter = await deployContract("RewardRouterV2", [])

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
        fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address])

        // send fund to fulfillController
        await wallet.sendTransaction({ to: fulfillController.address, value: ethers.utils.parseEther("1.0") })
    
        // set fulfillController
        await fulfillController.setController(wallet.address, true)
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
    
        await glp.setInPrivateTransferMode(true)
        await glp.setMinter(glpManager.address, true)

        await glpManager.setInPrivateMode(true)

        gmx = await deployContract("GMX", []);
        esGmx = await deployContract("EsGMX", []);
        bnGmx = await deployContract("MintableBaseToken", ["Bonus GMX", "bnGMX", 0]);

        // GMX
        stakedGmxTracker = await deployContract("RewardTracker", ["Staked GMX", "sGMX"])
        stakedGmxDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGmxTracker.address])
        await stakedGmxTracker.initialize([gmx.address, esGmx.address], stakedGmxDistributor.address)
        await stakedGmxDistributor.updateLastDistributionTime()

        bonusGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus GMX", "sbGMX"])
        bonusGmxDistributor = await deployContract("BonusDistributor", [bnGmx.address, bonusGmxTracker.address])
        await bonusGmxTracker.initialize([stakedGmxTracker.address], bonusGmxDistributor.address)
        await bonusGmxDistributor.updateLastDistributionTime()

        feeGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee GMX", "sbfGMX"])
        feeGmxDistributor = await deployContract("RewardDistributor", [eth.address, feeGmxTracker.address])
        await feeGmxTracker.initialize([bonusGmxTracker.address, bnGmx.address], feeGmxDistributor.address)
        await feeGmxDistributor.updateLastDistributionTime()

        // GLP
        feeGlpTracker = await deployContract("RewardTracker", ["Fee GLP", "fGLP"])
        feeGlpDistributor = await deployContract("RewardDistributor", [eth.address, feeGlpTracker.address])
        await feeGlpTracker.initialize([glp.address], feeGlpDistributor.address)
        await feeGlpDistributor.updateLastDistributionTime()

        stakedGlpTracker = await deployContract("RewardTracker", ["Fee + Staked GLP", "fsGLP"])
        stakedGlpDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGlpTracker.address])
        await stakedGlpTracker.initialize([feeGlpTracker.address], stakedGlpDistributor.address)
        await stakedGlpDistributor.updateLastDistributionTime()

        gmxVester = await deployContract("Vester", [
        "Vested GMX", // _name
        "vGMX", // _symbol
        vestingDuration, // _vestingDuration
        esGmx.address, // _esToken
        feeGmxTracker.address, // _pairToken
        gmx.address, // _claimableToken
        stakedGmxTracker.address, // _rewardTracker
        ])

        glpVester = await deployContract("Vester", [
        "Vested GLP", // _name
        "vGLP", // _symbol
        vestingDuration, // _vestingDuration
        esGmx.address, // _esToken
        stakedGlpTracker.address, // _pairToken
        gmx.address, // _claimableToken
        stakedGlpTracker.address, // _rewardTracker
        ])

        await stakedGmxTracker.setInPrivateTransferMode(true)
        await stakedGmxTracker.setInPrivateStakingMode(true)
        await bonusGmxTracker.setInPrivateTransferMode(true)
        await bonusGmxTracker.setInPrivateStakingMode(true)
        await bonusGmxTracker.setInPrivateClaimingMode(true)
        await feeGmxTracker.setInPrivateTransferMode(true)
        await feeGmxTracker.setInPrivateStakingMode(true)

        await feeGlpTracker.setInPrivateTransferMode(true)
        await feeGlpTracker.setInPrivateStakingMode(true)
        await stakedGlpTracker.setInPrivateTransferMode(true)
        await stakedGlpTracker.setInPrivateStakingMode(true)

        await esGmx.setInPrivateTransferMode(true)

        await rewardRouter.initialize(
        bnb.address,
        gmx.address,
        esGmx.address,
        bnGmx.address,
        glp.address,
        stakedGmxTracker.address,
        bonusGmxTracker.address,
        feeGmxTracker.address,
        feeGlpTracker.address,
        stakedGlpTracker.address,
        glpManager.address,
        gmxVester.address,
        glpVester.address
        )

        await rewardManager.initialize(
        timelock.address,
        rewardRouter.address,
        glpManager.address,
        stakedGmxTracker.address,
        bonusGmxTracker.address,
        feeGmxTracker.address,
        feeGlpTracker.address,
        stakedGlpTracker.address,
        stakedGmxDistributor.address,
        stakedGlpDistributor.address,
        esGmx.address,
        bnGmx.address,
        gmxVester.address,
        glpVester.address
        )

        // allow bonusGmxTracker to stake stakedGmxTracker
        await stakedGmxTracker.setHandler(bonusGmxTracker.address, true)
        // allow bonusGmxTracker to stake feeGmxTracker
        await bonusGmxTracker.setHandler(feeGmxTracker.address, true)
        await bonusGmxDistributor.setBonusMultiplier(10000)
        // allow feeGmxTracker to stake bnGmx
        await bnGmx.setHandler(feeGmxTracker.address, true)

        // allow stakedGlpTracker to stake feeGlpTracker
        await feeGlpTracker.setHandler(stakedGlpTracker.address, true)

        // allow fulfillController
        await stakedGlpTracker.setHandler(fulfillController.address, true)

        // allow feeGlpTracker to stake glp
        await glp.setHandler(feeGlpTracker.address, true)

        // mint esGmx for distributors
        await esGmx.setMinter(wallet.address, true)
        await esGmx.mint(stakedGmxDistributor.address, expandDecimals(50000, 18))
        await stakedGmxDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second
        await esGmx.mint(stakedGlpDistributor.address, expandDecimals(50000, 18))
        await stakedGlpDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second

        // mint bnGmx for distributor
        await bnGmx.setMinter(wallet.address, true)
        await bnGmx.mint(bonusGmxDistributor.address, expandDecimals(1500, 18))

        await esGmx.setHandler(tokenManager.address, true)
        await gmxVester.setHandler(wallet.address, true)

        // setFulfillController
        await fulfillController.setHandler(rewardRouter.address, true)
        await rewardRouter.setFulfillController(fulfillController.address);
        await glpManager.setHandler(rewardRouter.address, true);

        await glpManager.setGov(timelock.address)
        await stakedGmxTracker.setGov(timelock.address)
        await bonusGmxTracker.setGov(timelock.address)
        await feeGmxTracker.setGov(timelock.address)
        await feeGlpTracker.setGov(timelock.address)
        await stakedGlpTracker.setGov(timelock.address)
        await stakedGmxDistributor.setGov(timelock.address)
        await stakedGlpDistributor.setGov(timelock.address)
        await esGmx.setGov(timelock.address)
        await bnGmx.setGov(timelock.address)
        await gmxVester.setGov(timelock.address)
        await glpVester.setGov(timelock.address)

        await rewardManager.updateEsGmxHandlers()
        await rewardManager.enableRewardRouter() 

    }) 
    it("BuyGLP by rewardRouterV2", async () => {
        for (let i = 0; i < 10; i++){
            await eth.mint(feeGlpDistributor.address, expandDecimals(100, 18))
            await feeGlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second
        
            await bnb.mint(user1.address, expandDecimals(1, 18))
            await bnb.connect(user1).approve(rewardRouter.address, expandDecimals(1, 18))
        
            const tx0 = await rewardRouter.connect(user1).mintAndStakeGlp(
              bnb.address,
              expandDecimals(1, 18),
              expandDecimals(299, 18),
              expandDecimals(299, 18)
            )
        
            await reportGasUsed(provider, tx0, "mintAndStakeGlp gas used")
            await sleep(1000)

            await xOracle.fulfillRequest([
              { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
              { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
              { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
            ], 0)
        }
    });
  })