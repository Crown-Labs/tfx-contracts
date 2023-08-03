const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed } = require("../../shared/utilities")
const { toXOraclePrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("./helpers")
const { deployXOracle, getPriceFeed } = require("../../shared/xOracle")

use(solidity)

describe("Vault.sellUSDG", function () {
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
  let xOracle
  let fulfillController 

  let glpManager
  let glp

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
    xOracle = await deployXOracle();
    const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

    // deploy fulfillController
    fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address, 0])

    // send fund to fulfillController
    await wallet.sendTransaction({ to: fulfillController.address, value: ethers.utils.parseEther("1.0") })

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT

    // set fulfillController
    await fulfillController.setController(wallet.address, true)
    await fulfillController.setHandler(router.address, true)
    await router.setFulfillController(fulfillController.address)

    glp = await deployContract("GLP", [])
    glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, 24 * 60 * 60])
  })

  it("sellUSDG", async () => {
    await expect(vault.connect(user0).sellUSDG(bnb.address, user1.address))
      .to.be.revertedWith("Vault: _token not whitelisted")

    await vault.setTokenConfig(...getBnbConfig(bnb))
		await vault.setTokenConfig(...getBtcConfig(btc))

    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await bnb.mint(user0.address, 100)

    expect(await glpManager.getAumInUsdg(true)).eq(0)
    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(0)
    expect(await vault.usdgAmounts(bnb.address)).eq(0)
    expect(await vault.poolAmounts(bnb.address)).eq(0)
    expect(await bnb.balanceOf(user0.address)).eq(100)
    await bnb.connect(user0).transfer(vault.address, 100)
    await vault.connect(user0).buyUSDG(bnb.address, user0.address)
    expect(await usdg.balanceOf(user0.address)).eq(29700)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(1)
    expect(await vault.usdgAmounts(bnb.address)).eq(29700)
    expect(await vault.poolAmounts(bnb.address)).eq(100 - 1)
    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await glpManager.getAumInUsdg(true)).eq(29700)

    await expect(vault.connect(user0).sellUSDG(bnb.address, user1.address))
      .to.be.revertedWith("Vault: invalid usdgAmount")

    await usdg.connect(user0).transfer(vault.address, 15000)

    await expect(vault.connect(user0).sellUSDG(btc.address, user1.address))
      .to.be.revertedWith("Vault: invalid redemptionAmount")

    await vault.setInManagerMode(true)
    await expect(vault.connect(user0).sellUSDG(bnb.address, user1.address))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setManager(user0.address, true)

    const tx = await vault.connect(user0).sellUSDG(bnb.address, user1.address, { gasPrice: "10000000000" } )
    await reportGasUsed(provider, tx, "sellUSDG gas used")
    expect(await usdg.balanceOf(user0.address)).eq(29700 - 15000)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(2)
    expect(await vault.usdgAmounts(bnb.address)).eq(29700 - 15000)
    expect(await vault.poolAmounts(bnb.address)).eq(100 - 1 - 50)
    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(user1.address)).eq(50 - 1) // (15000 / 300) => 50
    expect(await glpManager.getAumInUsdg(true)).eq(29700 - 15000)
  })

  it("sellUSDG after a price increase", async () => {
    await vault.setTokenConfig(...getBnbConfig(bnb))

    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await bnb.mint(user0.address, 100)

    expect(await glpManager.getAumInUsdg(true)).eq(0)
    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(0)
    expect(await vault.usdgAmounts(bnb.address)).eq(0)
    expect(await vault.poolAmounts(bnb.address)).eq(0)
    expect(await bnb.balanceOf(user0.address)).eq(100)
    await bnb.connect(user0).transfer(vault.address, 100)
    await vault.connect(user0).buyUSDG(bnb.address, user0.address)

    expect(await usdg.balanceOf(user0.address)).eq(29700)
    expect(await usdg.balanceOf(user1.address)).eq(0)

    expect(await vault.feeReserves(bnb.address)).eq(1)
    expect(await vault.usdgAmounts(bnb.address)).eq(29700)
    expect(await vault.poolAmounts(bnb.address)).eq(100 - 1)
    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await glpManager.getAumInUsdg(true)).eq(29700)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(400), lastUpdate: 0 }
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(600), lastUpdate: 0 }
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(500), lastUpdate: 0 }
    ], 0)

    expect(await glpManager.getAumInUsdg(false)).eq(39600)

    await usdg.connect(user0).transfer(vault.address, 15000)
    await vault.connect(user0).sellUSDG(bnb.address, user1.address)

    expect(await usdg.balanceOf(user0.address)).eq(29700 - 15000)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(2)
    expect(await vault.usdgAmounts(bnb.address)).eq(29700 - 15000)
    expect(await vault.poolAmounts(bnb.address)).eq(100 - 1 - 25)
    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(user1.address)).eq(25 - 1) // (15000 / 600) => 25
    expect(await glpManager.getAumInUsdg(false)).eq(29600)
  })

  it("sellUSDG redeem based on price", async () => {
		await vault.setTokenConfig(...getBtcConfig(btc))

    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
    ], 0)

    await btc.mint(user0.address, expandDecimals(2, 8))

    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(btc.address)).eq(0)
    expect(await vault.usdgAmounts(btc.address)).eq(0)
    expect(await vault.poolAmounts(btc.address)).eq(0)
    expect(await btc.balanceOf(user0.address)).eq(expandDecimals(2, 8))

    expect(await glpManager.getAumInUsdg(true)).eq(0)
    await btc.connect(user0).transfer(vault.address, expandDecimals(2, 8))
    await vault.connect(user0).buyUSDG(btc.address, user0.address)
    expect(await glpManager.getAumInUsdg(true)).eq("119640000000000000000000") // 119,640

    expect(await usdg.balanceOf(user0.address)).eq("119640000000000000000000") // 119,640
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(btc.address)).eq("600000") // 0.006 BTC, 2 * 0.03%
    expect(await vault.usdgAmounts(btc.address)).eq("119640000000000000000000") // 119,640
    expect(await vault.poolAmounts(btc.address)).eq("199400000") // 1.994 BTC
    expect(await btc.balanceOf(user0.address)).eq(0)
    expect(await btc.balanceOf(user1.address)).eq(0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(82000), lastUpdate: 0 },
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(80000), lastUpdate: 0 },
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(83000), lastUpdate: 0 },
    ], 0)

    expect(await glpManager.getAumInUsdg(false)).eq(expandDecimals(159520, 18)) // 199400000 / (10 ** 8) * 80,000
    await usdg.connect(user0).transfer(vault.address, expandDecimals(10000, 18))
    await vault.connect(user0).sellUSDG(btc.address, user1.address)

    expect(await btc.balanceOf(user1.address)).eq("12012047") // 0.12012047 BTC, 0.12012047 * 83000 => 9969.999
    expect(await vault.feeReserves(btc.address)).eq("636145") // 0.00636145
    expect(await vault.poolAmounts(btc.address)).eq("187351808") // 199400000-(636145-600000)-12012047 => 187351808
    expect(await glpManager.getAumInUsdg(false)).eq("149881446400000000000000") // 149881.4464, 187351808 / (10 ** 8) * 80,000
  })

  it("sellUSDG for stableTokens", async () => {
    await vault.setFees(
      50, // _taxBasisPoints
      10, // _stableTaxBasisPoints
      4, // _mintBurnFeeBasisPoints
      30, // _swapFeeBasisPoints
      4, // _stableSwapFeeBasisPoints
      10, // _marginFeeBasisPoints
      toUsd(5), // _liquidationFeeUsd
      0, // _minProfitTime
      false // _hasDynamicFees
    )

		await vault.setTokenConfig(...getDaiConfig(dai))

    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
    ], 0)

    await dai.mint(user0.address, expandDecimals(10000, 18))

    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(dai.address)).eq(0)
    expect(await vault.usdgAmounts(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq(0)
    expect(await dai.balanceOf(user0.address)).eq(expandDecimals(10000, 18))
    expect(await glpManager.getAumInUsdg(true)).eq(0)

    await dai.connect(user0).transfer(vault.address, expandDecimals(10000, 18))
    await vault.connect(user0).buyUSDG(dai.address, user0.address)

    expect(await glpManager.getAumInUsdg(true)).eq(expandDecimals(9996, 18))
    expect(await usdg.balanceOf(user0.address)).eq(expandDecimals(9996, 18))
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(dai.address)).eq(expandDecimals(4, 18))
    expect(await vault.usdgAmounts(dai.address)).eq(expandDecimals(9996, 18))
    expect(await vault.poolAmounts(dai.address)).eq(expandDecimals(9996, 18))
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await dai.balanceOf(user1.address)).eq(0)

		await vault.setTokenConfig(...getBtcConfig(btc))

    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(5000), lastUpdate: 0 },
    ], 0)

    await btc.mint(user0.address, expandDecimals(1, 8))

    expect(await dai.balanceOf(user2.address)).eq(0)

    await btc.connect(user0).transfer(vault.address, expandDecimals(1, 8))
    await vault.connect(user0).swap(btc.address, dai.address, user2.address)

    expect(await glpManager.getAumInUsdg(true)).eq(expandDecimals(9996, 18))

    expect(await vault.feeReserves(dai.address)).eq(expandDecimals(19, 18))
    expect(await vault.usdgAmounts(dai.address)).eq(expandDecimals(4996, 18))
    expect(await vault.poolAmounts(dai.address)).eq(expandDecimals(4996, 18))

    expect(await vault.feeReserves(btc.address)).eq(0)
    expect(await vault.usdgAmounts(btc.address)).eq(expandDecimals(5000, 18))
    expect(await vault.poolAmounts(btc.address)).eq(expandDecimals(1, 8))

    expect(await dai.balanceOf(user2.address)).eq(expandDecimals(4985, 18))

    await usdg.connect(user0).approve(router.address, expandDecimals(5000, 18))
    await router.connect(user0).swap([usdg.address, dai.address], expandDecimals(5000, 18), 0, user3.address)
    // revertedWith("Vault: poolAmount exceeded")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(5000), lastUpdate: 0 },
    ], 0)

    expect(await dai.balanceOf(user3.address)).eq(0)

    await usdg.connect(user0).approve(router.address, expandDecimals(4000, 18))
    await router.connect(user0).swap([usdg.address, dai.address], expandDecimals(4000, 18), 0, user3.address)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(5000), lastUpdate: 0 },
    ], 0)

    expect(await dai.balanceOf(user3.address)).eq("3998400000000000000000") // 3998.4
    expect(await vault.feeReserves(dai.address)).eq("20600000000000000000") // 20.6
    expect(await vault.usdgAmounts(dai.address)).eq(expandDecimals(996, 18))
    expect(await vault.poolAmounts(dai.address)).eq(expandDecimals(996, 18))
    expect(await glpManager.getAumInUsdg(true)).eq(expandDecimals(5996, 18))
  })
})
