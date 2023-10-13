const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed } = require("../shared/utilities")
const { initVault, tokenIndexs} = require("../core/Vault/helpers")
const { toXOraclePrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")

use(solidity)

const PRICE_PRECISION = ethers.BigNumber.from(10).pow(30);

describe("OrderBookReader", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let orderBook;
  let orderBookOpenOrder
  let reader;
  let dai;
  let bnb;
  let vault;
  let usdx;
  let router;
  let vaultPriceFeed;
  let fulfillController

  beforeEach(async () => {
    dai = await deployContract("Token", [])
    btc = await deployContract("Token", [])
    bnb = await deployContract("Token", [])

    vault = await deployContract("Vault", [])
    vaultPositionController = await deployContract("VaultPositionController", [])
    usdx = await deployContract("USDX", [vault.address])
    router = await deployContract("Router", [vault.address, vaultPositionController.address, usdx.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    await initVault(vault, vaultPositionController, router, usdx, vaultPriceFeed);

    // deploy xOracle
    xOracle = await deployXOracle(bnb);
    const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

    // deploy fulfillController
    fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address, 0])

    // deposit req fund to fulfillController
    await bnb.mint(fulfillController.address, ethers.utils.parseEther("1.0"))

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, busdPriceFeed.address, 8, false) // instead DAI with USDT

    orderBook = await deployContract("OrderBook", [])
    orderBookOpenOrder = await deployContract("OrderBookOpenOrder", [orderBook.address, vaultPositionController.address])

    await router.addPlugin(orderBook.address);
    await router.connect(user0).approvePlugin(orderBook.address);
    await orderBook.initialize(
      router.address,
      vault.address,
      vaultPositionController.address,
      orderBookOpenOrder.address,
      bnb.address,
      usdx.address,
      400000, 
      expandDecimals(5, 30) // minPurchseTokenAmountUsd
    );
    reader = await deployContract("OrderBookReader", [])

    // set fulfillController
    await fulfillController.setController(wallet.address, true)
    await fulfillController.setHandler(orderBook.address, true)
    await orderBook.setFulfillController(fulfillController.address)

    await dai.mint(user0.address, expandDecimals(10000000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(1000000, 18))

    await btc.mint(user0.address, expandDecimals(100, 8))
    await btc.connect(user0).approve(router.address, expandDecimals(100, 8))
    
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(50000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)
  })

  function createSwapOrder(toToken = bnb.address) {
    const executionFee = 500000;

    return orderBook.connect(user0).createSwapOrder(
      [dai.address, toToken],
      expandDecimals(1000, 18),
      expandDecimals(990, 18),
      expandDecimals(1, 30),
      true,
      executionFee,
      false,
      true,
      {value: executionFee}
    );
  }

  function createIncreaseOrder(sizeDelta) {
    const executionFee = 500000;

    return orderBook.connect(user0).createIncreaseOrder(
      [btc.address],
      expandDecimals(1, 8),
      btc.address,
      0,
      sizeDelta,
      btc.address, // collateralToken
      true, // isLong
      toUsd(53000), // triggerPrice
      false, // triggerAboveThreshold
      executionFee,
      false, // shouldWrap
      { value: executionFee }
    );
  }

  function createDecreaseOrder(sizeDelta = toUsd(100000)) {
    const executionFee = 500000;
    return orderBook.connect(user0).createDecreaseOrder(
      btc.address, // indexToken
      sizeDelta, // sizeDelta
      btc.address, // collateralToken
      toUsd(35000), // collateralDelta
      true, // isLong
      toUsd(53000), // triggerPrice
      true, // triggetAboveThreshold
      { value: executionFee }
    );
  }

  function unflattenOrders([uintProps, addressProps], uintLength, addressLength) {
    const count = uintProps.length / uintLength;

    const ret = [];
    for (let i = 0; i < count; i++) {
      const order = addressProps
        .slice(addressLength * i, addressLength * (i + 1))
        .concat(
          uintProps.slice(uintLength * i, uintLength * (i + 1))
        );
      ret.push(order);
    }
    return ret;
  }

  it("getIncreaseOrders", async () => {
    await createIncreaseOrder(toUsd(100000));    
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(50000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)


    await createIncreaseOrder(toUsd(200000));
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(50000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
    ], 0)

    const [order1, order2] = unflattenOrders(await reader.getIncreaseOrders(orderBook.address, user0.address, [0, 1]), 5, 3);

    expect(order1[2]).to.be.equal(btc.address)
    expect(order1[4]).to.be.equal(toUsd(100000))

    expect(order2[2]).to.be.equal(btc.address)
    expect(order2[4]).to.be.equal(toUsd(200000))
  });

  it("getDecreaseOrders", async () => {
    await createDecreaseOrder(toUsd(100000));
    await createDecreaseOrder(toUsd(200000));

    const [order1, order2] = unflattenOrders(await reader.getDecreaseOrders(orderBook.address, user0.address, [0, 1]), 5, 2);

    expect(order1[1]).to.be.equal(btc.address)
    expect(order1[3]).to.be.equal(toUsd(100000))

    expect(order2[1]).to.be.equal(btc.address)
    expect(order2[3]).to.be.equal(toUsd(200000))
  });

	it("getSwapOrders", async () => {
    await createSwapOrder(bnb.address);
    await createSwapOrder(btc.address);

    const [order1, order2] = unflattenOrders(await reader.getSwapOrders(orderBook.address, user0.address, [0, 1]), 4, 3);

    expect(order1[0]).to.be.equal(dai.address);
    expect(order1[1]).to.be.equal(bnb.address);

    expect(order2[0]).to.be.equal(dai.address);
    expect(order2[1]).to.be.equal(btc.address);
	})
});