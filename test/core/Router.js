const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed, newWallet } = require("../shared/utilities")
const { toXOraclePrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("./Vault/helpers")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")

use(solidity)

describe("Router", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let usdg
  let router
  let vaultPriceFeed
  let bnb
  let btc
  let eth
  let dai
  let busd
  let busdPriceFeed
  let distributor0
  let yieldTracker0
  let reader
  let xOracle
  let fulfillController

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    btc = await deployContract("Token", [])
    eth = await deployContract("Token", [])
    dai = await deployContract("Token", [])
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

    reader = await deployContract("Reader", [])

    // deploy xOracle
    xOracle = await deployXOracle();
    const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

    // deploy fulfillController
    fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address])

    // set fulfillController
    await fulfillController.setController(wallet.address, true)
    await fulfillController.setHandler(router.address, true)
    await router.setFulfillController(fulfillController.address)

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT

    // set vault
		await vault.setTokenConfig(...getDaiConfig(dai))
		await vault.setTokenConfig(...getBtcConfig(btc))
    await vault.setTokenConfig(...getBnbConfig(bnb))

    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await bnb.connect(user3).deposit({ value: expandDecimals(100, 18) })
  })

  it("setGov", async () => {
    await expect(router.connect(user0).setGov(user1.address))
      .to.be.revertedWith("Router: forbidden")

    expect(await router.gov()).eq(wallet.address)

    await router.setGov(user0.address)
    expect(await router.gov()).eq(user0.address)

    await router.connect(user0).setGov(user1.address)
    expect(await router.gov()).eq(user1.address)
  })

  it("addPlugin", async () => {
    await expect(router.connect(user0).addPlugin(user1.address))
      .to.be.revertedWith("Router: forbidden")

    await router.setGov(user0.address)

    expect(await router.plugins(user1.address)).eq(false)
    await router.connect(user0).addPlugin(user1.address)
    expect(await router.plugins(user1.address)).eq(true)
  })

  it("removePlugin", async () => {
    await expect(router.connect(user0).removePlugin(user1.address))
      .to.be.revertedWith("Router: forbidden")

    await router.setGov(user0.address)

    expect(await router.plugins(user1.address)).eq(false)
    await router.connect(user0).addPlugin(user1.address)
    expect(await router.plugins(user1.address)).eq(true)
    await router.connect(user0).removePlugin(user1.address)
    expect(await router.plugins(user1.address)).eq(false)
  })

  it("approvePlugin", async () => {
    expect(await router.approvedPlugins(user0.address, user1.address)).eq(false)
    await router.connect(user0).approvePlugin(user1.address)
    expect(await router.approvedPlugins(user0.address, user1.address)).eq(true)
  })

  it("denyPlugin", async () => {
    expect(await router.approvedPlugins(user0.address, user1.address)).eq(false)
    await router.connect(user0).approvePlugin(user1.address)
    expect(await router.approvedPlugins(user0.address, user1.address)).eq(true)
    await router.connect(user0).denyPlugin(user1.address)
    expect(await router.approvedPlugins(user0.address, user1.address)).eq(false)
  })

  it("pluginTransfer", async () => {
    await router.addPlugin(user1.address)
    await router.connect(user0).approvePlugin(user1.address)

    await dai.mint(user0.address, 2000)
    await dai.connect(user0).approve(router.address, 1000)
    expect(await dai.allowance(user0.address, router.address)).eq(1000)
    expect(await dai.balanceOf(user2.address)).eq(0)
    await router.connect(user1).pluginTransfer(dai.address, user0.address, user2.address, 800)
    expect(await dai.allowance(user0.address, router.address)).eq(200)
    expect(await dai.balanceOf(user2.address)).eq(800)

    await expect(router.connect(user2).pluginTransfer(dai.address, user0.address, user2.address, 1))
      .to.be.revertedWith("Router: invalid plugin")
    await router.addPlugin(user2.address)
    await expect(router.connect(user2).pluginTransfer(dai.address, user0.address, user2.address, 1))
      .to.be.revertedWith("Router: plugin not approved")
  })

  it("pluginIncreasePosition", async () => {
    await router.addPlugin(user1.address)
    await router.connect(user0).approvePlugin(user1.address)

    await expect(router.connect(user1).pluginIncreasePosition(user0.address, bnb.address, bnb.address, 1000, true))
      .to.be.revertedWith("Vault: insufficient collateral for fees")

    await expect(router.connect(user2).pluginIncreasePosition(user0.address, bnb.address, bnb.address, 1000, true))
      .to.be.revertedWith("Router: invalid plugin")
    await router.addPlugin(user2.address)
    await expect(router.connect(user2).pluginIncreasePosition(user0.address, bnb.address, bnb.address, 1000, true))
      .to.be.revertedWith("Router: plugin not approved")
  })

  it("pluginDecreasePosition", async () => {
    await router.addPlugin(user1.address)
    await router.connect(user0).approvePlugin(user1.address)

    await expect(router.connect(user1).pluginDecreasePosition(user0.address, bnb.address, bnb.address, 100, 1000, true, user0.address))
      .to.be.revertedWith("Vault: empty position")

    await expect(router.connect(user2).pluginDecreasePosition(user0.address, bnb.address, bnb.address, 100, 1000, true, user0.address))
      .to.be.revertedWith("Router: invalid plugin")
    await router.addPlugin(user2.address)
    await expect(router.connect(user2).pluginDecreasePosition(user0.address, bnb.address, bnb.address, 100, 1000, true, user0.address))
      .to.be.revertedWith("Router: plugin not approved")
  })

  it("swap, buy USDG", async () => {
    await vaultPriceFeed.getPrice(dai.address, true, true)
    await dai.mint(user0.address, expandDecimals(200, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))

    await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(200, 18), expandDecimals(201, 18), user0.address)
    // revertedWith("Router: insufficient amountOut")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await dai.balanceOf(user0.address)).eq(expandDecimals(200, 18))
    expect(await usdg.balanceOf(user0.address)).eq(0)
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))

    const tx = await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(200, 18), expandDecimals(199, 18), user0.address)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await reportGasUsed(provider, tx, "buyUSDG gas used")
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user0.address)).eq("199400000000000000000") // 199.4
  })

  it("swap, sell USDG", async () => {
    await dai.mint(user0.address, expandDecimals(200, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))

    await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(200, 18), expandDecimals(201, 18), user0.address)
    // revertedWith("Router: insufficient amountOut")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await dai.balanceOf(user0.address)).eq(expandDecimals(200, 18))
    expect(await usdg.balanceOf(user0.address)).eq(0)

    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))
    
    const tx = await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(200, 18), expandDecimals(199, 18), user0.address)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await reportGasUsed(provider, tx, "sellUSDG gas used")
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user0.address)).eq("199400000000000000000") // 199.4

    await usdg.connect(user0).approve(router.address, expandDecimals(100, 18))
    await router.connect(user0).swap([usdg.address, dai.address], expandDecimals(100, 18), expandDecimals(100, 18), user0.address)
    // revertedWith("Router: insufficient amountOut")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await usdg.connect(user0).approve(router.address, expandDecimals(100, 18))
    await router.connect(user0).swap([usdg.address, dai.address], expandDecimals(100, 18), expandDecimals(99, 18), user0.address)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await dai.balanceOf(user0.address)).eq("99700000000000000000") // 99.7
    expect(await usdg.balanceOf(user0.address)).eq("99400000000000000000") // 99.4
  })
  
  it("swap, path.length == 2", async () => {
    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    
    await router.connect(user0).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(60000, 18), user0.address)
    // revertedWith("Router: insufficient amountOut")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    await router.connect(user0).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(59000, 18), user0.address)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await dai.mint(user0.address, expandDecimals(30000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(30000, 18))

    await router.connect(user0).swap([dai.address, btc.address], expandDecimals(30000, 18), "50000000", user0.address)
    // revertedWith("Router: insufficient amountOut")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await dai.balanceOf(user0.address)).eq(expandDecimals(30000, 18))
    expect(await btc.balanceOf(user0.address)).eq(0)

    await dai.connect(user0).approve(router.address, expandDecimals(30000, 18))
    const tx = await router.connect(user0).swap([dai.address, btc.address], expandDecimals(30000, 18), "49000000", user0.address)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await reportGasUsed(provider, tx, "swap gas used")
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await btc.balanceOf(user0.address)).eq("49850000") // 0.4985
  })

  it("swap, path.length == 3", async () => {
    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    await router.connect(user0).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(59000, 18), user0.address)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await dai.mint(user0.address, expandDecimals(30000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(30000, 18))
    await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(30000, 18), expandDecimals(29000, 18), user0.address)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await usdg.connect(user0).approve(router.address, expandDecimals(20000, 18))

    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user0.address)).eq(expandDecimals(89730, 18))

    await router.connect(user0).swap([usdg.address, dai.address, usdg.address], expandDecimals(20000, 18), expandDecimals(20000, 18), user0.address)
    // revertedWith("Router: insufficient amountOut")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await usdg.connect(user0).approve(router.address, expandDecimals(20000, 18))
    await router.connect(user0).swap([usdg.address, dai.address, usdg.address], expandDecimals(20000, 18), expandDecimals(19000, 18), user0.address)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user0.address)).eq("89610180000000000000000") // 89610.18

    await usdg.connect(user0).approve(router.address, expandDecimals(40000, 18))
    // this reverts as some DAI has been transferred from the pool to the fee reserve
    await router.connect(user0).swap([usdg.address, dai.address, btc.address], expandDecimals(30000, 18), expandDecimals(39000, 18), user0.address)
    // revertedWith("Vault: poolAmount exceeded")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await vault.poolAmounts(dai.address)).eq("29790180000000000000000") // 29790.18
    expect(await vault.feeReserves(dai.address)).eq("209820000000000000000") // 209.82

    await usdg.connect(user0).approve(router.address, expandDecimals(40000, 18))
    await router.connect(user0).swap([usdg.address, dai.address, btc.address], expandDecimals(20000, 18), "34000000", user0.address)
    // revertedWith("Router: insufficient amountOut")
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await usdg.connect(user0).approve(router.address, expandDecimals(40000, 18))
    const tx = await router.connect(user0).swap([usdg.address, dai.address, btc.address], expandDecimals(20000, 18), "33000000", user0.address)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await reportGasUsed(provider, tx, "swap gas used")
    expect(await usdg.balanceOf(user0.address)).eq("69610180000000000000000") // 69610.18
    expect(await btc.balanceOf(user0.address)).eq("33133633") // 0.33133633 BTC
  })
})
