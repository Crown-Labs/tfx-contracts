const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed, newWallet } = require("../shared/utilities")
const { toXOraclePrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("./Vault/helpers")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")

use(solidity)

describe("XlpManager", function () {
  const provider = waffle.provider
  const [wallet, rewardRouter, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultPositionController
  let xlpManager
  let xlp
  let usdx
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
    usdx = await deployContract("USDX", [vault.address])
    router = await deployContract("Router", [vault.address, vaultPositionController.address, usdx.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    xlp = await deployContract("XLP", [])

    await initVault(vault, vaultPositionController, router, usdx, vaultPriceFeed)
    xlpManager = await deployContract("XlpManager", [vault.address, usdx.address, xlp.address, 24 * 60 * 60])

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdx.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdx.setYieldTrackers([yieldTracker0.address])

    reader = await deployContract("Reader", [])

    // deploy xOracle
    xOracle = await deployXOracle(bnb);
    const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

    // deploy fulfillController
    fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address, 0])

    // deposit req fund to fulfillController
    await bnb.mint(fulfillController.address, ethers.utils.parseEther("1.0"))

    // set fulfillController
    await fulfillController.setController(wallet.address, true)
    await fulfillController.setHandler(xlpManager.address, true)

    // set xlpManager
    await xlpManager.setFulfillController(fulfillController.address);

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

    await xlp.setInPrivateTransferMode(true)
    await xlp.setMinter(xlpManager.address, true)

    await vault.setInManagerMode(true)
  })

  it("inits", async () => {
    expect(await xlpManager.gov()).eq(wallet.address)
    expect(await xlpManager.vault()).eq(vault.address)
    expect(await xlpManager.usdx()).eq(usdx.address)
    expect(await xlpManager.xlp()).eq(xlp.address)
    expect(await xlpManager.cooldownDuration()).eq(24 * 60 * 60)
  })

  it("setGov", async () => {
    await expect(xlpManager.connect(user0).setGov(user1.address))
      .to.be.revertedWith("Governable: forbidden")

    expect(await xlpManager.gov()).eq(wallet.address)

    await xlpManager.setGov(user0.address)
    expect(await xlpManager.gov()).eq(user0.address)

    await xlpManager.connect(user0).setGov(user1.address)
    expect(await xlpManager.gov()).eq(user1.address)
  })

  it("setHandler", async () => {
    await expect(xlpManager.connect(user0).setHandler(user1.address, true))
      .to.be.revertedWith("Governable: forbidden")

    expect(await xlpManager.gov()).eq(wallet.address)
    await xlpManager.setGov(user0.address)
    expect(await xlpManager.gov()).eq(user0.address)

    expect(await xlpManager.isHandler(user1.address)).eq(false)
    await xlpManager.connect(user0).setHandler(user1.address, true)
    expect(await xlpManager.isHandler(user1.address)).eq(true)
  })

  it("setCooldownDuration", async () => {
    await expect(xlpManager.connect(user0).setCooldownDuration(1000))
      .to.be.revertedWith("Governable: forbidden")

    await xlpManager.setGov(user0.address)

    await expect(xlpManager.connect(user0).setCooldownDuration(48 * 60 * 60 + 1))
      .to.be.revertedWith("XlpManager: invalid _cooldownDuration")

    expect(await xlpManager.cooldownDuration()).eq(24 * 60 * 60)
    await xlpManager.connect(user0).setCooldownDuration(48 * 60 * 60)
    expect(await xlpManager.cooldownDuration()).eq(48 * 60 * 60)
  })

  it("setAumAdjustment", async () => {
    await expect(xlpManager.connect(user0).setAumAdjustment(29, 17))
      .to.be.revertedWith("Governable: forbidden")

    await xlpManager.setGov(user0.address)

    expect(await xlpManager.aumAddition()).eq(0)
    expect(await xlpManager.aumDeduction()).eq(0)
    expect(await xlpManager.getAum(true, false)).eq(0)
    await xlpManager.connect(user0).setAumAdjustment(29, 17)
    expect(await xlpManager.aumAddition()).eq(29)
    expect(await xlpManager.aumDeduction()).eq(17)
    expect(await xlpManager.getAum(true, false)).eq(12)
  })

  it("addLiquidity, removeLiquidity", async () => {
    await dai.mint(user0.address, expandDecimals(100, 18))
    await dai.connect(user0).approve(xlpManager.address, expandDecimals(100, 18))

    await xlpManager.setFulfillController(user0.address)

    await expect(xlpManager.connect(user0).handlerAddLiquidity(
      user0.address,
      user0.address,
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(101, 18),
      expandDecimals(101, 18)
    )).to.be.revertedWith("Vault: forbidden")

    await vault.setManager(xlpManager.address, true)

    await expect(xlpManager.connect(user0).handlerAddLiquidity(
      user0.address,
      user0.address,
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(101, 18),
      expandDecimals(101, 18)
    )).to.be.revertedWith("XlpManager: insufficient USDX output")

    await xlpManager.setFulfillController(fulfillController.address)

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
    expect(await usdx.balanceOf(xlpManager.address)).eq(0)
    expect(await xlp.balanceOf(user0.address)).eq(0)
    expect(await xlpManager.lastAddedAt(user0.address)).eq(0)
    expect(await xlpManager.getAumInUsdx(true)).eq(0)

    const tx0 = await xlpManager.connect(user0).addLiquidity(
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
    expect(await usdx.balanceOf(xlpManager.address)).eq("99700000000000000000") // 99.7
    expect(await xlp.balanceOf(user0.address)).eq("99700000000000000000")
    expect(await xlp.totalSupply()).eq("99700000000000000000")
    expect(await xlpManager.lastAddedAt(user0.address)).eq(blockTime)

    expect(await xlpManager.getAumInUsdx(true)).eq("99700000000000000000")
    expect(await xlpManager.getAumInUsdx(false)).eq("99700000000000000000")

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(xlpManager.address, expandDecimals(1, 18))

    await xlpManager.connect(user1).addLiquidity(
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

    expect(await usdx.balanceOf(xlpManager.address)).eq("398800000000000000000") // 398.8
    expect(await xlp.balanceOf(user0.address)).eq("99700000000000000000") // 99.7
    expect(await xlp.balanceOf(user1.address)).eq("299100000000000000000") // 299.1
    expect(await xlp.totalSupply()).eq("398800000000000000000")
    expect(await xlpManager.lastAddedAt(user1.address)).eq(blockTime)
    expect(await xlpManager.getAumInUsdx(true)).eq("498500000000000000000")
    expect(await xlpManager.getAumInUsdx(false)).eq("398800000000000000000")

    await expect(xlp.connect(user1).transfer(user2.address, expandDecimals(1, 18)))
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

    expect(await xlpManager.getAumInUsdx(true)).eq("598200000000000000000") // 598.2
    expect(await xlpManager.getAumInUsdx(false)).eq("498500000000000000000") // 498.5

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
    await btc.connect(user2).approve(xlpManager.address, expandDecimals(1, 18))

    await xlpManager.setFulfillController(user2.address)

    await expect(xlpManager.connect(user2).handlerAddLiquidity(
      user2.address,
      user2.address,
      btc.address,
      "1000000",
      expandDecimals(599, 18),
      expandDecimals(399, 18)
    )).to.be.revertedWith("XlpManager: insufficient USDX output")

    await expect(xlpManager.connect(user2).handlerAddLiquidity(
      user2.address,
      user2.address,
      btc.address,
      "1000000",
      expandDecimals(598, 18),
      expandDecimals(399, 18)
    )).to.be.revertedWith("XlpManager: insufficient GLP output")

    await xlpManager.setFulfillController(fulfillController.address)

    await xlpManager.connect(user2).addLiquidity(
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

    expect(await usdx.balanceOf(xlpManager.address)).eq("997000000000000000000") // 997
    expect(await xlp.balanceOf(user0.address)).eq("99700000000000000000") // 99.7
    expect(await xlp.balanceOf(user1.address)).eq("299100000000000000000") // 299.1
    expect(await xlp.balanceOf(user2.address)).eq("398800000000000000000") // 398.8
    expect(await xlp.totalSupply()).eq("797600000000000000000") // 797.6
    expect(await xlpManager.lastAddedAt(user2.address)).eq(blockTime)

    expect(await xlpManager.getAumInUsdx(true)).eq("1196400000000000000000") // 1196.4
    expect(await xlpManager.getAumInUsdx(false)).eq("1096700000000000000000") // 1096.7

    await xlpManager.setFulfillController(user0.address)

    await expect(xlpManager.connect(user0).removeLiquidity(
      dai.address,
      "99700000000000000000",
      expandDecimals(123, 18),
      user0.address
    )).to.be.revertedWith("XlpManager: cooldown duration not yet passed")

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

    await expect(xlpManager.connect(user0).handlerRemoveLiquidity(
      user0.address,
      user0.address,
      dai.address,
      expandDecimals(73, 18),
      expandDecimals(100, 18)
    )).to.be.revertedWith("Vault: poolAmount exceeded")

    await xlpManager.setFulfillController(fulfillController.address)

    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await xlp.balanceOf(user0.address)).eq("99700000000000000000") // 99.7

    // await xlp.connect(user0).approve(xlpManager.address, expandDecimals(72, 18))
    await xlpManager.connect(user0).removeLiquidity(
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
    expect(await xlp.balanceOf(user0.address)).eq("27700000000000000000") // 27.7

    await xlpManager.connect(user0).removeLiquidity(
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
    expect(await xlp.balanceOf(user0.address)).eq(0)

    expect(await xlp.totalSupply()).eq("697900000000000000000") // 697.9
    expect(await xlpManager.getAumInUsdx(true)).eq("1059312500000000000000") // 1059.3125
    expect(await xlpManager.getAumInUsdx(false)).eq("967230000000000000000") // 967.23

    expect(await bnb.balanceOf(user1.address)).eq(0)
    expect(await xlp.balanceOf(user1.address)).eq("299100000000000000000")

    await xlpManager.connect(user1).removeLiquidity(
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
    expect(await xlp.balanceOf(user1.address)).eq(0)

    expect(await xlp.totalSupply()).eq("398800000000000000000") // 398.8
    expect(await xlpManager.getAumInUsdx(true)).eq("644785357142857143000") // 644.785357142857143
    expect(await xlpManager.getAumInUsdx(false)).eq("635608285714285714400") // 635.6082857142857144

    expect(await btc.balanceOf(user2.address)).eq(0)
    expect(await xlp.balanceOf(user2.address)).eq("398800000000000000000") // 398.8

    expect(await vault.poolAmounts(dai.address)).eq("700000000000000000") // 0.7
    expect(await vault.poolAmounts(bnb.address)).eq("91770714285714286") // 0.091770714285714286
    expect(await vault.poolAmounts(btc.address)).eq("997000") // 0.00997

    await xlpManager.setFulfillController(user2.address)

    await expect(xlpManager.connect(user2).handlerRemoveLiquidity(
      user2.address,
      user2.address,
      btc.address,
      expandDecimals(375, 18),
      "990000" // 0.0099
    )).to.be.revertedWith("USDX: forbidden")

    await xlpManager.setFulfillController(fulfillController.address)

    await usdx.addVault(xlpManager.address)

    const tx1 = await xlpManager.connect(user2).removeLiquidity(
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
    expect(await xlp.balanceOf(user2.address)).eq("23800000000000000000") // 23.8
  })
})
