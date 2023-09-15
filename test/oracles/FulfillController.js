const { expect, use } = require("chai");
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals } = require("../shared/utilities")
const { toXOraclePrice } = require("../shared/chainlink")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")
const { toUsd } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("../core/Vault/helpers")

use(solidity)

describe("\n📌 ### Test fulfillController ###\n", function () {
    const provider = waffle.provider
    const [ deployer, handler, controller, user0, user1, user2, liquidator] = provider.getWallets()
    const { AddressZero} = ethers.constants
    let vault
    let vaultUtils
    let vaultPriceFeed
    let positionManager
    let usdg
    let router
    let xOracle
    let fulfillController
    let testSwap
    let btc
    let busd
    let bnb
    let orderBook
    let orderBookOpenOrder

    beforeEach("Deploy fulfillController Contract", async function () {
        btc = await deployContract("Token", [])
        busd = await deployContract("Token", [])
        bnb = await deployContract("Token", [])

        vault = await deployContract("Vault", [])
        vaultPositionController = await deployContract("VaultPositionController", [])
        await vault.setIsLeverageEnabled(false)
        usdg = await deployContract("USDG", [vault.address])
        router = await deployContract("Router", [vault.address, vaultPositionController.address, usdg.address, bnb.address])
        vaultPriceFeed = await deployContract("VaultPriceFeed", [])

        const initVaultResult = await initVault(vault, vaultPositionController, router, usdg, vaultPriceFeed)
        vaultUtils = initVaultResult.vaultUtils

        // deploy xOracle
        xOracle = await deployXOracle(bnb);
        const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

        // deploy fulfillController
        fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address, 0])
        testSwap = await deployContract("TestSwapMock", [fulfillController.address, xOracle.address])
        
        // deposit req fund to fulfillController
        await bnb.mint(fulfillController.address, ethers.utils.parseEther("1.0"))

        // setTokenConfig
		await vault.setTokenConfig(...getDaiConfig(busd))
        await vault.setTokenConfig(...getBtcConfig(btc))
        await vault.setTokenConfig(...getBnbConfig(bnb))
        
        // set vaultPriceFeed
        await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(busd.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT
        
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
        await router.addPlugin(orderBook.address)
        await router.connect(user0).approvePlugin(orderBook.address)

        positionManager = await deployContract("PositionManager", [vault.address, vaultPositionController.address, router.address, bnb.address, 50, orderBook.address])
        
        // setController
        await fulfillController.setController(deployer.address, true);
        
        // setFulfillController
        await positionManager.setFulfillController(fulfillController.address)
        await router.setFulfillController(fulfillController.address)
        
        // setHandler
        await fulfillController.setHandler(testSwap.address, true);
        await fulfillController.setHandler(handler.address, true);
        await fulfillController.setHandler(router.address, true);
        await fulfillController.setHandler(positionManager.address, true);
        
        await testSwap.setToken(btc.address, 0, true)
        await testSwap.setToken(busd.address, 4, true)
    });
    
    it("Test onlyOwner", async function () {
        const account = [ user0, user1, user2 ].at(random(3));

        const revert = "Ownable: caller is not the owner";
        await expect(fulfillController.connect(account).setExpireTime(5 * 60)).to.be.revertedWith(revert);
        await expect(fulfillController.connect(account).setHandler(account.address, true)).to.be.revertedWith(revert);
        await expect(fulfillController.connect(account).setController(account.address, true)).to.be.revertedWith(revert);
        await expect(fulfillController.connect(account).adminWithdraw(0)).to.be.revertedWith(revert);
    });

    it("Test onlyController", async function () {
        const account = [ user0, user1, user2 ].at(random(3));

        const revert = "controller: forbidden";
        await expect(fulfillController.connect(account).requestUpdatePrices()).to.be.revertedWith(revert);
        await expect(fulfillController.connect(account).refundTask(0)).to.be.revertedWith(revert);
        
        // setController false
        await expect(fulfillController.connect(controller).requestUpdatePrices()).to.be.revertedWith(revert);
        await expect(fulfillController.connect(controller).refundTask(0)).to.be.revertedWith(revert);

        // setController true
        await fulfillController.setController(controller.address, true);
    });

    it("Test onlyHandler", async function () {
        const account = [ user0, user1, user2 ].at(random(3));

        const revert = "handler: forbidden";
        await expect(fulfillController.connect(account).requestOracle([], account.address, [])).to.be.revertedWith(revert);
        await expect(fulfillController.connect(account).requestOracleWithToken([], account.address, btc.address, 1, false, [])).to.be.revertedWith(revert);
        
        // setHandler false
        await fulfillController.setHandler(deployer.address, false);
        await expect(fulfillController.connect(deployer).requestOracle([], deployer.address, [])).to.be.revertedWith(revert);
        await expect(fulfillController.connect(deployer).requestOracleWithToken([], deployer.address, btc.address, 1, false, [])).to.be.revertedWith(revert);

        // setHandler true
        await fulfillController.setHandler(handler.address, true);
    });

    it("Test RequestOracleWithToken", async function() {
        // no Data
        await expect(fulfillController.connect(handler).requestOracleWithToken([], user0.address, btc.address, 1, false, [])).to.be.revertedWith("data invalid");
       
        // no Account and token address
        // function test(true)
        const data = "0x36091dff0000000000000000000000000000000000000000000000000000000000000001";
        await expect(fulfillController.connect(handler).requestOracleWithToken(data, AddressZero, btc.address, 1, false, [])).to.be.revertedWith("address invalid");
        // _transferETH = true
        await expect(fulfillController.connect(handler).requestOracleWithToken(data, user0.address, btc.address, 1, true, [])).to.be.revertedWith("address invalid");

        await btc.mint(handler.address, expandDecimals(2, 8));
        await btc.connect(handler).approve(fulfillController.address, expandDecimals(2, 8));
        await expect(fulfillController.connect(handler).requestOracleWithToken(data, user0.address, btc.address, expandDecimals(3, 8), false, [])).to.be.revertedWith("ERC20: transfer amount exceeds balance");

        await fulfillController.connect(handler).requestOracleWithToken(data, user0.address, btc.address, expandDecimals(2, 8), false, [])

        let task = await fulfillController.tasks(1);

        await expect(task.to).eq(handler.address)
        await expect(task.data).eq(data)
        await expect(task.token).eq(btc.address);
        await expect(task.amount).eq(expandDecimals(2, 8));
        await expect(task.transferETH).eq(false);
        await expect(task.owner).eq(user0.address);
        await expect(task.status).eq(0);
        await expect(task.expire).above(0);
    }); 
    
    it("swap, refundTask", async function() {
        await busd.mint(testSwap.address, expandDecimals(100000000, 18))
        await btc.mint(user0.address, expandDecimals(2, 18))

        await btc.connect(user0).approve(testSwap.address, expandDecimals(1, 18))
        // swap task 1
        await testSwap.connect(user0).swap([btc.address, busd.address], expandDecimals(1, 18), expandDecimals(29000, 18))

        // expect 
        // 1. btc.balanceOf(user) = 2-1 btc
        expect(await btc.balanceOf(user0.address)).eq(expandDecimals(1, 18));
        
        // 2. btc.balanceOf(fulfillController) = 1 btc
        expect(await btc.balanceOf(fulfillController.address)).eq(expandDecimals(1, 18));

        // 3. xOracle.request owner, reqId

        reqId = (await xOracle.reqId())
        const request = await xOracle.requests(reqId)
        await expect(request.owner).eq(fulfillController.address)

        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(30000), lastUpdate: 0 }
        ], 0 /* reqId */ )

        // expect 
        // 1. btc.balanceOf(user) = 2-1 btc
        expect(await btc.balanceOf(user0.address)).eq(expandDecimals(1, 18));
        // 2. btc.balanceOf(fulfillController) = 0 btc
        expect(await btc.balanceOf(fulfillController.address)).eq(expandDecimals(0, 18));
        // 3. busd.balanceOf(user) = 30000 BUSD
        expect(await busd.balanceOf(user0.address)).eq(expandDecimals(30000, 18));
        // 4. busd.balanceOf(testSwap) = 100000000 - 30000 BUSD
        expect(await busd.balanceOf(testSwap.address)).eq(expandDecimals(100000000 - 30000, 18));
        // 5. btc.balanceOf(testSwap) = 1 btc
        expect(await btc.balanceOf(testSwap.address)).eq(expandDecimals(1, 18));
 
        await btc.connect(user0).approve(testSwap.address, expandDecimals(1, 18))
        // swap with revert // slippage 1 %
        await testSwap.connect(user0).swap([btc.address, busd.address], expandDecimals(1, 18), expandDecimals(29700, 18))
        // btc.balanceOf(user) = 1 - 1 = 0 btc
        expect(await btc.balanceOf(user0.address)).eq(expandDecimals(0, 18));
        // btc.balanceOf(fulfillController) = 1 btc
        expect(await btc.balanceOf(fulfillController.address)).eq(expandDecimals(1, 18));

        // function fulfillRequest(PriceData[] memory _data, uint256 _reqId) external {
        // slippage 1 %
        const lastReqId = 2;
        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(29699), lastUpdate: 0 }
        ], lastReqId /* reqId */ )
        
        // revert
        // btc.balanceOf(user) = 0 + 1 = 1 btc
        expect(await btc.balanceOf(user0.address)).eq(expandDecimals(1, 18));
        // btc.balanceOf(fulfillController) = 0 btc
        expect(await btc.balanceOf(fulfillController.address)).eq(expandDecimals(0, 18));
        expect(await btc.balanceOf(testSwap.address)).eq(expandDecimals(1, 18));
        
        // refundTask
        const taskWithRevert = await fulfillController.tasks(2)
        await expect(taskWithRevert.status).eq(2);
    });

    it("Test requestOracle", async function () {
        // no Data
        await expect(fulfillController.connect(handler).requestOracle([], user0.address, [])).to.be.revertedWith("data invalid");
       
        // no Account
        // function test(true)
        const data = "0x36091dff0000000000000000000000000000000000000000000000000000000000000001";
        await expect(fulfillController.connect(handler).requestOracle(data, AddressZero, [])).to.be.revertedWith("address invalid");

        await fulfillController.connect(handler).requestOracle(data, user0.address, [])

        let task = await fulfillController.tasks(1);

        await expect(task.to).eq(handler.address)
        await expect(task.data).eq(data)
        await expect(task.token).eq(AddressZero);
        await expect(task.amount).eq(0);
        await expect(task.transferETH).eq(false);
        await expect(task.owner).eq(user0.address);
        await expect(task.status).eq(0);
        await expect(task.expire).above(0);


    });
    
    it("Test requestOracleForLiquidate", async function () {
        await fulfillController.requestUpdatePrices()
        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
          ], 0)

        await bnb.mint(user1.address, expandDecimals(1000, 18))
        await bnb.connect(user1).approve(router.address, expandDecimals(1000, 18))
        await router.connect(user1).swap([bnb.address, usdg.address], expandDecimals(1000, 18), expandDecimals(29000, 18), user1.address)
        await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
        ], 0)
    
        await busd.mint(user1.address, expandDecimals(30000, 18))
        await busd.connect(user1).approve(router.address, expandDecimals(30000, 18))
        await router.connect(user1).swap([busd.address, usdg.address], expandDecimals(30000, 18), expandDecimals(29000, 18), user1.address)
        await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
        ], 0)
    
        await btc.mint(user1.address, expandDecimals(10, 8))
        await btc.connect(user1).approve(router.address, expandDecimals(10, 8))
        await router.connect(user1).swap([btc.address, usdg.address], expandDecimals(10, 8), expandDecimals(59000, 18), user1.address)
        await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
        ], 0)
    
        deployTimelock = async () => {
            return await deployContract("Timelock", [
                deployer.address,
                5 * 24 * 60 * 60,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                expandDecimals(1000, 18),
                10,
                100
            ])
    }
        const timelock = await deployTimelock()
        await vault.setGov(timelock.address)
        await timelock.setContractHandler(positionManager.address, true)
        await timelock.setShouldToggleIsLeverageEnabled(true)

        await positionManager.setInLegacyMode(true)
        await router.addPlugin(positionManager.address)
        await router.connect(user0).approvePlugin(positionManager.address)

        await positionManager.setPartner(user0.address, true);

        await positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, toUsd(1000), true, toUsd(100000), { value: expandDecimals(1, 18) })
        let position = await vaultPositionController.getPosition(user0.address, bnb.address, bnb.address, true)

        await fulfillController.requestUpdatePrices()
        await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
        ], 0)

        await expect(positionManager.connect(liquidator).liquidatePosition(user0.address, bnb.address, bnb.address, true, liquidator.address))
        .to.be.revertedWith("PositionManager: forbidden")

        await positionManager.setLiquidator(liquidator.address, true)

        expect(await positionManager.isLiquidator(liquidator.address)).to.be.true

        await positionManager.connect(liquidator).liquidatePosition(user0.address, bnb.address, bnb.address, true, liquidator.address)

        await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
        ], 0)

        // transaction success but position not liquidate
        await positionManager.connect(liquidator).liquidatePosition(user0.address, bnb.address, bnb.address, true, liquidator.address)

        position = await vaultPositionController.getPosition(user0.address, bnb.address, bnb.address, true)
        
        expect(position[0]).eq(toUsd(1000)) // size
        expect(position[1]).eq(toUsd(299)) // collateral
        expect(position[2]).eq(toUsd(300)) // averagePrice

        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(200), lastUpdate: 0 }
            ], 0)

        await positionManager.connect(liquidator).liquidatePosition(user0.address, bnb.address, bnb.address, true, liquidator.address)

        positionAfterLiquidate = await vaultPositionController.getPosition(user0.address, bnb.address, bnb.address, true)

        expect(positionAfterLiquidate[0]).eq(0) // size
        expect(positionAfterLiquidate[1]).eq(0) // collateral
        expect(positionAfterLiquidate[2]).eq(0) // averagePrice
    
        });

    it("Test requestUpdatePrices", async function () {

        await fulfillController.requestUpdatePrices()
        await xOracle.fulfillRequest([
            { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
            { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 }
            ], 0)
        });
})

function random(max) {
    return Math.floor(Math.random() * max);
}