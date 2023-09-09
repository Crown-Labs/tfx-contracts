const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, reportGasUsed, gasUsed, increaseBlocktime, getBlockTime, mineBlock } = require("../../shared/utilities")
const { toXOraclePrice } = require("../../shared/chainlink")
const { toUsd } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("../Vault/helpers")
const { getDefault, validateOrderFields, getTxFees, positionWrapper, defaultCreateDecreaseOrderFactory } = require('./helpers');
const { extractAbi } = require("typechain")
const { deployXOracle, getPriceFeed } = require("../../shared/xOracle")

use(solidity);

const BTC_PRICE = 60000;
const BNB_PRICE = 300;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("OrderBook, decrease position orders", () => {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, user3, tokenManager, mintReceiver] = provider.getWallets()
    const { AddressZero } = ethers.constants

    let vault;
    let orderBook;
    let orderBookOpenOrder;
    let defaults;
    let defaultCreateDecreaseOrder

    let usdg
    let router
    let bnb
    let btc
    let dai
    let vaultPriceFeed
    let xOracle
    let fulfillController

    beforeEach(async () => {
        bnb = await deployContract("Token", [])
        btc = await deployContract("Token", [])
        eth = await deployContract("Token", [])
        dai = await deployContract("Token", [])

        vault = await deployContract("Vault", [])
        vaultPositionController = await deployContract("VaultPositionController", [])
        usdg = await deployContract("USDG", [vault.address])
        router = await deployContract("Router", [vault.address, vaultPositionController.address, usdg.address, bnb.address])
        vaultPriceFeed = await deployContract("VaultPriceFeed", [])

        const initVaultResult = await initVault(vault, vaultPositionController, router, usdg, vaultPriceFeed)

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
        await fulfillController.setController(wallet.address, true)

        // deposit req fund to fulfillController
        await bnb.mint(fulfillController.address, ethers.utils.parseEther("1.0"))

        // set vaultPriceFeed
        await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT

        await vaultPriceFeed.setPriceSampleSpaceTime(10);

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

        await orderBook.setOrderExecutor(wallet.address);

        await router.addPlugin(orderBook.address);
        await router.connect(user0).approvePlugin(orderBook.address);

        await btc.mint(user0.address, expandDecimals(1000, 8))
        await btc.connect(user0).approve(router.address, expandDecimals(100, 8))

        await dai.mint(user0.address, expandDecimals(10000000, 18))
        await dai.connect(user0).approve(router.address, expandDecimals(1000000, 18))

        await dai.mint(user0.address, expandDecimals(20000000, 18))
        await dai.connect(user0).transfer(vault.address, expandDecimals(2000000, 18))
        await vault.directPoolDeposit(dai.address);

        await btc.mint(user0.address, expandDecimals(1000, 8))
        await btc.connect(user0).transfer(vault.address, expandDecimals(100, 8))
        await vault.directPoolDeposit(btc.address);

        await bnb.mint(user0.address, expandDecimals(50000, 18))
        await bnb.connect(user0).transfer(vault.address, expandDecimals(10000, 18))
        await vault.directPoolDeposit(bnb.address);

        defaults = {
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

        defaultCreateDecreaseOrder = defaultCreateDecreaseOrderFactory(orderBook, defaults)

        await fulfillController.requestUpdatePrices()
        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(BTC_PRICE), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(BNB_PRICE), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: (await getBlockTime(provider)) + 24 * 60 * 60 } // set permanent price
        ], 0)
    });

    async function getCreatedDecreaseOrder(address, orderIndex = 0) {
        const order = await orderBook.decreaseOrders(address, orderIndex);
        return order;
    }

    /*
    checklist:
    [x] create order, low execution fee => revert
    [x] create order, transferred ETH != execution fee => revert
    [x] create order, order is retrievable
    [x] executionFee transferred to OrderBook
    [x] cancel order, delete order
    [x] and user got back execution fee
    [x] if cancelling order doesnt not exist => revert
    [x] update order, all fields are new
    [x] if user doesn't have such order => revert
    [x] two orders retreivable
    [x] execute order, if doesnt exist => revert
    [x] if price is not valid => revert
    [x] delete order
    [x] position was decreased
    [x] if collateral is weth => transfer BNB funds
    [x] otherwise transfer token
    [x] and transfer executionFee
    [x] partial decrease
    */

    it("Create decrase order, bad fee", async() => {
    	await expect(defaultCreateDecreaseOrder({
    		executionFee: 100
    	})).to.be.revertedWith("OrderBook: insufficient execution fee");
    })

    it("Create decrease order, long", async () => {
        const tx = await defaultCreateDecreaseOrder();
        reportGasUsed(provider, tx, 'createDecraseOrder gas used');
        let order = await getCreatedDecreaseOrder(defaults.user.address);
        const btcBalanceAfter = await btc.balanceOf(orderBook.address);

        expect(await bnb.balanceOf(orderBook.address), 'BNB balance').to.be.equal(defaults.executionFee);

        validateOrderFields(order, {
            account: defaults.user.address,
            indexToken: btc.address,
            sizeDelta: defaults.sizeDelta,
            collateralToken: defaults.collateralToken,
            collateralDelta: defaults.collateralDelta,
            isLong: true,
            triggerPrice: defaults.triggerPrice,
            triggerAboveThreshold: true,
            executionFee: defaults.executionFee
        });
    });

    it("updateDecreaseOrder", async () => {
        await defaultCreateDecreaseOrder();

        const newSizeDelta = defaults.sizeDelta.add(100);
        const newTriggerPrice = defaults.triggerPrice.add(100);
        const newTriggerAboveThreshold = !defaults.triggerAboveThreshold;
        const newCollateralDelta = defaults.collateralDelta.add(100);

        await expect(orderBook.connect(user1).updateDecreaseOrder(
            0, newCollateralDelta, newSizeDelta, newTriggerPrice, newTriggerAboveThreshold
        )).to.be.revertedWith("OrderBook: non-existent order");

        const tx2 = await orderBook.connect(defaults.user).updateDecreaseOrder(
            0, newCollateralDelta, newSizeDelta, newTriggerPrice, newTriggerAboveThreshold
        );
        reportGasUsed(provider, tx2, 'updateDecreaseOrder gas used');

        order = await getCreatedDecreaseOrder(user0.address);

        validateOrderFields(order, {
            sizeDelta: newSizeDelta,
            collateralDelta: newCollateralDelta,
            triggerPrice: newTriggerPrice,
            triggerAboveThreshold: newTriggerAboveThreshold
        });
    });

    it("Create decrease order, short", async () => {
        const tx = await defaultCreateDecreaseOrder({
            isLong: false
        });
        reportGasUsed(provider, tx, 'createDecreaseOrder gas used');
        const order = await getCreatedDecreaseOrder(defaults.user.address);
        const btcBalanceAfter = await btc.balanceOf(orderBook.address);

        expect(await bnb.balanceOf(orderBook.address), 'BNB balance').to.be.equal(defaults.executionFee);

        validateOrderFields(order, {
            account: defaults.user.address,
            indexToken: btc.address,
            sizeDelta: defaults.sizeDelta,
            collateralToken: defaults.collateralToken,
            collateralDelta: defaults.collateralDelta,
            isLong: false,
            triggerPrice: defaults.triggerPrice,
            triggerAboveThreshold: true,
            executionFee: defaults.executionFee
        });
    });

    it("Create two orders", async () => {
        await defaultCreateDecreaseOrder({
            sizeDelta: toUsd(1)
        });
        await defaultCreateDecreaseOrder({
            sizeDelta: toUsd(2)
        });

        const order1 = await getCreatedDecreaseOrder(defaults.user.address, 0);
        const order2 = await getCreatedDecreaseOrder(defaults.user.address, 1);

        expect(order1.sizeDelta).to.be.equal(toUsd(1));
        expect(order2.sizeDelta).to.be.equal(toUsd(2));
    });

    it("Execute decrease order, invalid price", async () => {
        await vaultPriceFeed.setPriceSampleSpaceTime(20);
        let triggerPrice, isLong, triggerAboveThreshold, newBtcPrice;
        let orderIndex = 0;

        // decrease long should use min price
        // decrease short should use max price
        for ([triggerPrice, isLong, triggerAboveThreshold, newBtcPrice, setPriceTwice] of [
            [expandDecimals(BTC_PRICE - 1000, 30), true, false, BTC_PRICE - 1050, false],
            [expandDecimals(BTC_PRICE + 1000, 30), true, true, BTC_PRICE + 1050, true],
            [expandDecimals(BTC_PRICE - 1000, 30), false, false, BTC_PRICE - 1050, true],
            [expandDecimals(BTC_PRICE + 1000, 30), false, true, BTC_PRICE + 1050, false]
        ]) {
            // "reset" BTC price
            await increaseBlocktime(provider, 10)
            await fulfillController.requestUpdatePrices()
            await xOracle.fulfillRequest([
                { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(BTC_PRICE), lastUpdate: 0 }
            ], 0)

            await increaseBlocktime(provider, 10)
            await fulfillController.requestUpdatePrices()
            await xOracle.fulfillRequest([
                { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(BTC_PRICE), lastUpdate: 0 }
            ], 0)

            await defaultCreateDecreaseOrder({
                triggerPrice,
                triggerAboveThreshold,
                isLong
            });

            const order = await orderBook.decreaseOrders(defaults.user.address, orderIndex);
            await expect(orderBook.executeDecreaseOrder(order.account, orderIndex, user1.address), 1)
                .to.be.revertedWith("OrderBook: invalid price for execution");

            if (setPriceTwice) {
                // on first price update all limit orders are still invalid
                await increaseBlocktime(provider, 10)
                await fulfillController.requestUpdatePrices()
                await xOracle.fulfillRequest([
                    { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(newBtcPrice), lastUpdate: 0 }
                ], 0)
                await expect(orderBook.executeDecreaseOrder(order.account, orderIndex, user1.address), 2)
                    .to.be.revertedWith("OrderBook: invalid price for execution");
            }

            // now both min and max prices satisfies requirement
            await increaseBlocktime(provider, 10)
            await fulfillController.requestUpdatePrices()
            await xOracle.fulfillRequest([
                { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(newBtcPrice), lastUpdate: 0 }
            ], 0)
            await expect(orderBook.executeDecreaseOrder(order.account, orderIndex, user1.address), 3)
                .to.not.be.revertedWith("OrderBook: invalid price for execution");
            // so we are sure we passed price validations inside OrderBook

            orderIndex++;
        }
    })

    it("Execute decrease order, non-existent", async () => {
        await defaultCreateDecreaseOrder({
            triggerPrice: toUsd(BTC_PRICE - 1000),
            triggerAboveThreshold: false
        });

        await expect(orderBook.executeDecreaseOrder(defaults.user.address, 1, user1.address))
            .to.be.revertedWith("OrderBook: non-existent order");
    });

    it("Execute decrease order, long", async () => {
        await btc.connect(defaults.user).transfer(vault.address, expandDecimals(10000, 8).div(BTC_PRICE));
        await vaultPositionController.connect(defaults.user).increasePosition(defaults.user.address, btc.address, btc.address, toUsd(20000), true);

        const btcBalanceBefore = await btc.balanceOf(defaults.user.address);
        let position = positionWrapper(await vaultPositionController.getPosition(defaults.user.address, btc.address, btc.address, true));

        await defaultCreateDecreaseOrder({
            collateralDelta: position.collateral,
            sizeDelta: position.size,
            triggerAboveThreshold: true,
            triggerPrice: toUsd(BTC_PRICE + 5000),
            isLong: true
        });

        const order = await orderBook.decreaseOrders(defaults.user.address, 0);

        await increaseBlocktime(provider, 10)
        await fulfillController.requestUpdatePrices()
        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(BTC_PRICE + 5050), lastUpdate: 0 }
        ], 0)

        const executorBalanceBefore = await user1.getBalance();
        const tx = await orderBook.executeDecreaseOrder(defaults.user.address, 0, user1.address);

        reportGasUsed(provider, tx, 'executeDecreaseOrder gas used');

        const executorBalanceAfter = await user1.getBalance();
        expect(executorBalanceAfter).to.be.equal(executorBalanceBefore.add(defaults.executionFee));

        const btcBalanceAfter = await btc.balanceOf(defaults.user.address);
        expect(btcBalanceAfter.sub(btcBalanceBefore)).to.be.equal('17899051');

        position = positionWrapper(await vaultPositionController.getPosition(defaults.user.address, btc.address, btc.address, defaults.isLong));

        expect(position.size).to.be.equal(0);
        expect(position.collateral).to.be.equal(0);

        const orderAfter = await orderBook.increaseOrders(defaults.user.address, 0);
        expect(orderAfter.account).to.be.equal(ZERO_ADDRESS);
    });

    it("Execute decrease order, short, BTC", async () => {
        await dai.connect(defaults.user).transfer(vault.address, expandDecimals(10000, 18));
        await vaultPositionController.connect(defaults.user).increasePosition(defaults.user.address, dai.address, btc.address, toUsd(20000), false);

        let position = positionWrapper(await vaultPositionController.getPosition(defaults.user.address, dai.address, btc.address, false));
        const daiBalanceBefore = await dai.balanceOf(defaults.user.address);

        await defaultCreateDecreaseOrder({
            collateralDelta: position.collateral,
            collateralToken: dai.address,
            sizeDelta: position.size,
            triggerAboveThreshold: false,
            triggerPrice: toUsd(BTC_PRICE - 1000),
            isLong: false
        });
        const executor = user1;

        const order = await orderBook.decreaseOrders(defaults.user.address, 0);

        await increaseBlocktime(provider, 10)
        await fulfillController.requestUpdatePrices()
        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(BTC_PRICE - 1500), lastUpdate: 0 }
        ], 0)

        const executorBalanceBefore = await executor.getBalance();

        const tx = await orderBook.executeDecreaseOrder(defaults.user.address, 0, executor.address);

        reportGasUsed(provider, tx, 'executeDecreaseOrder gas used');

        const executorBalanceAfter = await executor.getBalance();
        expect(executorBalanceAfter).to.be.equal(executorBalanceBefore.add(defaults.executionFee));

        const daiBalanceAfter = await dai.balanceOf(defaults.user.address);
        expect(daiBalanceAfter.sub(daiBalanceBefore)).to.be.equal("10460000000000000000000");

        position = positionWrapper(await vaultPositionController.getPosition(defaults.user.address, btc.address, btc.address, defaults.isLong));

        expect(position.size).to.be.equal(0);
        expect(position.collateral).to.be.equal(0);

        const orderAfter = await orderBook.increaseOrders(defaults.user.address, 0);
        expect(orderAfter.account).to.be.equal(ZERO_ADDRESS);
    });

    it("Execute decrease order, long, BNB", async () => {

        // deploy positionRouter
        const depositFee = 0
        const minExecutionFee = 0
        const positionRouter = await deployContract("PositionRouter", [vault.address, vaultPositionController.address, router.address, bnb.address, depositFee, minExecutionFee])
        
        await fulfillController.setHandler(positionRouter.address, true)

        const timelock = await deployContract("Timelock", [
            wallet.address,
            5 * 24 * 60 * 60,
            AddressZero,
            tokenManager.address,
            mintReceiver.address,
            expandDecimals(1000, 18),
            10, // marginFeeBasisPoints 0.1%
            10, // maxMarginFeeBasisPoints 5%
        ])
        await timelock.setContractHandler(positionRouter.address, true)
        await timelock.setShouldToggleIsLeverageEnabled(true)

        await vault.setIsLeverageEnabled(true)
        await vault.setGov(timelock.address)

        await router.addPlugin(positionRouter.address)
        await router.connect(defaults.user).approvePlugin(positionRouter.address)
        
        const referralStorage = await deployContract("ReferralStorage", [])
        await referralStorage.setHandler(positionRouter.address, true)
        await positionRouter.setReferralStorage(referralStorage.address)

        // uint256 _minBlockDelayKeeper, uint256 _minTimeDelayPublic, uint256 _maxTimeDelay
        await positionRouter.setDelayValues(1, 180, 30 * 60)
        await positionRouter.setFulfillController(fulfillController.address, user3.address)
        //

        // createIncreasePosition
        let params = [
            [bnb.address], // _path
            bnb.address, // _indexToken
            0, // _minOut
            toUsd(3000), // _sizeDelta
            true, // _isLong
            toUsd(301), // _acceptablePrice
            0,
            "0x0000000000000000000000000000000000000000000000000000000000000123"
        ]
        await positionRouter.connect(defaults.user).createIncreasePositionETH(...params, {value: expandDecimals(5, 18)})

        await mineBlock(provider)
        await mineBlock(provider)
        await mineBlock(provider)
        await mineBlock(provider)
        await mineBlock(provider)
        await mineBlock(provider)

        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(BTC_PRICE), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(BNB_PRICE), lastUpdate: 0 }
          ], 0)

        let position = positionWrapper(await vaultPositionController.getPosition(defaults.user.address, bnb.address, bnb.address, true));
        
        const userTx = await defaultCreateDecreaseOrder({
            collateralDelta: position.collateral.div(2),
            collateralToken: bnb.address,
            indexToken: bnb.address,
            sizeDelta: position.size.div(2),
            triggerAboveThreshold: false,
            triggerPrice: toUsd(BTC_PRICE - 1000),
            isLong: true
        });

        reportGasUsed(provider, userTx, 'createSwapOrder');
        const userTxFee = await getTxFees(provider, userTx);
        const order = await orderBook.decreaseOrders(defaults.user.address, 0);

        await fulfillController.requestUpdatePrices()
        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(BTC_PRICE - 1500), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(BNB_PRICE), lastUpdate: 0 }
          ], 0)

        const executor = user1;

        const balanceBefore = await defaults.user.getBalance();
        const executorBalanceBefore = await executor.getBalance();
        const tx = await orderBook.executeDecreaseOrder(defaults.user.address, 0, executor.address);
        reportGasUsed(provider, tx, 'executeDecreaseOrder gas used');

        position = positionWrapper(await vaultPositionController.getPosition(defaults.user.address, bnb.address, bnb.address, true));

        const executorBalanceAfter = await executor.getBalance();
        expect(executorBalanceAfter).to.be.equal(executorBalanceBefore.add(defaults.executionFee));

        const balanceAfter = await defaults.user.getBalance();
        const amountOut = '2490000000000000000';
        expect(balanceAfter, 'balanceAfter').to.be.equal(balanceBefore.add(amountOut));

        position = positionWrapper(await vaultPositionController.getPosition(defaults.user.address, bnb.address, bnb.address, true));

        expect(position.size, 'position.size').to.be.equal('1500000000000000000000000000000000');
        expect(position.collateral, 'position.collateral').to.be.equal('748500000000000000000000000000000');

        const orderAfter = await orderBook.increaseOrders(defaults.user.address, 0);
        expect(orderAfter.account).to.be.equal(ZERO_ADDRESS);
    });

    it("Cancel decrease order", async () => {
        await defaultCreateDecreaseOrder();
        let order = await getCreatedDecreaseOrder(defaults.user.address);
        expect(order.account).to.not.be.equal(ZERO_ADDRESS);

        await expect(orderBook.connect(defaults.user).cancelDecreaseOrder(1))
            .to.be.revertedWith("OrderBook: non-existent order");

        const balanceBefore = await defaults.user.getBalance();
        const tx = await orderBook.connect(defaults.user).cancelDecreaseOrder(0);
        reportGasUsed(provider, tx, 'cancelDecreaseOrder gas used');

        order = await getCreatedDecreaseOrder(defaults.user.address);
        expect(order.account).to.be.equal(ZERO_ADDRESS);

        const txFees = await getTxFees(provider, tx);
        const balanceAfter = await defaults.user.getBalance();
        expect(balanceAfter).to.be.equal(balanceBefore.add(defaults.executionFee).sub(txFees));
    });
});
