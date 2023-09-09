const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, increaseBlocktime, mineBlock, reportGasUsed } = require("../../shared/utilities")
const { toXOraclePrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, validateVaultBalance, tokenIndexs } = require("./helpers")
const { deployXOracle, getPriceFeed } = require("../../shared/xOracle")

use(solidity)

describe("Vault.getFeeBasisPoints", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultPriceFeed
  let usdg
  let router
  let bnb
  let btc
  let dai
  let distributor0
  let yieldTracker0
  let fulfillController

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    btc = await deployContract("Token", [])
    dai = await deployContract("Token", [])

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
    await fulfillController.setController(wallet.address, true)

    // deposit req fund to fulfillController
    await bnb.mint(fulfillController.address, ethers.utils.parseEther("1.0"))

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT

    await vault.setFees(
      50, // _taxBasisPoints
      10, // _stableTaxBasisPoints
      20, // _mintBurnFeeBasisPoints
      30, // _swapFeeBasisPoints
      4, // _stableSwapFeeBasisPoints
      10, // _marginFeeBasisPoints
      toUsd(5), // _liquidationFeeUsd
      0, // _minProfitTime
      true // _hasDynamicFees
    )
  })

  it("getFeeBasisPoints", async () => {
    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 } 
    ], 0)
    await vault.setTokenConfig(...getBnbConfig(bnb))
    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(0)

    await bnb.mint(vault.address, 100)
    await vault.connect(user0).buyUSDG(bnb.address, wallet.address)

    expect(await vault.usdgAmounts(bnb.address)).eq(29700)
    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(29700)

    // usdgAmount(bnb) is 29700, targetAmount(bnb) is 29700
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, true)).eq(100)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, true)).eq(104)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, false)).eq(100)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, false)).eq(104)

    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 50, 100, true)).eq(51)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 50, 100, true)).eq(58)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 50, 100, false)).eq(51)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 50, 100, false)).eq(58)

    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: (await getBlockTime(provider)) + 24 * 60 * 60 } // set permanent price
    ], 0)
		await vault.setTokenConfig(...getDaiConfig(dai))

    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(14850)
    expect(await vault.getTargetUsdgAmount(dai.address)).eq(14850)

    // usdgAmount(bnb) is 29700, targetAmount(bnb) is 14850
    // incrementing bnb has an increased fee, while reducing bnb has a decreased fee
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 20000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, false)).eq(50)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, false)).eq(50)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 100, 50, false)).eq(50)
    expect(await vault.getFeeBasisPoints(bnb.address, 20000, 100, 50, false)).eq(50)
    expect(await vault.getFeeBasisPoints(bnb.address, 25000, 100, 50, false)).eq(50)
    expect(await vault.getFeeBasisPoints(bnb.address, 100000, 100, 50, false)).eq(150)

    await dai.mint(vault.address, 20000)
    await vault.connect(user0).buyUSDG(dai.address, wallet.address)

    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(24850)
    expect(await vault.getTargetUsdgAmount(dai.address)).eq(24850)

    const bnbConfig = getBnbConfig(bnb)
    bnbConfig[2] = 30000
    await vault.setTokenConfig(...bnbConfig)

    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(37275)
    expect(await vault.getTargetUsdgAmount(dai.address)).eq(12425)

    expect(await vault.usdgAmounts(bnb.address)).eq(29700)

    // usdgAmount(bnb) is 29700, targetAmount(bnb) is 37270
    // incrementing bnb has a decreased fee, while reducing bnb has an increased fee
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, true)).eq(90)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, true)).eq(90)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 100, 50, true)).eq(90)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, false)).eq(110)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, false)).eq(113)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 100, 50, false)).eq(116)

    bnbConfig[2] = 5000
    await vault.setTokenConfig(...bnbConfig)

    await bnb.mint(vault.address, 200)
    await vault.connect(user0).buyUSDG(bnb.address, wallet.address)

    expect(await vault.usdgAmounts(bnb.address)).eq(89100)
    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(36366)
    expect(await vault.getTargetUsdgAmount(dai.address)).eq(72733)

    // usdgAmount(bnb) is 88800, targetAmount(bnb) is 36266
    // incrementing bnb has an increased fee, while reducing bnb has a decreased fee
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, false)).eq(28)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, false)).eq(28)
    expect(await vault.getFeeBasisPoints(bnb.address, 20000, 100, 50, false)).eq(28)
    expect(await vault.getFeeBasisPoints(bnb.address, 50000, 100, 50, false)).eq(28)
    expect(await vault.getFeeBasisPoints(bnb.address, 80000, 100, 50, false)).eq(28)

    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 50, 100, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 50, 100, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 50, 100, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 50, 100, false)).eq(0)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 50, 100, false)).eq(0)
    expect(await vault.getFeeBasisPoints(bnb.address, 20000, 50, 100, false)).eq(0)
    expect(await vault.getFeeBasisPoints(bnb.address, 50000, 50, 100, false)).eq(0)
  })
})
