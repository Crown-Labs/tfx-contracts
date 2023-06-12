const { deployContract, contractAt, sendTxn, getContractAddress, getFrameSigner, sleep } = require("../shared/helpers")
const { expandDecimals } = require("../../../test/shared/utilities")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const { btc, eth, bnb, busd, /* usdc, usdt */ } = tokens
  const tokenArr = [btc, eth, bnb, busd /*, usdc, usdt*/ ]

  const signer = await getFrameSigner()

  const vault = await contractAt("Vault", getContractAddress("vault"), signer)
  const vaultPriceFeed = await contractAt("VaultPriceFeed", getContractAddress("vaultPriceFeed"), signer)
  const glpManager = await contractAt("GlpManager", getContractAddress("glpManager"), signer)
  const rewardRouterV2 = await contractAt("RewardRouterV2", getContractAddress("rewardRouterV2"), signer)
  const router = await contractAt("Router", getContractAddress("router"), signer)
  const positionManager = await contractAt("PositionManager", getContractAddress("positionManager"), signer)
  const positionRouter = await contractAt("PositionRouter", getContractAddress("positionRouter"), signer)
  const orderBook = await contractAt("OrderBook", getContractAddress("orderBook"), signer)
  let timelock;
  
  // deploy FulfillController
  // const fulfillController = await contractAt("FulfillController", getContractAddress("fulfillController"), signer)
  const fulfillController = await deployContract("FulfillController", [getContractAddress("xOracle"), bnb.address], "", signer)

  const isUpgradeFulfillController = (await router.fulfillController()).toLowerCase() != "0x0000000000000000000000000000000000000000";
  if (isUpgradeFulfillController) {
    console.log(`🪄 Upgrade FulfillController to ${fulfillController.address}`);
    
    // setGov to deployer
    timelock = await contractAt("Timelock", getContractAddress("timelock"), signer)
    await sendTxn(timelock.signalSetGov(router.address, signer.address), `timelock.signalSetGov(router)`);
    
    console.log(`wait for timelock...`);
    await sleep(1000 * 60 * 5.1); // wait 5.1 mins

    await sendTxn(timelock.setGov(router.address, signer.address), `timelock.setGov(router)`);
  }

  // setFulfillController
  await sendTxn(glpManager.setFulfillController(fulfillController.address), `glpManager.setFulfillController`);
  await sendTxn(rewardRouterV2.setFulfillController(fulfillController.address), `rewardRouterV2.setFulfillController`);
  await sendTxn(router.setFulfillController(fulfillController.address), `router.setFulfillController`);
  await sendTxn(positionManager.setFulfillController(fulfillController.address), `positionManager.setFulfillController`);
  await sendTxn(positionRouter.setFulfillController(fulfillController.address, getContractAddress("feeReceiver")), `positionRouter.setFulfillController`);
  await sendTxn(orderBook.setFulfillController(fulfillController.address), `orderBook.setFulfillController`);

  // setHandler
  await sendTxn(fulfillController.setHandler(glpManager.address, true), `fulfillController.setHandler(${glpManager.address})`);
  await sendTxn(fulfillController.setHandler(rewardRouterV2.address, true), `fulfillController.setHandler(${rewardRouterV2.address})`);
  await sendTxn(fulfillController.setHandler(router.address, true), `fulfillController.setHandler(${router.address})`);
  await sendTxn(fulfillController.setHandler(positionManager.address, true), `fulfillController.setHandler(${positionManager.address})`);
  await sendTxn(fulfillController.setHandler(positionRouter.address, true), `fulfillController.setHandler(${positionRouter.address})`);
  await sendTxn(fulfillController.setHandler(orderBook.address, true), `fulfillController.setHandler(${orderBook.address})`);

  await sendTxn(positionManager.setMaxExecuteOrder(3), `positionManager.setMaxExecuteOrder(3)`);
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
        expandDecimals(token.maxUsdgAmount, 18), // _maxUsdgAmount
        token.isStable, // _isStable
        token.isShortable // _isShortable
      ), `vault.setTokenConfig(${token.name}) ${token.address}`)
    }
  }

  // setController deployer and Calll requestUpdatePrices
  await sendTxn(fulfillController.setController(signer.address, true), `fulfillController.setController(${signer.address})`);
  await sendTxn(fulfillController.requestUpdatePrices(), `fulfillController.requestUpdatePrices()`);
  
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
