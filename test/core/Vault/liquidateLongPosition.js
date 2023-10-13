const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed, newWallet } = require("../../shared/utilities")
const { toXOraclePrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("./helpers")
const { deployXOracle, getPriceFeed } = require("../../shared/xOracle")

use(solidity)

describe("Vault.liquidateLongPosition", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultPriceFeed
  let usdx
  let router
  let bnb
  let btc
  let eth
  let dai
  let busd

  let distributor0
  let yieldTracker0
  let fulfillController

  let xlpManager
  let xlp

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

    await initVault(vault, vaultPositionController, router, usdx, vaultPriceFeed)

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdx.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdx.setYieldTrackers([yieldTracker0.address])

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

    xlp = await deployContract("XLP", [])
    xlpManager = await deployContract("XlpManager", [vault.address, usdx.address, xlp.address, 24 * 60 * 60])
  })

  it("liquidate long", async () => {
    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: (await getBlockTime(provider)) + 24 * 60 * 60 } // set permanent price
    ], 0)
		await vault.setTokenConfig(...getDaiConfig(dai))

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(40000), lastUpdate: 0 } 
    ], 0)
		await vault.setTokenConfig(...getBtcConfig(btc))

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(41000), lastUpdate: 0 } 
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(40000), lastUpdate: 0 } 
    ], 0)

    await expect(vaultPositionController.connect(user0).liquidatePosition(user0.address, btc.address, btc.address, true, user2.address))
      .to.be.revertedWith("Vault: empty position")

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 250000) // 0.0025 BTC => 100 USD
    await vault.buyUSDX(btc.address, user1.address)

    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 25000) // 0.00025 BTC => 10 USD

    expect(await xlpManager.getAumInUsdx(false)).eq("99700000000000000000") // 99.7
    expect(await xlpManager.getAumInUsdx(true)).eq("102192500000000000000") // 102.1925

    await vaultPositionController.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true)

    expect(await xlpManager.getAumInUsdx(false)).eq("99702400000000000000") // 99.7024
    expect(await xlpManager.getAumInUsdx(true)).eq("100192710000000000000") // 100.19271

    let position = await vaultPositionController.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(41000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000) // reserveAmount, 0.00225 * 40,000 => 90

    expect((await vaultPositionController.validateLiquidation(user0.address, btc.address, btc.address, true, false))[0]).eq(0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(43500), lastUpdate: 0 } 
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(43500), lastUpdate: 0 } 
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(43500), lastUpdate: 0 } 
    ], 0)

    let delta = await vaultPositionController.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("5487804878048780487804878048780") // ~5.48
    expect((await vaultPositionController.validateLiquidation(user0.address, btc.address, btc.address, true, false))[0]).eq(0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(39000), lastUpdate: 0 } 
    ], 0)
    delta = await vaultPositionController.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("4390243902439024390243902439024") // ~4.39
    expect((await vaultPositionController.validateLiquidation(user0.address, btc.address, btc.address, true, false))[0]).eq(0)

    await expect(vaultPositionController.liquidatePosition(user0.address, btc.address, btc.address, true, user2.address))
      .to.be.revertedWith("Vault: position cannot be liquidated")

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(38700), lastUpdate: 0 } 
    ], 0)
    delta = await vaultPositionController.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("5048780487804878048780487804878") // ~5.04
    expect((await vaultPositionController.validateLiquidation(user0.address, btc.address, btc.address, true, false))[0]).eq(1)

    position = await vaultPositionController.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(41000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000) // reserveAmount, 0.00225 * 40,000 => 90

    expect(await vault.feeReserves(btc.address)).eq(969)
    expect(await vault.reservedAmounts(btc.address)).eq(225000)
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(80.09))
    expect(await vault.poolAmounts(btc.address)).eq(274250 - 219)
    expect(await btc.balanceOf(user2.address)).eq(0)

    expect(await vault.inPrivateLiquidationMode()).eq(false)
    await vault.setInPrivateLiquidationMode(true)
    expect(await vault.inPrivateLiquidationMode()).eq(true)

    await expect(vaultPositionController.connect(user1).liquidatePosition(user0.address, btc.address, btc.address, true, user2.address))
      .to.be.revertedWith("Vault: invalid liquidator")

    expect(await vault.isLiquidator(user1.address)).eq(false)
    await vault.setLiquidator(user1.address, true)
    expect(await vault.isLiquidator(user1.address)).eq(true)

    expect(await xlpManager.getAumInUsdx(false)).eq("99064997000000000000") // 99.064997
    expect(await xlpManager.getAumInUsdx(true)).eq("101418485000000000000") // 101.418485

    const tx = await vaultPositionController.connect(user1).liquidatePosition(user0.address, btc.address, btc.address, true, user2.address)
    await reportGasUsed(provider, tx, "liquidatePosition gas used")

    expect(await xlpManager.getAumInUsdx(false)).eq("101522097000000000000") // 101.522097
    expect(await xlpManager.getAumInUsdx(true)).eq("114113985000000000000") // 114.113985

    position = await vaultPositionController.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(0) // size
    expect(position[1]).eq(0) // collateral
    expect(position[2]).eq(0) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(0) // reserveAmount

    expect(await vault.feeReserves(btc.address)).eq(1175)
    expect(await vault.reservedAmounts(btc.address)).eq(0)
    expect(await vault.guaranteedUsd(btc.address)).eq(0)
    expect(await vault.poolAmounts(btc.address)).eq(262756 - 219 - 206)
    expect(await btc.balanceOf(user2.address)).eq(11494) // 0.00011494 * 43500 => ~5

    expect(await btc.balanceOf(vault.address)).eq(263506)

    const balance = await btc.balanceOf(vault.address)
    const poolAmount = await vault.poolAmounts(btc.address)
    const feeReserve = await vault.feeReserves(btc.address)
    expect(poolAmount.add(feeReserve).sub(balance)).eq(0)

    await vault.withdrawFees(btc.address, user0.address)

    await btc.mint(vault.address, 1000)
    await vault.buyUSDX(btc.address, user1.address)
  })

  it("automatic stop-loss", async () => {
    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: (await getBlockTime(provider)) + 24 * 60 * 60 } // set permanent price
    ], 0)
		await vault.setTokenConfig(...getDaiConfig(dai))

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(40000), lastUpdate: 0 } 
    ], 0)
		await vault.setTokenConfig(...getBtcConfig(btc))

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(41000), lastUpdate: 0 } 
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(40000), lastUpdate: 0 } 
    ], 0)

    await expect(vaultPositionController.connect(user0).liquidatePosition(user0.address, btc.address, btc.address, true, user2.address))
      .to.be.revertedWith("Vault: empty position")

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 5000000) // 0.05 BTC => 2000 USD
    await vault.buyUSDX(btc.address, user1.address)

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 250000) // 0.0025 BTC => 100 USD
    await vaultPositionController.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(1000), true)

    let position = await vaultPositionController.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(1000)) // size
    expect(position[1]).eq(toUsd(99)) // collateral, 100 - 1000 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(41000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq("2500000") // reserveAmount, 0.025 * 40,000 => 1000

    expect((await vaultPositionController.validateLiquidation(user0.address, btc.address, btc.address, true, false))[0]).eq(0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(43500), lastUpdate: 0 } 
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(43500), lastUpdate: 0 } 
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(43500), lastUpdate: 0 } 
    ], 0)

    let delta = await vaultPositionController.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("60975609756097560975609756097560") // ~60.9756097561
    expect((await vaultPositionController.validateLiquidation(user0.address, btc.address, btc.address, true, false))[0]).eq(0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(39000), lastUpdate: 0 } 
    ], 0)
    delta = await vaultPositionController.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("48780487804878048780487804878048") // ~48.7804878049
    expect((await vaultPositionController.validateLiquidation(user0.address, btc.address, btc.address, true, false))[0]).eq(0)

    await expect(vaultPositionController.liquidatePosition(user0.address, btc.address, btc.address, true, user2.address))
      .to.be.revertedWith("Vault: position cannot be liquidated")

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(37760), lastUpdate: 0 } 
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(37760), lastUpdate: 0 } 
    ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(37760), lastUpdate: 0 } 
    ], 0)

    delta = await vaultPositionController.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("79024390243902439024390243902439") // ~79.0243902439
    expect((await vaultPositionController.validateLiquidation(user0.address, btc.address, btc.address, true, false))[0]).eq(2)

    position = await vaultPositionController.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(1000)) // size
    expect(position[1]).eq(toUsd(99)) // collateral, 100 - 1000 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(41000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq("2500000") // reserveAmount, 0.025 * 40,000 => 1000

    expect(await vault.feeReserves(btc.address)).eq("17439")
    expect(await vault.reservedAmounts(btc.address)).eq("2500000")
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(901))
    expect(await vault.poolAmounts(btc.address)).eq(5000000 + 250000 - 17439)
    expect(await btc.balanceOf(wallet.address)).eq(0)
    expect(await btc.balanceOf(user0.address)).eq(0)
    expect(await btc.balanceOf(user1.address)).eq("194750000")
    expect(await btc.balanceOf(user2.address)).eq(0)

    const tx = await vaultPositionController.liquidatePosition(user0.address, btc.address, btc.address, true, user2.address)
    await reportGasUsed(provider, tx, "liquidatePosition gas used")

    position = await vaultPositionController.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(0) // size
    expect(position[1]).eq(0) // collateral
    expect(position[2]).eq(0) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(0) // reserveAmount

    expect(await vault.feeReserves(btc.address)).eq(17439 + 2648)
    expect(await vault.reservedAmounts(btc.address)).eq(0)
    expect(await vault.guaranteedUsd(btc.address)).eq(0)
    expect(await vault.poolAmounts(btc.address)).eq(5000000 + 250000 - 17439 - 2648 - 50253)
    expect(await btc.balanceOf(wallet.address)).eq(0)
    expect(await btc.balanceOf(user0.address)).eq("50253") // 50253 / (10**8) * 37760 => 18.9755328
    expect(await btc.balanceOf(user1.address)).eq("194750000")
    expect(await btc.balanceOf(user2.address)).eq(0)

    expect(await btc.balanceOf(vault.address)).eq(5000000 + 250000 - 50253)

    const balance = await btc.balanceOf(vault.address)
    const poolAmount = await vault.poolAmounts(btc.address)
    const feeReserve = await vault.feeReserves(btc.address)
    expect(poolAmount.add(feeReserve).sub(balance)).eq(0)

    await vault.withdrawFees(btc.address, user0.address)

    await btc.mint(vault.address, 1000)
    await vault.buyUSDX(btc.address, user1.address)
  })
})
