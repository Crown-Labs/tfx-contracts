const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed, newWallet } = require("../../shared/utilities")
const { toXOraclePrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getDaiConfig, getBnbConfig, getBtcConfig, tokenIndexs } = require("./helpers")
const { deployXOracle, getPriceFeed } = require("../../shared/xOracle")

use(solidity)

describe("Vault.getPrice", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultPriceFeed
  let usdg
  let router
  let bnb
  let btc
  let eth
  let dai
  let busd
  let usdc
  let distributor0
  let yieldTracker0
  let fulfillController

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    btc = await deployContract("Token", [])
    eth = await deployContract("Token", [])
    dai = await deployContract("Token", [])
    usdc = await deployContract("Token", [])
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

    // deploy xOracle
    xOracle = await deployXOracle();
    const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

    // deploy fulfillController
    fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address])
    await fulfillController.setController(wallet.address, true)

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(usdc.address, usdcPriceFeed.address, 8, true)
    await vaultPriceFeed.setTokenConfig(busd.address, busdPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT
  })

  it("getPrice", async () => {
    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 }
    ], 0)
		await vault.setTokenConfig(...getDaiConfig(dai))
    expect(await vaultPriceFeed.getPrice(dai.address, true, true)).eq(expandDecimals(1, 30))

    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1.1), lastUpdate: 0 }
    ], 0)
    expect(await vaultPriceFeed.getPrice(dai.address, true, true)).eq(expandDecimals(11, 29))

    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDC, price: toXOraclePrice(1), lastUpdate: 0 }
    ], 0)
    await vault.setTokenConfig(
      usdc.address, // _token
      18, // _tokenDecimals
      10000, // _tokenWeight
      75, // _minProfitBps,
      0, // _maxUsdgAmount
      false, // _isStable
      true // _isShortable
    )

    expect(await vaultPriceFeed.getPrice(usdc.address, true, true)).eq(expandDecimals(1, 30))
    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDC, price: toXOraclePrice(1.1), lastUpdate: 0 }
    ], 0)
    expect(await vaultPriceFeed.getPrice(usdc.address, true, true)).eq(expandDecimals(11, 29)) // 1.1

    await vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(1, 29))
    expect(await vaultPriceFeed.getPrice(usdc.address, true, true)).eq(expandDecimals(1, 30)) 

    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDC, price: toXOraclePrice(1.11), lastUpdate: 0 }
    ], 0)
    expect(await vaultPriceFeed.getPrice(usdc.address, true, true)).eq(expandDecimals(111, 28))
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true)).eq(expandDecimals(1, 30))

    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDC, price: toXOraclePrice(0.9), lastUpdate: 0 }
    ], 0)
    expect(await vaultPriceFeed.getPrice(usdc.address, true, true)).eq(expandDecimals(111, 28))
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true)).eq(expandDecimals(1, 30))

    await vaultPriceFeed.setSpreadBasisPoints(usdc.address, 20)
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true)).eq(expandDecimals(1, 30))

    await vaultPriceFeed.setSpreadBasisPoints(usdc.address, 0)
    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDC, price: toXOraclePrice(0.89), lastUpdate: 0 }
    ], 0)
    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDC, price: toXOraclePrice(0.89), lastUpdate: 0 }
    ], 0)
    expect(await vaultPriceFeed.getPrice(usdc.address, true, true)).eq(expandDecimals(1, 30))
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true)).eq(expandDecimals(89, 28))

    await vaultPriceFeed.setSpreadBasisPoints(usdc.address, 20)
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true)).eq(expandDecimals(89, 28))

    expect(await vaultPriceFeed.getPrice(usdc.address, false, true)).eq(expandDecimals(89, 28))

    await vaultPriceFeed.setSpreadBasisPoints(btc.address, 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(40000), lastUpdate: 0 }
    ], 0)
    expect(await vaultPriceFeed.getPrice(btc.address, true, true)).eq(expandDecimals(40000, 30))

    await vaultPriceFeed.setSpreadBasisPoints(btc.address, 20)
    expect(await vaultPriceFeed.getPrice(btc.address, false, true)).eq(expandDecimals(39920, 30))
  })
})
