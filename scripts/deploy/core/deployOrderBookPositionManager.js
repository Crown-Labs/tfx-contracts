const { getFrameSigner, deployContract, contractAt , sendTxn, writeTmpAddresses, getContractAddress, expandDecimals } = require("../../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../../shared/tokens')[network];

async function main() {
  const signer = await getFrameSigner()
  const { nativeToken } = tokens

  const vault = await contractAt("Vault", getContractAddress("vault"), signer)
  const vaultPositionController = await contractAt("VaultPositionController", getContractAddress("vaultPositionController"))
  const router = await contractAt("Router", getContractAddress("router"), signer)
  const weth = await contractAt("WETH", tokens.nativeToken.address)
  const depositFee = 10 // 0.1%

  const orderKeeper = { address: getContractAddress("keeper") }
  const liquidator = { address: getContractAddress("liquidator") }
  const executionFeeReceiver = { address: getContractAddress("feeReceiver") }
  const usdx = { address: getContractAddress("usdx") }

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

  // deploy positionManager
  const positionManager = await deployContract("PositionManager", [vault.address, vaultPositionController.address, router.address, weth.address, depositFee, orderBook.address], "", signer)

  await sendTxn(positionManager.setOrderKeeper(orderKeeper.address, true), "positionManager.setOrderKeeper(orderKeeper)")
  await sendTxn(positionManager.setLiquidator(liquidator.address, true), "positionManager.setLiquidator(liquidator)")
  await sendTxn(positionManager.setIncreasePositionBufferBps(100), "positionManager.setIncreasePositionBufferBps(100)")
  await sendTxn(positionManager.setShouldValidateIncreaseOrder(false), "positionManager.setShouldValidateIncreaseOrder(false)")

  await sendTxn(router.addPlugin(positionManager.address), "router.addPlugin(positionManager)")
  await sendTxn(router.addPlugin(orderBook.address), "router.addPlugin(orderBook)")

  await sendTxn(orderBook.setOrderExecutor(positionManager.address), "orderBook.setOrderExecutor(positionManager)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
