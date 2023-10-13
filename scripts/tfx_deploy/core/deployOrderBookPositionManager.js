const { getFrameSigner, deployContract, contractAt , sendTxn, writeTmpAddresses, getContractAddress } = require("../shared/helpers")
const { expandDecimals } = require("../../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];
let signer; (async () => { signer = await getFrameSigner() })();

async function getValues() {
  const vault = await contractAt("Vault", getContractAddress("vault"), signer)
  const vaultPositionController = await contractAt("VaultPositionController", getContractAddress("vaultPositionController"))
  // const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const router = await contractAt("Router", getContractAddress("router"), signer)
  const weth = await contractAt("WETH", tokens.nativeToken.address)
  //const orderBook = await contractAt("OrderBook", "0xe2bd3230b1A2947a30Ebb095C4cF0aD3f1e87043")

  const depositFee = 30 // 0.3%

  const orderKeeper = { address: getContractAddress("keeper") }
  const liquidator = { address: getContractAddress("liquidator") }
  const executionFeeReceiver = { address: getContractAddress("feeReceiver") }
  const usdx = { address: getContractAddress("usdx") }

  const partnerContracts = []

  return { vault, vaultPositionController, router, weth, depositFee, orderKeeper, liquidator, executionFeeReceiver, usdx, partnerContracts }
}

async function main() {
  const { nativeToken } = tokens
  const { vault, vaultPositionController, router, weth, depositFee, orderKeeper, liquidator, executionFeeReceiver, usdx, partnerContracts } = await getValues()

  // deploy orderbook
  const orderBook = await deployContract("OrderBook", [], "OrderBook", signer);

  // deploy orderBookOpenOrder
  const orderBookOpenOrder = await deployContract("OrderBookOpenOrder", [orderBook.address,vaultPositionController.address], "OrderBookOpenOrder", signer);

  await sendTxn(orderBook.initialize(
    router.address,
    vault.address,
    vaultPositionController.address,
    orderBookOpenOrder.address,
    nativeToken.address, // weth
    usdx.address, // usdx
    "300000000000000", // 0.0003 BNB
    expandDecimals(10, 30) // min purchase token amount usd
  ), "orderBook.initialize");
  
  // writeTmpAddresses({
  //   orderBook: orderBook.address
  // })

  // deploy positionManager
  const positionManager = await deployContract("PositionManager", [vault.address, vaultPositionController.address, router.address, weth.address, depositFee, orderBook.address], "", signer)
  //const positionManager = await contractAt("PositionManager", "0x87a4088Bd721F83b6c2E5102e2FA47022Cb1c831")

  await sendTxn(positionManager.setOrderKeeper(orderKeeper.address, true), "positionManager.setOrderKeeper(orderKeeper)")
  await sendTxn(positionManager.setLiquidator(liquidator.address, true), "positionManager.setLiquidator(liquidator)")
  // await sendTxn(timelock.setContractHandler(positionManager.address, true), "timelock.setContractHandler(positionRouter)")
  // await sendTxn(timelock.setLiquidator(vault.address, positionManager.address, true), "timelock.setLiquidator(vault, positionManager, true)")
  await sendTxn(positionManager.setIncreasePositionBufferBps(100), "positionManager.setIncreasePositionBufferBps(100)")
  await sendTxn(positionManager.setShouldValidateIncreaseOrder(false), "positionManager.setShouldValidateIncreaseOrder(false)")

  await sendTxn(router.addPlugin(positionManager.address), "router.addPlugin(positionManager)")
  await sendTxn(router.addPlugin(orderBook.address), "router.addPlugin(orderBook)")

  // for (let i = 0; i < partnerContracts.length; i++) {
  //   const partnerContract = partnerContracts[i]
  //   await sendTxn(positionManager.setPartner(partnerContract, true), "positionManager.setPartner(partnerContract)")
  // }

  // deploy orderbook upkeep
  // const orderBookUpkeep = await deployContract("OrderBookUpkeep", [60], "", signer); // interval = 60

  // const positionManager = await contractAt("PositionManager", "0x9E4e4D42300e9BC249CfCEf902bcB7A968E41955")
  // const orderBook = await contractAt("OrderBookMeta", "0x6a2A1b38b6FfF6D7EeDC0835501797E36A7a2B3f")
  // const orderBookUpkeep = await contractAt("OrderBookUpkeep", "0xA6B422B336845065D19D453308665d34b6F4414D")

  // const maxExecuteOrder = 3;
  // await sendTxn(orderBookUpkeep.initialize(positionManager.address, orderBook.address, maxExecuteOrder), "orderBookUpkeep.initialize");
  // await sendTxn(orderBookUpkeep.setExecutionFeeReceiver(executionFeeReceiver.address), "orderBookUpkeep.setExecutionFeeReceiver");

  await sendTxn(orderBook.setOrderExecutor(positionManager.address), "orderBook.setOrderExecutor(positionManager)")
  // await sendTxn(orderBook.setChainlinkOrderExecutionActive(true), "orderBook.setChainlinkOrderExecutionActive(true)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
