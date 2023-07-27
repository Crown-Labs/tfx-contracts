const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed } = require("../../shared/utilities")
const { toXOraclePrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, tokenIndexs } = require("./helpers")
const { deployXOracle, getPriceFeed } = require("../../shared/xOracle")

use(solidity)

describe("Vault.withdrawFees", function () {
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
    xOracle = await deployXOracle();
    const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

    // deploy fulfillController
    fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address])
    await fulfillController.setController(wallet.address, true)

    // send fund to fulfillController
    await wallet.sendTransaction({ to: fulfillController.address, value: ethers.utils.parseEther("1.0") })

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT
  })

  it("withdrawFees", async () => {
    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 } 
    ], 0)
    await vault.setTokenConfig(...getBnbConfig(bnb))

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 } 
    ], 0)
		await vault.setTokenConfig(...getBtcConfig(btc))

    await bnb.mint(user0.address, expandDecimals(900, 18))
    await bnb.connect(user0).transfer(vault.address, expandDecimals(900, 18))

    expect(await usdg.balanceOf(wallet.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(0)
    expect(await vault.usdgAmounts(bnb.address)).eq(0)
    expect(await vault.poolAmounts(bnb.address)).eq(0)

    await vault.connect(user0).buyUSDG(bnb.address, user1.address)

    expect(await usdg.balanceOf(wallet.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq("269190000000000000000000") // 269,190 USDG, 810 fee
    expect(await vault.feeReserves(bnb.address)).eq("2700000000000000000") // 2.7, 900 * 0.3%
    expect(await vault.usdgAmounts(bnb.address)).eq("269190000000000000000000") // 269,190
    expect(await vault.poolAmounts(bnb.address)).eq("897300000000000000000") // 897.3
    expect(await usdg.totalSupply()).eq("269190000000000000000000")

    await bnb.mint(user0.address, expandDecimals(200, 18))
    await bnb.connect(user0).transfer(vault.address, expandDecimals(200, 18))

    await btc.mint(user0.address, expandDecimals(2, 8))
    await btc.connect(user0).transfer(vault.address, expandDecimals(2, 8))

    await vault.connect(user0).buyUSDG(btc.address, user1.address)
    expect(await vault.usdgAmounts(btc.address)).eq("119640000000000000000000") // 119,640
    expect(await usdg.totalSupply()).eq("388830000000000000000000") // 388,830

    await btc.mint(user0.address, expandDecimals(2, 8))
    await btc.connect(user0).transfer(vault.address, expandDecimals(2, 8))

    await vault.connect(user0).buyUSDG(btc.address, user1.address)
    expect(await vault.usdgAmounts(btc.address)).eq("239280000000000000000000") // 239,280
    expect(await usdg.totalSupply()).eq("508470000000000000000000") // 508,470

    expect(await vault.usdgAmounts(bnb.address)).eq("269190000000000000000000") // 269,190
    expect(await vault.poolAmounts(bnb.address)).eq("897300000000000000000") // 897.3

    await vault.connect(user0).buyUSDG(bnb.address, user1.address)

    expect(await vault.usdgAmounts(bnb.address)).eq("329010000000000000000000") // 329,010
    expect(await vault.poolAmounts(bnb.address)).eq("1096700000000000000000") // 1096.7

    expect(await vault.feeReserves(bnb.address)).eq("3300000000000000000") // 3.3 BNB
    expect(await vault.feeReserves(btc.address)).eq("1200000") // 0.012 BTC

    await expect(vault.connect(user0).withdrawFees(bnb.address, user2.address))
      .to.be.revertedWith("Vault: forbidden")

    expect(await bnb.balanceOf(user2.address)).eq(0)
    await vault.withdrawFees(bnb.address, user2.address)
    expect(await bnb.balanceOf(user2.address)).eq("3300000000000000000")

    expect(await btc.balanceOf(user2.address)).eq(0)
    await vault.withdrawFees(btc.address, user2.address)
    expect(await btc.balanceOf(user2.address)).eq("1200000")
  })

  it("withdrawFees using timelock", async () => {
    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 } 
    ], 0)
    await vault.setTokenConfig(...getBnbConfig(bnb))

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 } 
    ], 0)
		await vault.setTokenConfig(...getBtcConfig(btc))

    await bnb.mint(user0.address, expandDecimals(900, 18))
    await bnb.connect(user0).transfer(vault.address, expandDecimals(900, 18))

    expect(await usdg.balanceOf(wallet.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(0)
    expect(await vault.usdgAmounts(bnb.address)).eq(0)
    expect(await vault.poolAmounts(bnb.address)).eq(0)

    await vault.connect(user0).buyUSDG(bnb.address, user1.address)

    expect(await usdg.balanceOf(wallet.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq("269190000000000000000000") // 269,190 USDG, 810 fee
    expect(await vault.feeReserves(bnb.address)).eq("2700000000000000000") // 2.7, 900 * 0.3%
    expect(await vault.usdgAmounts(bnb.address)).eq("269190000000000000000000") // 269,190
    expect(await vault.poolAmounts(bnb.address)).eq("897300000000000000000") // 897.3
    expect(await usdg.totalSupply()).eq("269190000000000000000000")

    await bnb.mint(user0.address, expandDecimals(200, 18))
    await bnb.connect(user0).transfer(vault.address, expandDecimals(200, 18))

    await btc.mint(user0.address, expandDecimals(2, 8))
    await btc.connect(user0).transfer(vault.address, expandDecimals(2, 8))

    await vault.connect(user0).buyUSDG(btc.address, user1.address)
    expect(await vault.usdgAmounts(btc.address)).eq("119640000000000000000000") // 119,640
    expect(await usdg.totalSupply()).eq("388830000000000000000000") // 388,830

    await btc.mint(user0.address, expandDecimals(2, 8))
    await btc.connect(user0).transfer(vault.address, expandDecimals(2, 8))

    await vault.connect(user0).buyUSDG(btc.address, user1.address)
    expect(await vault.usdgAmounts(btc.address)).eq("239280000000000000000000") // 239,280
    expect(await usdg.totalSupply()).eq("508470000000000000000000") // 508,470

    expect(await vault.usdgAmounts(bnb.address)).eq("269190000000000000000000") // 269,190
    expect(await vault.poolAmounts(bnb.address)).eq("897300000000000000000") // 897.3

    await vault.connect(user0).buyUSDG(bnb.address, user1.address)

    expect(await vault.usdgAmounts(bnb.address)).eq("329010000000000000000000") // 329,010
    expect(await vault.poolAmounts(bnb.address)).eq("1096700000000000000000") // 1096.7

    expect(await vault.feeReserves(bnb.address)).eq("3300000000000000000") // 3.3 BNB
    expect(await vault.feeReserves(btc.address)).eq("1200000") // 0.012 BTC

    await expect(vault.connect(user0).withdrawFees(bnb.address, user2.address))
      .to.be.revertedWith("Vault: forbidden")

    const timelock = await deployContract("Timelock", [
      wallet.address,
      5 * 24 * 60 * 60,
      user0.address,
      user1.address,
      user2.address,
      expandDecimals(1000, 18),
      10,
      100
    ])
    await vault.setGov(timelock.address)

    await expect(timelock.connect(user0).withdrawFees(vault.address, bnb.address, user2.address))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await bnb.balanceOf(user2.address)).eq(0)
    await timelock.withdrawFees(vault.address, bnb.address, user2.address)
    expect(await bnb.balanceOf(user2.address)).eq("3300000000000000000")

    expect(await btc.balanceOf(user2.address)).eq(0)
    await timelock.withdrawFees(vault.address, btc.address, user2.address)
    expect(await btc.balanceOf(user2.address)).eq("1200000")
  })
})
