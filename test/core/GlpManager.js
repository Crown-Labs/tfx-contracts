const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed, newWallet } = require("../shared/utilities")
const { toXOraclePrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("./Vault/helpers")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")

use(solidity)

describe("GlpManager", function () {
  const provider = waffle.provider
  const [wallet, rewardRouter, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultPositionController
  let glpManager
  let glp
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
    glp = await deployContract("GLP", [])

    await initVault(vault, vaultPositionController, router, usdg, vaultPriceFeed)
    glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, 24 * 60 * 60])

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
    fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address, 0])

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

    await glp.setInPrivateTransferMode(true)
    await glp.setMinter(glpManager.address, true)

    await vault.setInManagerMode(true)
  })

  it("inits", async () => {
    expect(await glpManager.gov()).eq(wallet.address)
    expect(await glpManager.vault()).eq(vault.address)
    expect(await glpManager.usdg()).eq(usdg.address)
    expect(await glpManager.glp()).eq(glp.address)
    expect(await glpManager.cooldownDuration()).eq(24 * 60 * 60)
  })

  it("setGov", async () => {
    await expect(glpManager.connect(user0).setGov(user1.address))
      .to.be.revertedWith("Governable: forbidden")

    expect(await glpManager.gov()).eq(wallet.address)

    await glpManager.setGov(user0.address)
    expect(await glpManager.gov()).eq(user0.address)

    await glpManager.connect(user0).setGov(user1.address)
    expect(await glpManager.gov()).eq(user1.address)
  })

  it("setHandler", async () => {
    await expect(glpManager.connect(user0).setHandler(user1.address, true))
      .to.be.revertedWith("Governable: forbidden")

    expect(await glpManager.gov()).eq(wallet.address)
    await glpManager.setGov(user0.address)
    expect(await glpManager.gov()).eq(user0.address)

    expect(await glpManager.isHandler(user1.address)).eq(false)
    await glpManager.connect(user0).setHandler(user1.address, true)
    expect(await glpManager.isHandler(user1.address)).eq(true)
  })

  it("setCooldownDuration", async () => {
    await expect(glpManager.connect(user0).setCooldownDuration(1000))
      .to.be.revertedWith("Governable: forbidden")

    await glpManager.setGov(user0.address)

    await expect(glpManager.connect(user0).setCooldownDuration(48 * 60 * 60 + 1))
      .to.be.revertedWith("GlpManager: invalid _cooldownDuration")

    expect(await glpManager.cooldownDuration()).eq(24 * 60 * 60)
    await glpManager.connect(user0).setCooldownDuration(48 * 60 * 60)
    expect(await glpManager.cooldownDuration()).eq(48 * 60 * 60)
  })

  it("setAumAdjustment", async () => {
    await expect(glpManager.connect(user0).setAumAdjustment(29, 17))
      .to.be.revertedWith("Governable: forbidden")

    await glpManager.setGov(user0.address)

    expect(await glpManager.aumAddition()).eq(0)
    expect(await glpManager.aumDeduction()).eq(0)
    expect(await glpManager.getAum(true, false)).eq(0)
    await glpManager.connect(user0).setAumAdjustment(29, 17)
    expect(await glpManager.aumAddition()).eq(29)
    expect(await glpManager.aumDeduction()).eq(17)
    expect(await glpManager.getAum(true, false)).eq(12)
  })

  it("addLiquidity, removeLiquidity", async () => {
    await dai.mint(user0.address, expandDecimals(100, 18))
    await dai.connect(user0).approve(glpManager.address, expandDecimals(100, 18))

    await glpManager.setFulfillController(user0.address)

    await expect(glpManager.connect(user0).handlerAddLiquidity(
      user0.address,
      user0.address,
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(101, 18),
      expandDecimals(101, 18)
    )).to.be.revertedWith("Vault: forbidden")

    await vault.setManager(glpManager.address, true)

    await expect(glpManager.connect(user0).handlerAddLiquidity(
      user0.address,
      user0.address,
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(101, 18),
      expandDecimals(101, 18)
    )).to.be.revertedWith("GlpManager: insufficient USDG output")

    await glpManager.setFulfillController(fulfillController.address)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    expect(await dai.balanceOf(user0.address)).eq(expandDecimals(100, 18))
    expect(await dai.balanceOf(vault.address)).eq(0)
    expect(await usdg.balanceOf(glpManager.address)).eq(0)
    expect(await glp.balanceOf(user0.address)).eq(0)
    expect(await glpManager.lastAddedAt(user0.address)).eq(0)
    expect(await glpManager.getAumInUsdg(true)).eq(0)

    const tx0 = await glpManager.connect(user0).addLiquidity(
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(99, 18),
      expandDecimals(99, 18)
    )
    await reportGasUsed(provider, tx0, "addLiquidity gas used")

    await increaseBlocktime(provider, 10)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(400), lastUpdate: 0 }
    ], 0)

    let blockTime = await getBlockTime(provider)

    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await dai.balanceOf(vault.address)).eq(expandDecimals(100, 18))
    expect(await usdg.balanceOf(glpManager.address)).eq("99700000000000000000") // 99.7
    expect(await glp.balanceOf(user0.address)).eq("99700000000000000000")
    expect(await glp.totalSupply()).eq("99700000000000000000")
    expect(await glpManager.lastAddedAt(user0.address)).eq(blockTime)

    expect(await glpManager.getAumInUsdg(true)).eq("99700000000000000000")
    expect(await glpManager.getAumInUsdg(false)).eq("99700000000000000000")

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(glpManager.address, expandDecimals(1, 18))

    await glpManager.connect(user1).addLiquidity(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(400), lastUpdate: 0 }
    ], 0)

    blockTime = await getBlockTime(provider)

    expect(await usdg.balanceOf(glpManager.address)).eq("398800000000000000000") // 398.8
    expect(await glp.balanceOf(user0.address)).eq("99700000000000000000") // 99.7
    expect(await glp.balanceOf(user1.address)).eq("299100000000000000000") // 299.1
    expect(await glp.totalSupply()).eq("398800000000000000000")
    expect(await glpManager.lastAddedAt(user1.address)).eq(blockTime)
    expect(await glpManager.getAumInUsdg(true)).eq("498500000000000000000")
    expect(await glpManager.getAumInUsdg(false)).eq("398800000000000000000")

    await expect(glp.connect(user1).transfer(user2.address, expandDecimals(1, 18)))
      .to.be.revertedWith("BaseToken: msg.sender not whitelisted")

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(400), lastUpdate: 0 }
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(400), lastUpdate: 0 }
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(500), lastUpdate: 0 }
    ], 0)

    expect(await glpManager.getAumInUsdg(true)).eq("598200000000000000000") // 598.2
    expect(await glpManager.getAumInUsdg(false)).eq("498500000000000000000") // 498.5

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(400), lastUpdate: 0 }
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(400), lastUpdate: 0 }
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(500), lastUpdate: 0 }
    ], 0)

    await btc.mint(user2.address, "1000000") // 0.01 BTC, $500
    await btc.connect(user2).approve(glpManager.address, expandDecimals(1, 18))

    await glpManager.setFulfillController(user2.address)

    await expect(glpManager.connect(user2).handlerAddLiquidity(
      user2.address,
      user2.address,
      btc.address,
      "1000000",
      expandDecimals(599, 18),
      expandDecimals(399, 18)
    )).to.be.revertedWith("GlpManager: insufficient USDG output")

    await expect(glpManager.connect(user2).handlerAddLiquidity(
      user2.address,
      user2.address,
      btc.address,
      "1000000",
      expandDecimals(598, 18),
      expandDecimals(399, 18)
    )).to.be.revertedWith("GlpManager: insufficient GLP output")

    await glpManager.setFulfillController(fulfillController.address)

    await glpManager.connect(user2).addLiquidity(
      btc.address,
      "1000000",
      expandDecimals(598, 18),
      expandDecimals(398, 18)
    )

    await increaseBlocktime(provider, 10)
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(500), lastUpdate: 0 }
    ], 0)

    blockTime = await getBlockTime(provider)

    expect(await usdg.balanceOf(glpManager.address)).eq("997000000000000000000") // 997
    expect(await glp.balanceOf(user0.address)).eq("99700000000000000000") // 99.7
    expect(await glp.balanceOf(user1.address)).eq("299100000000000000000") // 299.1
    expect(await glp.balanceOf(user2.address)).eq("398800000000000000000") // 398.8
    expect(await glp.totalSupply()).eq("797600000000000000000") // 797.6
    expect(await glpManager.lastAddedAt(user2.address)).eq(blockTime)

    expect(await glpManager.getAumInUsdg(true)).eq("1196400000000000000000") // 1196.4
    expect(await glpManager.getAumInUsdg(false)).eq("1096700000000000000000") // 1096.7

    await glpManager.setFulfillController(user0.address)

    await expect(glpManager.connect(user0).removeLiquidity(
      dai.address,
      "99700000000000000000",
      expandDecimals(123, 18),
      user0.address
    )).to.be.revertedWith("GlpManager: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 1)
    await mineBlock(provider)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(400), lastUpdate: 0 }
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(400), lastUpdate: 0 }
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(500), lastUpdate: 0 }
    ], 0)

    await expect(glpManager.connect(user0).handlerRemoveLiquidity(
      user0.address,
      user0.address,
      dai.address,
      expandDecimals(73, 18),
      expandDecimals(100, 18)
    )).to.be.revertedWith("Vault: poolAmount exceeded")

    await glpManager.setFulfillController(fulfillController.address)

    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await glp.balanceOf(user0.address)).eq("99700000000000000000") // 99.7

    // await glp.connect(user0).approve(glpManager.address, expandDecimals(72, 18))
    await glpManager.connect(user0).removeLiquidity(
      dai.address,
      expandDecimals(72, 18),
      expandDecimals(98, 18),
      user0.address
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(500), lastUpdate: 0 }
    ], 0)

    expect(await dai.balanceOf(user0.address)).eq("98703000000000000000") // 98.703, 72 * 1096.7 / 797.6 => 99
    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await glp.balanceOf(user0.address)).eq("27700000000000000000") // 27.7

    await glpManager.connect(user0).removeLiquidity(
      bnb.address,
      "27700000000000000000", // 27.7, 27.7 * 1096.7 / 797.6 => 38.0875
      "75900000000000000", // 0.0759 BNB => 37.95 USD
      user0.address
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(500), lastUpdate: 0 }
    ], 0)

    expect(await dai.balanceOf(user0.address)).eq("98703000000000000000")
    expect(await bnb.balanceOf(user0.address)).eq("75946475000000000") // 0.075946475
    expect(await glp.balanceOf(user0.address)).eq(0)

    expect(await glp.totalSupply()).eq("697900000000000000000") // 697.9
    expect(await glpManager.getAumInUsdg(true)).eq("1059312500000000000000") // 1059.3125
    expect(await glpManager.getAumInUsdg(false)).eq("967230000000000000000") // 967.23

    expect(await bnb.balanceOf(user1.address)).eq(0)
    expect(await glp.balanceOf(user1.address)).eq("299100000000000000000")

    await glpManager.connect(user1).removeLiquidity(
      bnb.address,
      "299100000000000000000", // 299.1, 299.1 * 967.23 / 697.9 => 414.527142857
      "826500000000000000", // 0.8265 BNB => 413.25
      user1.address
    )

    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(500), lastUpdate: 0 }
    ], 0)

    expect(await bnb.balanceOf(user1.address)).eq("826567122857142856") // 0.826567122857142856
    expect(await glp.balanceOf(user1.address)).eq(0)

    expect(await glp.totalSupply()).eq("398800000000000000000") // 398.8
    expect(await glpManager.getAumInUsdg(true)).eq("644785357142857143000") // 644.785357142857143
    expect(await glpManager.getAumInUsdg(false)).eq("635608285714285714400") // 635.6082857142857144

    expect(await btc.balanceOf(user2.address)).eq(0)
    expect(await glp.balanceOf(user2.address)).eq("398800000000000000000") // 398.8

    expect(await vault.poolAmounts(dai.address)).eq("700000000000000000") // 0.7
    expect(await vault.poolAmounts(bnb.address)).eq("91770714285714286") // 0.091770714285714286
    expect(await vault.poolAmounts(btc.address)).eq("997000") // 0.00997

    await glpManager.setFulfillController(user2.address)

    await expect(glpManager.connect(user2).handlerRemoveLiquidity(
      user2.address,
      user2.address,
      btc.address,
      expandDecimals(375, 18),
      "990000" // 0.0099
    )).to.be.revertedWith("USDG: forbidden")

    await glpManager.setFulfillController(fulfillController.address)

    await usdg.addVault(glpManager.address)

    const tx1 = await glpManager.connect(user2).removeLiquidity(
      btc.address,
      expandDecimals(375, 18),
      "990000", // 0.0099
      user2.address
    )
    await reportGasUsed(provider, tx1, "removeLiquidity gas used")

    const tx2 = await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(500), lastUpdate: 0 }
    ], 0)

    await reportGasUsed(provider, tx2, "handlerRemoveLiquidity gas used")

    expect(await btc.balanceOf(user2.address)).eq("993137")
    expect(await glp.balanceOf(user2.address)).eq("23800000000000000000") // 23.8
  })
})
