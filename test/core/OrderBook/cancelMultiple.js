const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, reportGasUsed, gasUsed, increaseBlocktime, getBlockTime } = require("../../shared/utilities")
const { toXOraclePrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { deployXOracle, getPriceFeed } = require("../../shared/xOracle")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("../Vault/helpers")
const {
    getDefault,
    validateOrderFields,
    getTxFees,
    positionWrapper,
    defaultCreateIncreaseOrderFactory,
    defaultCreateDecreaseOrderFactory,
    defaultCreateSwapOrderFactory,
    PRICE_PRECISION
} = require('./helpers');

use(solidity);

const BTC_PRICE = 60000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BNB_PRICE = 300;

describe("OrderBook, cancelMultiple", function () {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, user3] = provider.getWallets()

    let orderBook;
    let orderBookOpenOrder;
    let increaseOrderDefaults;
    let decreaseOrderDefaults;
    let swapOrderDefaults;
    let tokenDecimals;
    let defaultCreateIncreaseOrder;
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
        xOracle = await deployXOracle(bnb);
        const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

        // deploy fulfillController
        fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address, 0])

        // deposit req fund to fulfillController
        await bnb.mint(fulfillController.address, ethers.utils.parseEther("1.0"))

        // set vaultPriceFeed
        await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT

        await vaultPriceFeed.setPriceSampleSpaceTime(10);

        tokenDecimals = {
            [bnb.address]: 18,
            [dai.address]: 18,
            [btc.address]: 8
        };

        // set vault 
		await vault.setTokenConfig(...getDaiConfig(dai))
		await vault.setTokenConfig(...getBtcConfig(btc))
        await vault.setTokenConfig(...getBnbConfig(bnb))

        orderBook = await deployContract("OrderBook", [])
        orderBookOpenOrder = await deployContract("OrderBookOpenOrder", [orderBook.address, vaultPositionController.address])

        const minExecutionFee = 500000;
        await orderBook.initialize(
            router.address,
            vault.address,
            vaultPositionController.address,
            orderBookOpenOrder.address,
            bnb.address,
            usdg.address,
            minExecutionFee,
            expandDecimals(5, 30) // minPurchseTokenAmountUsd
        );

        // set fulfillController
        await fulfillController.setController(wallet.address, true)
        await fulfillController.setHandler(orderBook.address, true)
        await orderBook.setFulfillController(fulfillController.address)

        await router.addPlugin(orderBook.address);
        await router.connect(user0).approvePlugin(orderBook.address);

        await btc.mint(user0.address, expandDecimals(1000, 8))
        await btc.connect(user0).approve(router.address, expandDecimals(100, 8))

        await dai.mint(user0.address, expandDecimals(10000000, 18))
        await dai.connect(user0).approve(router.address, expandDecimals(1000000, 18))

        await bnb.mint(user0.address, expandDecimals(10000000, 18))
        await bnb.connect(user0).approve(router.address, expandDecimals(1000000, 18))

        await dai.mint(user0.address, expandDecimals(20000000, 18))
        await dai.connect(user0).transfer(vault.address, expandDecimals(2000000, 18))
        await vault.directPoolDeposit(dai.address);

        await btc.mint(user0.address, expandDecimals(1000, 8))
        await btc.connect(user0).transfer(vault.address, expandDecimals(100, 8))
        await vault.directPoolDeposit(btc.address);

        await bnb.mint(user0.address, expandDecimals(50000, 18))
        await bnb.connect(user0).transfer(vault.address, expandDecimals(10000, 18))
        await vault.directPoolDeposit(bnb.address);

        increaseOrderDefaults = {
            path: [btc.address],
            sizeDelta: toUsd(100000),
            amountIn: expandDecimals(1, 8),
            minOut: 0,
            triggerPrice: toUsd(53000),
            triggerAboveThreshold: true,
            executionFee: expandDecimals(1, 9).mul(1500000),
            collateralToken: btc.address,
            collateralDelta: toUsd(BTC_PRICE),
            user: user0,
            isLong: true,
            shouldWrap: false
        };

        decreaseOrderDefaults = {
            path: [btc.address],
            sizeDelta: toUsd(100000),
            amountIn: expandDecimals(1, 8),
            minOut: 0,
            triggerPrice: toUsd(53000),
            triggerAboveThreshold: true,
            executionFee: expandDecimals(1, 9).mul(1500000),
            collateralToken: btc.address,
            collateralDelta: toUsd(BTC_PRICE),
            user: user0,
            isLong: true
        };

        swapOrderDefaults = {
            path: [dai.address, btc.address],
            sizeDelta: toUsd(100000),
            minOut: 0,
            amountIn: expandDecimals(1000, 18),
            triggerPrice: toUsd(53000),
            triggerAboveThreshold: true,
            executionFee: expandDecimals(1, 9).mul(1500000),
            collateralToken: btc.address,
            collateralDelta: toUsd(BTC_PRICE),
            user: user0,
            isLong: true,
            shouldWrap: false,
            shouldUnwrap: true
        };

        defaultCreateIncreaseOrder = defaultCreateIncreaseOrderFactory(orderBook, increaseOrderDefaults)
        defaultCreateDecreaseOrder = defaultCreateDecreaseOrderFactory(orderBook, decreaseOrderDefaults)
        defaultCreateSwapOrder = defaultCreateSwapOrderFactory(orderBook, swapOrderDefaults, tokenDecimals)

        await fulfillController.requestUpdatePrices()
        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(BTC_PRICE), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(BNB_PRICE), lastUpdate: 0 }
          ], 0)
    });

    it("cancelMultiple", async () => {
        async function expectOrderAccountEquals(type, address, index) {
            const method = type + "Orders"
            const order = await orderBook[method](user0.address, index)
            await expect(order.account).to.be.equal(address)
        }

        const triggerRatio = toUsd(1).mul(PRICE_PRECISION).div(toUsd(58000));
        await defaultCreateSwapOrder({ triggerRatio })

        await expectOrderAccountEquals("swap", user0.address, 0)

        await defaultCreateIncreaseOrder()
        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(BTC_PRICE), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(BNB_PRICE), lastUpdate: 0 }
          ], 0)
        
        await expectOrderAccountEquals("increase", user0.address, 0)

        await defaultCreateDecreaseOrder()

        await defaultCreateDecreaseOrder()
        await expectOrderAccountEquals("decrease", user0.address, 1)

        await orderBook.connect(user0).cancelMultiple([0], [], []) // delete swap order
        await expectOrderAccountEquals("swap", ZERO_ADDRESS, 0)
        await expectOrderAccountEquals("decrease", user0.address, 1)
        await expectOrderAccountEquals("increase", user0.address, 0)

        await orderBook.connect(user0).cancelMultiple([], [0], [1]) // delete increase and decrease
        await expectOrderAccountEquals("swap", ZERO_ADDRESS, 0)
        await expectOrderAccountEquals("decrease", ZERO_ADDRESS, 1)
        await expectOrderAccountEquals("decrease", user0.address, 0)
        await expectOrderAccountEquals("increase", ZERO_ADDRESS, 0)

        await expect(orderBook.connect(user0).cancelMultiple([0], [], []))
            .to.be.revertedWith("OrderBook: non-existent order")
    })
})
