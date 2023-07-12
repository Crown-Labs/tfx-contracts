const { deployContract, contractAt, sendTxn, getContractAddress, getFrameSigner, sleep } = require("../shared/helpers")
const { expandDecimals } = require("../../../test/shared/utilities")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const signer = await getFrameSigner()

  const vault = await contractAt("Vault", getContractAddress("vault"))
  const vaultPositionController = await contractAt("VaultPositionController", getContractAddress("vaultPositionController"))
  const router = await contractAt("Router", getContractAddress("router"), signer)
  const weth = await contractAt("WETH", tokens.nativeToken.address)
  const depositFee = 30 // 0.3%
  const orderKeeper = { address: getContractAddress("keeper") }
  const liquidator = { address: getContractAddress("liquidator") }
  const usdg = { address: getContractAddress("usdg") }
  const positionRouter = await contractAt("PositionRouter", getContractAddress("positionRouter"))
  const prevOrderBook = await contractAt("OrderBook", getContractAddress("orderBook"))
  const prevPositionManager = await contractAt("PositionManager", getContractAddress("positionManager"))
  const fulfillController = await contractAt("FulfillController", getContractAddress("fulfillController"), signer)

  console.log(`🪄 Upgrade OrderBook, PositionManager`);

  // ------------------------------
  // timelock setGov
  // ------------------------------
  // setGov to deployer
  const timelock = await contractAt("Timelock", getContractAddress("timelock"), signer);
  await sendTxn(timelock.signalSetGov(router.address, signer.address), `timelock.signalSetGov(router)`);
  
  console.log(`wait for timelock...`);
  await sleep(1000 * 60 * 5.1); // wait 5.1 mins

  await sendTxn(timelock.setGov(router.address, signer.address), `timelock.setGov(router)`);
  
  // ------------------------------
  // deploy
  // ------------------------------
  // deploy positionManagerReader
  const positionManagerReader = await deployContract("PositionManagerReader", [], "PositionManagerReader", signer)

  // deploy orderbook
  const orderBook = await deployContract("OrderBook", [], "OrderBook", signer);

  // deploy orderBookOpenOrder
  const orderBookOpenOrder = await deployContract("OrderBookOpenOrder", [orderBook.address,vaultPositionController.address], "OrderBookOpenOrder", signer);

  await sendTxn(orderBook.initialize(
    router.address,
    vault.address,
    vaultPositionController.address,
    orderBookOpenOrder.address,
    tokens.nativeToken.address, // weth
    usdg.address, // usdg
    "300000000000000", // 0.0003 BNB
    expandDecimals(10, 30) // min purchase token amount usd
  ), "orderBook.initialize");

  // deploy positionManager
  const positionManager = await deployContract("PositionManager", [vault.address, vaultPositionController.address, router.address, weth.address, depositFee, orderBook.address], "", signer)
  
  // ------------------------------
  // migrate
  // ------------------------------
  await sendTxn(positionManager.setOrderKeeper(orderKeeper.address, true), "positionManager.setOrderKeeper(orderKeeper)");
  await sendTxn(positionManager.setLiquidator(liquidator.address, true), "positionManager.setLiquidator(liquidator)");
  await sendTxn(positionManager.setIncreasePositionBufferBps(100), "positionManager.setIncreasePositionBufferBps(100)");
  await sendTxn(positionManager.setShouldValidateIncreaseOrder(false), "positionManager.setShouldValidateIncreaseOrder(false)");
  await sendTxn(positionManager.setMaxExecuteOrder(1), `positionManager.setMaxExecuteOrder(1)`);
  await sendTxn(positionManager.setFulfillController(fulfillController.address), `positionManager.setFulfillController`);

  await sendTxn(router.removePlugin(prevPositionManager.address), "router.removePlugin(prevPositionManager)");
  await sendTxn(router.removePlugin(prevOrderBook.address), "router.removePlugin(prevOrderBook)");

  await sendTxn(router.addPlugin(positionManager.address), "router.addPlugin(positionManager)");
  await sendTxn(router.addPlugin(orderBook.address), "router.addPlugin(orderBook)");

  await sendTxn(orderBook.setOrderExecutor(positionManager.address), "orderBook.setOrderExecutor(positionManager)");
  await sendTxn(orderBook.setFulfillController(fulfillController.address), `orderBook.setFulfillController`);

  await sendTxn(fulfillController.setHandler(prevPositionManager.address, false), "fulfillController.setHandler(prevPositionManager)");
  await sendTxn(fulfillController.setHandler(positionManager.address, true), "fulfillController.setHandler(positionManager)");

  await sendTxn(fulfillController.setHandler(prevOrderBook.address, false), "fulfillController.setHandler(prevOrderBook)");
  await sendTxn(fulfillController.setHandler(orderBook.address, true), `fulfillController.setHandler(orderBook)`);
  
  // ------------------------------
  // Set timelock
  // ------------------------------
  await sendTxn(router.setGov(timelock.address), `router.setGov(timelock)`);
  
  await sendTxn(timelock.setContractHandler(prevPositionManager.address, false), "timelock.setContractHandler(prevPositionManager)")
  await sendTxn(timelock.setContractHandler(positionManager.address, true), "timelock.setContractHandler(positionManager)")

  await sendTxn(timelock.setLiquidator(vault.address, prevPositionManager.address, false), "timelock.setLiquidator(vault, positionManager, false)")
  await sendTxn(timelock.setLiquidator(vault.address, positionManager.address, true), "timelock.setLiquidator(vault, positionManager, true)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })