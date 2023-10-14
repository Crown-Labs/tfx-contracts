const { deployContract, contractAt, sendTxn, getContractAddress, getFrameSigner, sleep, expandDecimals } = require("../../shared/helpers")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../shared/tokens')[network];

async function main() {
  const { btc, eth, bnb, usdt, usdc, matic, op, arb, nativeToken } = tokens
  const tokenArr = [btc, eth, bnb, usdt, usdc, matic, op, arb]

  const signer = await getFrameSigner()

  const weth = await contractAt("Token", nativeToken.address, signer)
  const vault = await contractAt("Vault", getContractAddress("vault"), signer)
  const vaultPriceFeed = await contractAt("VaultPriceFeed", getContractAddress("vaultPriceFeed"), signer)
  const xlpManager = await contractAt("XlpManager", getContractAddress("xlpManager"), signer)
  const rewardRouterV3 = await contractAt("RewardRouterV3", getContractAddress("rewardRouterV3"), signer)
  const router = await contractAt("Router", getContractAddress("router"), signer)
  const positionManager = await contractAt("PositionManager", getContractAddress("positionManager"), signer)
  const positionRouter = await contractAt("PositionRouter", getContractAddress("positionRouter"), signer)
  const orderBook = await contractAt("OrderBook", getContractAddress("orderBook"), signer)
  let timelock;

  const lastTaskId = 0;
  const depositWETH = "0.1";
  
  // deploy FulfillController
  const fulfillController = await deployContract("FulfillController", [getContractAddress("xOracle"), nativeToken.address, lastTaskId], "", signer)
  // const fulfillController = await contractAt("FulfillController", getContractAddress("fulfillController"), signer)

  const prevFulfillControllerAddress = await router.fulfillController();
  const isUpgradeFulfillController = prevFulfillControllerAddress.toLowerCase() != "0x0000000000000000000000000000000000000000";
  if (isUpgradeFulfillController) {
    console.log(`🪄 Upgrade FulfillController to ${fulfillController.address}`);

    // adminWithdraw
    const prevFulfillController = await contractAt("FulfillController", prevFulfillControllerAddress, signer)
    const prevFund = await weth.balanceOf(prevFulfillControllerAddress);
    await sendTxn(prevFulfillController.adminWithdraw(prevFund), `prevFulfillController.adminWithdraw(${prevFund})`);

    // setGov to deployer
    timelock = await contractAt("Timelock", getContractAddress("timelock"), signer)
    await sendTxn(timelock.signalSetGov(router.address, signer.address), `timelock.signalSetGov(router)`);
    
    console.log(`wait for timelock...`);
    await sleep(1000 * 60 * 5.1); // wait 5.1 mins

    await sendTxn(timelock.setGov(router.address, signer.address), `timelock.setGov(router)`);
  }

  // setFulfillController
  await sendTxn(xlpManager.setFulfillController(fulfillController.address), `xlpManager.setFulfillController`);
  await sendTxn(rewardRouterV3.setFulfillController(fulfillController.address), `rewardRouterV3.setFulfillController`);
  await sendTxn(router.setFulfillController(fulfillController.address), `router.setFulfillController`);
  await sendTxn(positionManager.setFulfillController(fulfillController.address), `positionManager.setFulfillController`);
  await sendTxn(positionRouter.setFulfillController(fulfillController.address, getContractAddress("feeReceiver")), `positionRouter.setFulfillController`);
  await sendTxn(orderBook.setFulfillController(fulfillController.address), `orderBook.setFulfillController`);

  // setHandler
  await sendTxn(fulfillController.setHandler(xlpManager.address, true), `fulfillController.setHandler(${xlpManager.address})`);
  await sendTxn(fulfillController.setHandler(rewardRouterV3.address, true), `fulfillController.setHandler(${rewardRouterV3.address})`);
  await sendTxn(fulfillController.setHandler(router.address, true), `fulfillController.setHandler(${router.address})`);
  await sendTxn(fulfillController.setHandler(positionManager.address, true), `fulfillController.setHandler(${positionManager.address})`);
  await sendTxn(fulfillController.setHandler(positionRouter.address, true), `fulfillController.setHandler(${positionRouter.address})`);
  await sendTxn(fulfillController.setHandler(orderBook.address, true), `fulfillController.setHandler(${orderBook.address})`);

  await sendTxn(positionManager.setMaxExecuteOrder(1), `positionManager.setMaxExecuteOrder(1)`);
  await sendTxn(positionManager.setOrderKeeper(getContractAddress("keeper"), true), `positionManager.setOrderKeeper(${getContractAddress("keeper")})`);
  await sendTxn(positionManager.setLiquidator(getContractAddress("liquidator"), true), `positionManager.setLiquidator(${getContractAddress("liquidator")})`);

  if (isUpgradeFulfillController) {
    // setGov to timelock
    await sendTxn(router.setGov(timelock.address), `router.setGov(timelock)`);
  } else {
    // whitelist tokens
    for (const token of tokenArr) {
      console.log("setTokenConfig:", token.name);

      await sendTxn(vaultPriceFeed.setTokenConfig(
        token.address, // _token
        token.priceFeed, // _priceFeed
        token.priceDecimals, // _priceDecimals
        token.isStrictStable // _isStrictStable
      ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)

      await sendTxn(vault.setTokenConfig(
        token.address, // _token
        token.decimals, // _tokenDecimals
        token.tokenWeight, // _tokenWeight
        token.minProfitBps, // _minProfitBps
        expandDecimals(token.maxUsdxAmount, 18), // _maxUsdxAmount
        token.isStable, // _isStable
        token.isShortable // _isShortable
      ), `vault.setTokenConfig(${token.name}) ${token.address}`)
    }
  }

  // setController deployer and Calll requestUpdatePrices
  await sendTxn(fulfillController.setController(signer.address, true), `fulfillController.setController(${signer.address})`);

  // wrap ETH and deposit fund
  await sendTxn(weth.deposit({ value: ethers.utils.parseEther(depositWETH) }), `weth.deposit(${depositWETH})`);
  await sendTxn(weth.transfer(fulfillController.address, ethers.utils.parseEther(depositWETH)), `weth.transfer(${fulfillController.address})`);
  
  // requestUpdatePrices
  await sendTxn(fulfillController.requestUpdatePrices(), `fulfillController.requestUpdatePrices()`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
