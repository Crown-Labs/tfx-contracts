const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed, print, newWallet } = require("../shared/utilities")
const { toXOraclePrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("../core/Vault/helpers")

use(solidity)

describe("RewardRouterV3", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, user4, tokenManager] = provider.getWallets()

  // const vestingDuration = 365 * 24 * 60 * 60

  let timelock
  // let rewardManager

  let vault
  let xlpManager
  let xlp
  let usdx
  let router
  let vaultPriceFeed
  // let bnb
  let btc
  let eth
  let dai
  let busd

  // let gmx
  // let esGmx
  // let bnGmx

  // let stakedGmxTracker
  // let stakedGmxDistributor
  // let bonusGmxTracker
  // let bonusGmxDistributor
  // let feeGmxTracker
  // let feeGmxDistributor

  let feeXlpTracker
  let feeXlpDistributor
  // let stakedXlpTracker
  // let stakedXlpDistributor

  // let gmxVester
  // let xlpVester

  let rewardRouter
  let xOracle
  let fulfillController
  let depositFund

  beforeEach(async () => {
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

    // bnb = await deployContract("Token", [])
    btc = await deployContract("Token", [])
    eth = await deployContract("Token", [])
    dai = await deployContract("Token", [])
    busd = await deployContract("Token", [])

    vault = await deployContract("Vault", [])
    vaultPositionController = await deployContract("VaultPositionController", [])
    usdx = await deployContract("USDX", [vault.address])
    router = await deployContract("Router", [vault.address, vaultPositionController.address, usdx.address, eth.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    xlp = await deployContract("XLP", [])
    rewardRouter = await deployContract("RewardRouterV3", [])

    await initVault(vault, vaultPositionController, router, usdx, vaultPriceFeed)
    xlpManager = await deployContract("XlpManager", [vault.address, usdx.address, xlp.address, 24 * 60 * 60])

    // deploy xOracle
    xOracle = await deployXOracle(eth);
    const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

    // deploy fulfillController
    fulfillController = await deployContract("FulfillController", [xOracle.address, eth.address, 0])

    // deposit req fund to fulfillController
    await eth.mint(fulfillController.address, ethers.utils.parseEther("1.0"))
    depositFund = ethers.utils.parseEther("1.0")

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    // await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT

    // set fulfillController
    await fulfillController.setController(wallet.address, true)

    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)
    
    // set vault
    await vault.setTokenConfig(...getDaiConfig(dai))
    await vault.setTokenConfig(...getBtcConfig(btc))
    await vault.setTokenConfig(...getBnbConfig(eth))

    await xlp.setInPrivateTransferMode(true)
    await xlp.setMinter(xlpManager.address, true)
    await xlp.setHandler(rewardRouter.address, true)
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
    //   "Vested GMX", // _name
    //   "vGMX", // _symbol
    //   vestingDuration, // _vestingDuration
    //   esGmx.address, // _esToken
    //   feeGmxTracker.address, // _pairToken
    //   gmx.address, // _claimableToken
    //   stakedGmxTracker.address, // _rewardTracker
    // ])

    // xlpVester = await deployContract("Vester", [
    //   "Vested GLP", // _name
    //   "vGLP", // _symbol
    //   vestingDuration, // _vestingDuration
    //   esGmx.address, // _esToken
    //   stakedXlpTracker.address, // _pairToken
    //   gmx.address, // _claimableToken
    //   stakedXlpTracker.address, // _rewardTracker
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

  it("inits", async () => {
    expect(await rewardRouter.isInitialized()).eq(true)

    expect(await rewardRouter.weth()).eq(eth.address)
    // expect(await rewardRouter.gmx()).eq(gmx.address)
    // expect(await rewardRouter.esGmx()).eq(esGmx.address)
    // expect(await rewardRouter.bnGmx()).eq(bnGmx.address)

    expect(await rewardRouter.xlp()).eq(xlp.address)

    // expect(await rewardRouter.stakedGmxTracker()).eq(stakedGmxTracker.address)
    // expect(await rewardRouter.bonusGmxTracker()).eq(bonusGmxTracker.address)
    // expect(await rewardRouter.feeGmxTracker()).eq(feeGmxTracker.address)

    expect(await rewardRouter.feeXlpTracker()).eq(feeXlpTracker.address)
    // expect(await rewardRouter.stakedXlpTracker()).eq(stakedXlpTracker.address)

    expect(await rewardRouter.xlpManager()).eq(xlpManager.address)

    // expect(await rewardRouter.gmxVester()).eq(gmxVester.address)
    // expect(await rewardRouter.xlpVester()).eq(xlpVester.address)

    await expect(rewardRouter.initialize(
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
    )).to.be.revertedWith("RewardRouter: already initialized")

    expect(await rewardManager.timelock()).eq(timelock.address)
    expect(await rewardManager.rewardRouter()).eq(rewardRouter.address)
    expect(await rewardManager.xlpManager()).eq(xlpManager.address)
    // expect(await rewardManager.stakedGmxTracker()).eq(stakedGmxTracker.address)
    // expect(await rewardManager.bonusGmxTracker()).eq(bonusGmxTracker.address)
    // expect(await rewardManager.feeGmxTracker()).eq(feeGmxTracker.address)
    expect(await rewardManager.feeXlpTracker()).eq(feeXlpTracker.address)
    // expect(await rewardManager.stakedXlpTracker()).eq(stakedXlpTracker.address)
    // expect(await rewardManager.stakedGmxTracker()).eq(stakedGmxTracker.address)
    // expect(await rewardManager.stakedGmxDistributor()).eq(stakedGmxDistributor.address)
    // expect(await rewardManager.stakedXlpDistributor()).eq(stakedXlpDistributor.address)
    // expect(await rewardManager.esGmx()).eq(esGmx.address)
    // expect(await rewardManager.bnGmx()).eq(bnGmx.address)
    // expect(await rewardManager.gmxVester()).eq(gmxVester.address)
    // expect(await rewardManager.xlpVester()).eq(xlpVester.address)

    await expect(rewardManager.initialize(
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
    )).to.be.revertedWith("RewardManager: already initialized")
  })

  it("mintAndStakeXlp, unstakeAndRedeemXlp, compound", async () => {
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

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)
    
    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXlpTracker.depositBalances(user1.address, xlp.address)).eq(expandDecimals(2991, 17))
    // expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    // expect(await stakedXlpTracker.depositBalances(user1.address, feeXlpTracker.address)).eq(expandDecimals(2991, 17))

    await eth.mint(user1.address, expandDecimals(2, 18))
    await eth.connect(user1).approve(rewardRouter.address, expandDecimals(2, 18))
    await rewardRouter.connect(user1).mintAndStakeXlp(
      eth.address,
      expandDecimals(2, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)
    
    await increaseTime(provider, 24 * 60 * 60 + 1)
    await mineBlock(provider)

    expect(await feeXlpTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeXlpTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    // expect(await stakedXlpTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    // expect(await stakedXlpTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    await eth.mint(user2.address, expandDecimals(1, 18))

    await eth.connect(user2).approve(rewardRouter.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeXlp(
      eth.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await rewardRouter.connect(user2).unstakeAndRedeemXlp(
      eth.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user2.address
    )
    
    // revertedWith("XlpManager: cooldown duration not yet passed")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq("897300000000000000000") // 897.3
    // expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq("897300000000000000000")
    expect(await eth.balanceOf(user1.address)).eq(0)

    const tx1 = await rewardRouter.connect(user1).unstakeAndRedeemXlp(
      eth.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user1.address
    )
    await reportGasUsed(provider, tx1, "unstakeAndRedeemXlp gas used")

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    // expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await eth.balanceOf(user1.address)).eq("993676666666666666") // ~0.99

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeXlpTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeXlpTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeXlpTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeXlpTracker.claimable(user2.address)).lt("1200000000000000000")

    // expect(await stakedXlpTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    // expect(await stakedXlpTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    // expect(await stakedXlpTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    // expect(await stakedXlpTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    // expect(await esGmx.balanceOf(user1.address)).eq(0)
    // await rewardRouter.connect(user1).claimEsGmx()
    // expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    // expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    // expect(await eth.balanceOf(user1.address)).eq(0)
    // await rewardRouter.connect(user1).claimFees()
    // expect(await eth.balanceOf(user1.address)).gt("5940000000000000000")
    // expect(await eth.balanceOf(user1.address)).lt("5960000000000000000")

    // expect(await esGmx.balanceOf(user2.address)).eq(0)
    // await rewardRouter.connect(user2).claimEsGmx()
    // expect(await esGmx.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    // expect(await esGmx.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    // expect(await eth.balanceOf(user2.address)).eq(0)
    // await rewardRouter.connect(user2).claimFees()
    // expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    // expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx2 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx2, "compound gas used")

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    // await increaseTime(provider, 24 * 60 * 60)
    // await mineBlock(provider)

    // const tx3 = await rewardRouter.batchCompoundForAccounts([user1.address, user2.address])
    // await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    // expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    // expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))
    // expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(0)
    // expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(4165, 18))
    // expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(4167, 18))

    // expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    // expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))

    // expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4179, 18))
    // expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4180, 18))
    // expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(4165, 18))
    // expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(4167, 18))
    // expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("12900000000000000000") // 12.9
    // expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("13100000000000000000") // 13.1

    

    // expect(await feeXlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await feeXlpTracker.stakedAmounts(user1.address)).gt("3091000000000000000000") // 598.3 + compound
    // expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await eth.balanceOf(user1.address)).eq("993676666666666666") // ~0.99
  })
return
  it("mintAndStakeXlpETH, unstakeAndRedeemXlpETH", async () => {
    const receiver0 = newWallet()

    await expect(rewardRouter.connect(user0).mintAndStakeXlpETH(expandDecimals(300, 18), expandDecimals(300, 18), { value: 0 }))
      .to.be.revertedWith("RewardRouter: invalid msg.value")

    await rewardRouter.connect(user0).mintAndStakeXlpETH(
      expandDecimals(300, 18), 
      expandDecimals(300, 18), 
      { value: expandDecimals(1, 18) }
    )
    
    // revertedWith("XlpManager: insufficient USDX output")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await rewardRouter.connect(user0).mintAndStakeXlpETH(
      expandDecimals(299, 18), 
      expandDecimals(300, 18), 
      { value: expandDecimals(1, 18) }
    )
    
    // revertedWith("XlpManager: insufficient GLP output")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(vault.address)).eq(0)
    expect((await bnb.totalSupply()).sub(depositFund)).eq(0) 
    expect(await provider.getBalance(bnb.address)).eq(0)
    expect(await stakedXlpTracker.balanceOf(user0.address)).eq(0)

    await rewardRouter.connect(user0).mintAndStakeXlpETH(
      expandDecimals(299, 18), 
      expandDecimals(299, 18), 
      { value: expandDecimals(1, 18) }
    )
    
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(vault.address)).eq(expandDecimals(1, 18))
    expect(await provider.getBalance(bnb.address)).eq(expandDecimals(1, 18))
    expect((await bnb.totalSupply()).sub(depositFund)).eq(expandDecimals(1, 18)) 
    expect(await stakedXlpTracker.balanceOf(user0.address)).eq("299100000000000000000") // 299.1

    await rewardRouter.connect(user0).unstakeAndRedeemXlpETH(
      expandDecimals(300, 18), 
      expandDecimals(1, 18), 
      receiver0.address
    )
    
    // revertedWith("RewardTracker: _amount exceeds stakedAmount")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await rewardRouter.connect(user0).unstakeAndRedeemXlpETH(
      "299100000000000000000", 
      expandDecimals(1, 18), 
      receiver0.address
    )
    
    // revertedWith("XlpManager: cooldown duration not yet passed")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await increaseTime(provider, 24 * 60 * 60 + 10)

    await rewardRouter.connect(user0).unstakeAndRedeemXlpETH(
      "299100000000000000000", 
      expandDecimals(1, 18), 
      receiver0.address
    )
    
    // revertedWith("XlpManager: insufficient output")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await rewardRouter.connect(user0).unstakeAndRedeemXlpETH(
      "299100000000000000000", 
      "990000000000000000", 
      receiver0.address
    )
    
    // revertedWith("XlpManager: insufficient output")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await provider.getBalance(receiver0.address)).eq("994009000000000000") // 0.994009
    expect(await bnb.balanceOf(vault.address)).eq("5991000000000000") // 0.005991
    expect(await provider.getBalance(bnb.address)).eq("5991000000000000")
    expect((await bnb.totalSupply()).sub(depositFund)).eq("5991000000000000") 
  })
  
  // it("gmx: signalTransfer, acceptTransfer", async () =>{
  //   await gmx.setMinter(wallet.address, true)
  //   await gmx.mint(user1.address, expandDecimals(200, 18))
  //   expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))
  //   await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(200, 18))
  //   await rewardRouter.connect(user1).stakeGmx(expandDecimals(200, 18))
  //   expect(await gmx.balanceOf(user1.address)).eq(0)

  //   await gmx.mint(user2.address, expandDecimals(200, 18))
  //   expect(await gmx.balanceOf(user2.address)).eq(expandDecimals(200, 18))
  //   await gmx.connect(user2).approve(stakedGmxTracker.address, expandDecimals(400, 18))
  //   await rewardRouter.connect(user2).stakeGmx(expandDecimals(200, 18))
  //   expect(await gmx.balanceOf(user2.address)).eq(0)

  //   await rewardRouter.connect(user2).signalTransfer(user1.address)

  //   await increaseTime(provider, 24 * 60 * 60)
  //   await mineBlock(provider)

  //   await rewardRouter.connect(user2).signalTransfer(user1.address)
  //   await rewardRouter.connect(user1).claim()

  //   await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
  //     .to.be.revertedWith("RewardRouter: stakedGmxTracker.averageStakedAmounts > 0")

  //   await rewardRouter.connect(user2).signalTransfer(user3.address)

  //   await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
  //     .to.be.revertedWith("RewardRouter: transfer not signalled")

  //   await gmxVester.setBonusRewards(user2.address, expandDecimals(100, 18))

  //   expect(await stakedGmxTracker.depositBalances(user2.address, gmx.address)).eq(expandDecimals(200, 18))
  //   expect(await stakedGmxTracker.depositBalances(user2.address, esGmx.address)).eq(0)
  //   expect(await feeGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)
  //   expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(0)
  //   expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).eq(0)
  //   expect(await feeGmxTracker.depositBalances(user3.address, bnGmx.address)).eq(0)
  //   expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(0)
  //   expect(await gmxVester.transferredCumulativeRewards(user3.address)).eq(0)
  //   expect(await gmxVester.bonusRewards(user2.address)).eq(expandDecimals(100, 18))
  //   expect(await gmxVester.bonusRewards(user3.address)).eq(0)
  //   expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).eq(0)
  //   expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).eq(0)
  //   expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
  //   expect(await gmxVester.getMaxVestableAmount(user3.address)).eq(0)
  //   expect(await gmxVester.getPairAmount(user2.address, expandDecimals(892, 18))).eq(0)
  //   expect(await gmxVester.getPairAmount(user3.address, expandDecimals(892, 18))).eq(0)

  //   await rewardRouter.connect(user3).acceptTransfer(user2.address)

  //   expect(await stakedGmxTracker.depositBalances(user2.address, gmx.address)).eq(0)
  //   expect(await stakedGmxTracker.depositBalances(user2.address, esGmx.address)).eq(0)
  //   expect(await feeGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)
  //   expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(expandDecimals(200, 18))
  //   expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).gt(expandDecimals(892, 18))
  //   expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).lt(expandDecimals(893, 18))
  //   expect(await feeGmxTracker.depositBalances(user3.address, bnGmx.address)).gt("547000000000000000") // 0.547
  //   expect(await feeGmxTracker.depositBalances(user3.address, bnGmx.address)).lt("549000000000000000") // 0.548
  //   expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
  //   expect(await gmxVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
  //   expect(await gmxVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
  //   expect(await gmxVester.bonusRewards(user2.address)).eq(0)
  //   expect(await gmxVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
  //   expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
  //   expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).eq(expandDecimals(200, 18))
  //   expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(0)
  //   expect(await gmxVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(992, 18))
  //   expect(await gmxVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(993, 18))
  //   expect(await gmxVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
  //   expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
  //   expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))

  //   await gmx.connect(user3).approve(stakedGmxTracker.address, expandDecimals(400, 18))
  //   await rewardRouter.connect(user3).signalTransfer(user4.address)
  //   await rewardRouter.connect(user4).acceptTransfer(user3.address)

  //   expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(0)
  //   expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).eq(0)
  //   expect(await feeGmxTracker.depositBalances(user3.address, bnGmx.address)).eq(0)
  //   expect(await stakedGmxTracker.depositBalances(user4.address, gmx.address)).eq(expandDecimals(200, 18))
  //   expect(await stakedGmxTracker.depositBalances(user4.address, esGmx.address)).gt(expandDecimals(892, 18))
  //   expect(await stakedGmxTracker.depositBalances(user4.address, esGmx.address)).lt(expandDecimals(893, 18))
  //   expect(await feeGmxTracker.depositBalances(user4.address, bnGmx.address)).gt("547000000000000000") // 0.547
  //   expect(await feeGmxTracker.depositBalances(user4.address, bnGmx.address)).lt("549000000000000000") // 0.548
  //   expect(await gmxVester.transferredAverageStakedAmounts(user4.address)).gt(expandDecimals(200, 18))
  //   expect(await gmxVester.transferredAverageStakedAmounts(user4.address)).lt(expandDecimals(201, 18))
  //   expect(await gmxVester.transferredCumulativeRewards(user4.address)).gt(expandDecimals(892, 18))
  //   expect(await gmxVester.transferredCumulativeRewards(user4.address)).lt(expandDecimals(894, 18))
  //   expect(await gmxVester.bonusRewards(user3.address)).eq(0)
  //   expect(await gmxVester.bonusRewards(user4.address)).eq(expandDecimals(100, 18))
  //   expect(await stakedGmxTracker.averageStakedAmounts(user3.address)).gt(expandDecimals(1092, 18))
  //   expect(await stakedGmxTracker.averageStakedAmounts(user3.address)).lt(expandDecimals(1094, 18))
  //   expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(0)
  //   expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
  //   expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1094, 18))
  //   expect(await gmxVester.getCombinedAverageStakedAmount(user4.address)).gt(expandDecimals(200, 18))
  //   expect(await gmxVester.getCombinedAverageStakedAmount(user4.address)).lt(expandDecimals(201, 18))
  //   expect(await gmxVester.getMaxVestableAmount(user3.address)).eq(0)
  //   expect(await gmxVester.getMaxVestableAmount(user4.address)).gt(expandDecimals(992, 18))
  //   expect(await gmxVester.getMaxVestableAmount(user4.address)).lt(expandDecimals(993, 18))
  //   expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).eq(0)
  //   expect(await gmxVester.getPairAmount(user4.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
  //   expect(await gmxVester.getPairAmount(user4.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))

  //   await expect(rewardRouter.connect(user4).acceptTransfer(user3.address))
  //     .to.be.revertedWith("RewardRouter: transfer not signalled")
  // })

  it("xlp: signalTransfer, acceptTransfer", async () =>{
    // await gmx.setMinter(wallet.address, true)
    // await gmx.mint(gmxVester.address, expandDecimals(10000, 18))
    // await gmx.mint(xlpVester.address, expandDecimals(10000, 18))
    await eth.mint(feeXlpDistributor.address, expandDecimals(100, 18))
    await feeXlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await eth.mint(user1.address, expandDecimals(1, 18))
    await eth.connect(user1).approve(rewardRouter.address, expandDecimals(1, 18))

    await rewardRouter.connect(user1).mintAndStakeXlp(
      eth.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )
    
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)
  
    await eth.mint(user2.address, expandDecimals(1, 18))
    await eth.connect(user2).approve(rewardRouter.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeXlp(
      eth.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    // await gmx.mint(user1.address, expandDecimals(200, 18))
    // expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    // await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(200, 18))
    // await rewardRouter.connect(user1).stakeGmx(expandDecimals(200, 18))
    // expect(await gmx.balanceOf(user1.address)).eq(0)

    // await gmx.mint(user2.address, expandDecimals(200, 18))
    // expect(await gmx.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    // await gmx.connect(user2).approve(stakedGmxTracker.address, expandDecimals(400, 18))
    // await rewardRouter.connect(user2).stakeGmx(expandDecimals(200, 18))
    // expect(await gmx.balanceOf(user2.address)).eq(0)

    // await rewardRouter.connect(user2).signalTransfer(user1.address)
    
    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user2).signalTransfer(user1.address)
    await rewardRouter.connect(user1).compound()

    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: stakedGmxTracker.averageStakedAmounts > 0")

    await rewardRouter.connect(user2).signalTransfer(user3.address)

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await gmxVester.setBonusRewards(user2.address, expandDecimals(100, 18))

    expect(await stakedGmxTracker.depositBalances(user2.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user2.address, esGmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).eq(0)

    expect(await feeGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user3.address, bnGmx.address)).eq(0)

    expect(await feeXlpTracker.depositBalances(user2.address, xlp.address)).eq("299100000000000000000") // 299.1
    expect(await feeXlpTracker.depositBalances(user3.address, xlp.address)).eq(0)

    expect(await stakedXlpTracker.depositBalances(user2.address, feeXlpTracker.address)).eq("299100000000000000000") // 299.1
    expect(await stakedXlpTracker.depositBalances(user3.address, feeXlpTracker.address)).eq(0)

    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).eq(0)
    expect(await gmxVester.bonusRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.bonusRewards(user3.address)).eq(0)
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).eq(0)
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(892, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(892, 18))).eq(0)

    await rewardRouter.connect(user3).acceptTransfer(user2.address)

    expect(await stakedGmxTracker.depositBalances(user2.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user2.address, esGmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).gt(expandDecimals(1785, 18))
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).lt(expandDecimals(1786, 18))

    expect(await feeGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user3.address, bnGmx.address)).gt("547000000000000000") // 0.547
    expect(await feeGmxTracker.depositBalances(user3.address, bnGmx.address)).lt("549000000000000000") // 0.548

    expect(await feeXlpTracker.depositBalances(user2.address, xlp.address)).eq(0)
    expect(await feeXlpTracker.depositBalances(user3.address, xlp.address)).eq("299100000000000000000") // 299.1

    expect(await stakedXlpTracker.depositBalances(user2.address, feeXlpTracker.address)).eq(0)
    expect(await stakedXlpTracker.depositBalances(user3.address, feeXlpTracker.address)).eq("299100000000000000000") // 299.1

    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await gmxVester.bonusRewards(user2.address)).eq(0)
    expect(await gmxVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(992, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(993, 18))
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(892, 18))).gt(expandDecimals(199, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(892, 18))).lt(expandDecimals(200, 18))

    await rewardRouter.connect(user1).compound()
    
    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user1).claim()
    await rewardRouter.connect(user2).claim()
    await rewardRouter.connect(user3).claim()

    expect(await gmxVester.getCombinedAverageStakedAmount(user1.address)).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user1.address)).lt(expandDecimals(1094, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1094, 18))

    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1885, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1887, 18))
    expect(await gmxVester.getMaxVestableAmount(user1.address)).gt(expandDecimals(1785, 18))
    expect(await gmxVester.getMaxVestableAmount(user1.address)).lt(expandDecimals(1787, 18))

    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(1885, 18))).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(1885, 18))).lt(expandDecimals(1094, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(1785, 18))).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(1785, 18))).lt(expandDecimals(1094, 18))

    await rewardRouter.connect(user1).compound()
    await rewardRouter.connect(user3).compound()

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(1992, 18))
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(1993, 18))

    await gmxVester.connect(user1).deposit(expandDecimals(1785, 18))

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(1991 - 1092, 18)) // 899
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(1993 - 1092, 18)) // 901

    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt(expandDecimals(4, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt(expandDecimals(6, 18))

    await rewardRouter.connect(user1).unstakeGmx(expandDecimals(200, 18))
    await expect(rewardRouter.connect(user1).unstakeEsGmx(expandDecimals(699, 18)))
      .to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await rewardRouter.connect(user1).unstakeEsGmx(expandDecimals(599, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(97, 18))
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(99, 18))

    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(599, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(601, 18))

    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))

    await gmxVester.connect(user1).withdraw()

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18)) // 1190 - 98 => 1092
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(2378, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(2380, 18))

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    expect(await xlpVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1785, 18))
    expect(await xlpVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1787, 18))

    expect(await xlpVester.getPairAmount(user3.address, expandDecimals(1785, 18))).gt(expandDecimals(298, 18))
    expect(await xlpVester.getPairAmount(user3.address, expandDecimals(1785, 18))).lt(expandDecimals(300, 18))

    expect(await stakedXlpTracker.balanceOf(user3.address)).eq("299100000000000000000")

    expect(await esGmx.balanceOf(user3.address)).gt(expandDecimals(1785, 18))
    expect(await esGmx.balanceOf(user3.address)).lt(expandDecimals(1787, 18))

    expect(await gmx.balanceOf(user3.address)).eq(0)

    await xlpVester.connect(user3).deposit(expandDecimals(1785, 18))

    expect(await stakedXlpTracker.balanceOf(user3.address)).gt(0)
    expect(await stakedXlpTracker.balanceOf(user3.address)).lt(expandDecimals(1, 18))

    expect(await esGmx.balanceOf(user3.address)).gt(0)
    expect(await esGmx.balanceOf(user3.address)).lt(expandDecimals(1, 18))

    expect(await gmx.balanceOf(user3.address)).eq(0)
    
    await rewardRouter.connect(user3).unstakeAndRedeemXlp(
      bnb.address,
      expandDecimals(1, 18),
      0,
      user3.address
    )

    // revertedWith("RewardTracker: burn amount exceeds balance")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await xlpVester.connect(user3).withdraw()

    expect(await stakedXlpTracker.balanceOf(user3.address)).eq("299100000000000000000")

    expect(await esGmx.balanceOf(user3.address)).gt(expandDecimals(1785 - 5, 18))
    expect(await esGmx.balanceOf(user3.address)).lt(expandDecimals(1787 - 5, 18))

    expect(await gmx.balanceOf(user3.address)).gt(expandDecimals(4, 18))
    expect(await gmx.balanceOf(user3.address)).lt(expandDecimals(6, 18))

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18))
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(2379, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(2381, 18))

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    await gmxVester.connect(user1).deposit(expandDecimals(365 * 2, 18))

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(743, 18)) // 1190 - 743 => 447
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(754, 18))

    expect(await gmxVester.claimable(user1.address)).eq(0)

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await gmxVester.claimable(user1.address)).gt("3900000000000000000") // 3.9
    expect(await gmxVester.claimable(user1.address)).lt("4100000000000000000") // 4.1

    await gmxVester.connect(user1).deposit(expandDecimals(365, 18))

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(522, 18)) // 743 - 522 => 221
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(524, 18))

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await gmxVester.claimable(user1.address)).gt("9900000000000000000") // 9.9
    expect(await gmxVester.claimable(user1.address)).lt("10100000000000000000") // 10.1

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    await gmxVester.connect(user1).claim()

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(214, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(216, 18))

    await gmxVester.connect(user1).deposit(expandDecimals(365, 18))
    expect(await gmxVester.balanceOf(user1.address)).gt(expandDecimals(1449, 18)) // 365 * 4 => 1460, 1460 - 10 => 1450
    expect(await gmxVester.balanceOf(user1.address)).lt(expandDecimals(1451, 18))
    expect(await gmxVester.getVestedAmount(user1.address)).eq(expandDecimals(1460, 18))

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(303, 18)) // 522 - 303 => 219
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(304, 18))

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await gmxVester.claimable(user1.address)).gt("7900000000000000000") // 7.9
    expect(await gmxVester.claimable(user1.address)).lt("8100000000000000000") // 8.1

    await gmxVester.connect(user1).withdraw()

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18))
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(222, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(224, 18))

    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(2360, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(2362, 18))

    await gmxVester.connect(user1).deposit(expandDecimals(365, 18))

    await increaseTime(provider, 500 * 24 * 60 * 60)
    await mineBlock(provider)

    expect(await gmxVester.claimable(user1.address)).eq(expandDecimals(365, 18))

    await gmxVester.connect(user1).withdraw()

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(222 + 365, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(224 + 365, 18))

    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(2360 - 365, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(2362 - 365, 18))

    expect(await gmxVester.transferredAverageStakedAmounts(user2.address)).eq(0)
    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.cumulativeRewards(user2.address)).gt(expandDecimals(892, 18))
    expect(await stakedGmxTracker.cumulativeRewards(user2.address)).lt(expandDecimals(893, 18))
    expect(await stakedGmxTracker.cumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await stakedGmxTracker.cumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await gmxVester.bonusRewards(user2.address)).eq(0)
    expect(await gmxVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1093, 18))
    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1884, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1886, 18))
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(574, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(575, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(892, 18))).gt(expandDecimals(545, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(892, 18))).lt(expandDecimals(546, 18))
    
    const esGmxBatchSender = await deployContract("EsGmxBatchSender", [esGmx.address])

    await timelock.signalSetHandler(esGmx.address, esGmxBatchSender.address, true)
    await timelock.signalSetHandler(gmxVester.address, esGmxBatchSender.address, true)
    await timelock.signalSetHandler(xlpVester.address, esGmxBatchSender.address, true)
    await timelock.signalMint(esGmx.address, wallet.address, expandDecimals(1000, 18))

    await increaseTime(provider, 20)
    await mineBlock(provider)
    
    await timelock.setHandler(esGmx.address, esGmxBatchSender.address, true)
    await timelock.setHandler(gmxVester.address, esGmxBatchSender.address, true)
    await timelock.setHandler(xlpVester.address, esGmxBatchSender.address, true)
    await timelock.processMint(esGmx.address, wallet.address, expandDecimals(1000, 18))

    await esGmxBatchSender.connect(wallet).send(
      gmxVester.address,
      4,
      [user2.address, user3.address],
      [expandDecimals(100, 18), expandDecimals(200, 18)]
    )
    
    expect(await gmxVester.transferredAverageStakedAmounts(user2.address)).gt(expandDecimals(37648, 18))
    expect(await gmxVester.transferredAverageStakedAmounts(user2.address)).lt(expandDecimals(37649, 18))

    // expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).gt(expandDecimals(12810, 18))
    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).gt(expandDecimals(12810 - 1, 18))
    
    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).lt(expandDecimals(12811, 18))
    expect(await gmxVester.transferredCumulativeRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892 + 200, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893 + 200, 18))
    expect(await gmxVester.bonusRewards(user2.address)).eq(0)
    expect(await gmxVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).gt(expandDecimals(3971, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).lt(expandDecimals(3972, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(7943, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(7944, 18))
    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1884 + 200, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1886 + 200, 18))
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(100, 18))).gt(expandDecimals(3971, 18))
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(100, 18))).lt(expandDecimals(3972, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(1884 + 200, 18))).gt(expandDecimals(7936, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(1884 + 200, 18))).lt(expandDecimals(7937, 18))
    expect(await xlpVester.transferredAverageStakedAmounts(user4.address)).eq(0)
    expect(await xlpVester.transferredCumulativeRewards(user4.address)).eq(0)
    expect(await xlpVester.bonusRewards(user4.address)).eq(0)
    expect(await xlpVester.getCombinedAverageStakedAmount(user4.address)).eq(0)
    expect(await xlpVester.getMaxVestableAmount(user4.address)).eq(0)
    expect(await xlpVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(0)
    
    await esGmxBatchSender.connect(wallet).send(
      xlpVester.address,
      320,
      [user4.address],
      [expandDecimals(10, 18)]
    )

    expect(await xlpVester.transferredAverageStakedAmounts(user4.address)).eq(expandDecimals(3200, 18))
    expect(await xlpVester.transferredCumulativeRewards(user4.address)).eq(expandDecimals(10, 18))
    expect(await xlpVester.bonusRewards(user4.address)).eq(0)
    expect(await xlpVester.getCombinedAverageStakedAmount(user4.address)).eq(expandDecimals(3200, 18))
    expect(await xlpVester.getMaxVestableAmount(user4.address)).eq(expandDecimals(10, 18))
    expect(await xlpVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(expandDecimals(3200, 18))

    await esGmxBatchSender.connect(wallet).send(
      xlpVester.address,
      320,
      [user4.address],
      [expandDecimals(10, 18)]
    )

    expect(await xlpVester.transferredAverageStakedAmounts(user4.address)).eq(expandDecimals(6400, 18))
    expect(await xlpVester.transferredCumulativeRewards(user4.address)).eq(expandDecimals(20, 18))
    expect(await xlpVester.bonusRewards(user4.address)).eq(0)
    expect(await xlpVester.getCombinedAverageStakedAmount(user4.address)).eq(expandDecimals(6400, 18))
    expect(await xlpVester.getMaxVestableAmount(user4.address)).eq(expandDecimals(20, 18))
    expect(await xlpVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(expandDecimals(3200, 18))
  })
  
  it("handleRewards", async () => {
    const rewardManagerV2 = await deployContract("RewardManager", [])
    const timelockV2 = await deployContract("Timelock", [
      wallet.address,
      10,
      rewardManagerV2.address,
      tokenManager.address,
      tokenManager.address,
      expandDecimals(1000000, 18),
      10,
      100
    ])

    // use new rewardRouter, use eth for weth
    const rewardRouterV3 = await deployContract("RewardRouterV3", [])
    
    // setFulfillController
    await fulfillController.setHandler(rewardRouterV3.address, true)
    await rewardRouterV3.setFulfillController(fulfillController.address)
    await timelock.signalSetHandler(xlpManager.address, rewardRouterV3.address, true)

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setHandler(xlpManager.address, rewardRouterV3.address, true)

    await rewardRouterV3.initialize(
      eth.address,
      gmx.address,
      esGmx.address,
      bnGmx.address,
      xlp.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      feeGmxTracker.address,
      feeXlpTracker.address,
      stakedXlpTracker.address,
      xlpManager.address,
      gmxVester.address,
      xlpVester.address
    )

    await rewardManagerV2.initialize(
      timelockV2.address,
      rewardRouterV3.address,
      xlpManager.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      feeGmxTracker.address,
      feeXlpTracker.address,
      stakedXlpTracker.address,
      stakedGmxDistributor.address,
      stakedXlpDistributor.address,
      esGmx.address,
      bnGmx.address,
      gmxVester.address,
      xlpVester.address
    )

    await timelock.signalSetGov(xlpManager.address, timelockV2.address)
    await timelock.signalSetGov(stakedGmxTracker.address, timelockV2.address)
    await timelock.signalSetGov(bonusGmxTracker.address, timelockV2.address)
    await timelock.signalSetGov(feeGmxTracker.address, timelockV2.address)
    await timelock.signalSetGov(feeXlpTracker.address, timelockV2.address)
    await timelock.signalSetGov(stakedXlpTracker.address, timelockV2.address)
    await timelock.signalSetGov(stakedGmxDistributor.address, timelockV2.address)
    await timelock.signalSetGov(stakedXlpDistributor.address, timelockV2.address)
    await timelock.signalSetGov(esGmx.address, timelockV2.address)
    await timelock.signalSetGov(bnGmx.address, timelockV2.address)
    await timelock.signalSetGov(gmxVester.address, timelockV2.address)
    await timelock.signalSetGov(xlpVester.address, timelockV2.address)

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setGov(xlpManager.address, timelockV2.address)
    await timelock.setGov(stakedGmxTracker.address, timelockV2.address)
    await timelock.setGov(bonusGmxTracker.address, timelockV2.address)
    await timelock.setGov(feeGmxTracker.address, timelockV2.address)
    await timelock.setGov(feeXlpTracker.address, timelockV2.address)
    await timelock.setGov(stakedXlpTracker.address, timelockV2.address)
    await timelock.setGov(stakedGmxDistributor.address, timelockV2.address)
    await timelock.setGov(stakedXlpDistributor.address, timelockV2.address)
    await timelock.setGov(esGmx.address, timelockV2.address)
    await timelock.setGov(bnGmx.address, timelockV2.address)
    await timelock.setGov(gmxVester.address, timelockV2.address)
    await timelock.setGov(xlpVester.address, timelockV2.address)

    await rewardManagerV2.updateEsGmxHandlers()
    await rewardManagerV2.enableRewardRouter()

    await eth.deposit({ value: expandDecimals(10, 18) })

    await gmx.setMinter(wallet.address, true)
    await gmx.mint(gmxVester.address, expandDecimals(10000, 18))
    await gmx.mint(xlpVester.address, expandDecimals(10000, 18))

    await eth.mint(feeXlpDistributor.address, expandDecimals(50, 18))
    await feeXlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await eth.mint(feeGmxDistributor.address, expandDecimals(50, 18))
    await feeGmxDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(rewardRouterV3.address, expandDecimals(1, 18))

    await rewardRouterV3.connect(user1).mintAndStakeXlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await gmx.mint(user1.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(200, 18))
    await rewardRouterV3.connect(user1).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).eq(0)
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await xlp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).eq(0)

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).eq(0)

    await rewardRouterV3.connect(user1).handleRewards(
      true, // _shouldClaimGmx
      true, // _shouldStakeGmx
      true, // _shouldClaimEsGmx
      true, // _shouldStakeEsGmx
      true, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).eq(0)
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await xlp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3571, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000") // 0.54
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000") // 0.56

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const ethBalance0 = await provider.getBalance(user1.address)

    await rewardRouterV3.connect(user1).handleRewards(
      false, // _shouldClaimGmx
      false, // _shouldStakeGmx
      false, // _shouldClaimEsGmx
      false, // _shouldStakeEsGmx
      false, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      true // _shouldConvertWethToEth
    )

    const ethBalance1 = await provider.getBalance(user1.address)

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).eq(0)
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await xlp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3571, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000") // 0.54
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000") // 0.56

    await rewardRouterV3.connect(user1).handleRewards(
      false, // _shouldClaimGmx
      false, // _shouldStakeGmx
      true, // _shouldClaimEsGmx
      false, // _shouldStakeEsGmx
      false, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(3571, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(3572, 18))
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await xlp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3571, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000") // 0.54
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000") // 0.56

    await gmxVester.connect(user1).deposit(expandDecimals(365, 18))
    await xlpVester.connect(user1).deposit(expandDecimals(365 * 2, 18))

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(3571 - 365 * 3, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(3572 - 365 * 3, 18))
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await xlp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3571, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000") // 0.54
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000") // 0.56

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouterV3.connect(user1).handleRewards(
      true, // _shouldClaimGmx
      false, // _shouldStakeGmx
      false, // _shouldClaimEsGmx
      false, // _shouldStakeEsGmx
      false, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await gmx.balanceOf(user1.address)).gt("2900000000000000000") // 2.9
    expect(await gmx.balanceOf(user1.address)).lt("3100000000000000000") // 3.1
    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(3571 - 365 * 3, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(3572 - 365 * 3, 18))
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await xlp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3571, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000") // 0.54
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000") // 0.56
  })
  
  it("StakedXlp", async () => {
    await eth.mint(feeXlpDistributor.address, expandDecimals(100, 18))
    await feeXlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(rewardRouter.address, expandDecimals(1, 18))

    await rewardRouter.connect(user1).mintAndStakeXlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXlpTracker.depositBalances(user1.address, xlp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXlpTracker.depositBalances(user1.address, feeXlpTracker.address)).eq(expandDecimals(2991, 17))

    const stakedXlp = await deployContract("StakedXlp", [xlp.address, xlpManager.address, stakedXlpTracker.address, feeXlpTracker.address])

    await expect(stakedXlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("StakedXlp: transfer amount exceeds allowance")

    await stakedXlp.connect(user1).approve(user2.address, expandDecimals(2991, 17))

    await expect(stakedXlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("StakedXlp: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(stakedXlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await timelock.signalSetHandler(stakedXlpTracker.address, stakedXlp.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(stakedXlpTracker.address, stakedXlp.address, true)

    await expect(stakedXlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await timelock.signalSetHandler(feeXlpTracker.address, stakedXlp.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(feeXlpTracker.address, stakedXlp.address, true)

    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXlpTracker.depositBalances(user1.address, xlp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXlpTracker.depositBalances(user1.address, feeXlpTracker.address)).eq(expandDecimals(2991, 17))

    expect(await feeXlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeXlpTracker.depositBalances(user3.address, xlp.address)).eq(0)

    expect(await stakedXlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedXlpTracker.depositBalances(user3.address, feeXlpTracker.address)).eq(0)

    await stakedXlp.connect(user2).transferFrom(user1.address, user3. address, expandDecimals(2991, 17))

    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq(0)
    expect(await feeXlpTracker.depositBalances(user1.address, xlp.address)).eq(0)

    expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq(0)
    expect(await stakedXlpTracker.depositBalances(user1.address, feeXlpTracker.address)).eq(0)

    expect(await feeXlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(2991, 17))
    expect(await feeXlpTracker.depositBalances(user3.address, xlp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXlpTracker.depositBalances(user3.address, feeXlpTracker.address)).eq(expandDecimals(2991, 17))

    await expect(stakedXlp.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(3000, 17)))
      .to.be.revertedWith("StakedXlp: transfer amount exceeds allowance")

    await stakedXlp.connect(user3).approve(user2.address, expandDecimals(3000, 17))

    await expect(stakedXlp.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(3000, 17)))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    await stakedXlp.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(1000, 17))

    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 17))
    expect(await feeXlpTracker.depositBalances(user1.address, xlp.address)).eq(expandDecimals(1000, 17))

    expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 17))
    expect(await stakedXlpTracker.depositBalances(user1.address, feeXlpTracker.address)).eq(expandDecimals(1000, 17))

    expect(await feeXlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(1991, 17))
    expect(await feeXlpTracker.depositBalances(user3.address, xlp.address)).eq(expandDecimals(1991, 17))

    expect(await stakedXlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(1991, 17))
    expect(await stakedXlpTracker.depositBalances(user3.address, feeXlpTracker.address)).eq(expandDecimals(1991, 17))

    await stakedXlp.connect(user3).transfer(user1.address, expandDecimals(1500, 17))

    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2500, 17))
    expect(await feeXlpTracker.depositBalances(user1.address, xlp.address)).eq(expandDecimals(2500, 17))

    expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2500, 17))
    expect(await stakedXlpTracker.depositBalances(user1.address, feeXlpTracker.address)).eq(expandDecimals(2500, 17))

    expect(await feeXlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(491, 17))
    expect(await feeXlpTracker.depositBalances(user3.address, xlp.address)).eq(expandDecimals(491, 17))

    expect(await stakedXlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(491, 17))
    expect(await stakedXlpTracker.depositBalances(user3.address, feeXlpTracker.address)).eq(expandDecimals(491, 17))

    await expect(stakedXlp.connect(user3).transfer(user1.address, expandDecimals(492, 17)))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    expect(await bnb.balanceOf(user1.address)).eq(0)

    await rewardRouter.connect(user1).unstakeAndRedeemXlp(
      bnb.address,
      expandDecimals(2500, 17),
      "830000000000000000", // 0.83
      user1.address
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await bnb.balanceOf(user1.address)).eq("830833333333333333")

    await usdx.addVault(xlpManager.address)

    expect(await bnb.balanceOf(user3.address)).eq("0")

    await rewardRouter.connect(user3).unstakeAndRedeemXlp(
      bnb.address,
      expandDecimals(491, 17),
      "160000000000000000", // 0.16
      user3.address
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await bnb.balanceOf(user3.address)).eq("163175666666666666")
  })

  it("FeeXlp", async () => {
    await eth.mint(feeXlpDistributor.address, expandDecimals(100, 18))
    await feeXlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(rewardRouter.address, expandDecimals(1, 18))

    await rewardRouter.connect(user1).mintAndStakeXlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXlpTracker.depositBalances(user1.address, xlp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXlpTracker.depositBalances(user1.address, feeXlpTracker.address)).eq(expandDecimals(2991, 17))

    const xlpBalance = await deployContract("XlpBalance", [xlpManager.address, stakedXlpTracker.address])

    await expect(xlpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("XlpBalance: transfer amount exceeds allowance")

    await xlpBalance.connect(user1).approve(user2.address, expandDecimals(2991, 17))

    await expect(xlpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("XlpBalance: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(xlpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds allowance")

    await timelock.signalSetHandler(stakedXlpTracker.address, xlpBalance.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(stakedXlpTracker.address, xlpBalance.address, true)

    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXlpTracker.depositBalances(user1.address, xlp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXlpTracker.depositBalances(user1.address, feeXlpTracker.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXlpTracker.balanceOf(user1.address)).eq(expandDecimals(2991, 17))

    expect(await feeXlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeXlpTracker.depositBalances(user3.address, xlp.address)).eq(0)

    expect(await stakedXlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedXlpTracker.depositBalances(user3.address, feeXlpTracker.address)).eq(0)
    expect(await stakedXlpTracker.balanceOf(user3.address)).eq(0)

    await xlpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17))

    expect(await feeXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeXlpTracker.depositBalances(user1.address, xlp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedXlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXlpTracker.depositBalances(user1.address, feeXlpTracker.address)).eq(expandDecimals(2991, 17))
    expect(await stakedXlpTracker.balanceOf(user1.address)).eq(0)

    expect(await feeXlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeXlpTracker.depositBalances(user3.address, xlp.address)).eq(0)

    expect(await stakedXlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedXlpTracker.depositBalances(user3.address, feeXlpTracker.address)).eq(0)
    expect(await stakedXlpTracker.balanceOf(user3.address)).eq(expandDecimals(2991, 17))

    await rewardRouter.connect(user1).unstakeAndRedeemXlp(
      bnb.address,
      expandDecimals(2991, 17),
      "0",
      user1.address
    )

    // revertedWith("RewardTracker: burn amount exceeds balance")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await xlpBalance.connect(user3).approve(user2.address, expandDecimals(3000, 17))

    await expect(xlpBalance.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(2992, 17)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds balance")

    await xlpBalance.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(2991, 17))

    expect(await bnb.balanceOf(user1.address)).eq(0)

    await rewardRouter.connect(user1).unstakeAndRedeemXlp(
      bnb.address,
      expandDecimals(2991, 17),
      "0",
      user1.address
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await bnb.balanceOf(user1.address)).eq("994009000000000000")
  })
})
