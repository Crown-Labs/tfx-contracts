const { deployContract, contractAt, sendTxn, getContractAddress, getFrameSigner, sleep, expandDecimals } = require("../shared/helpers")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../shared/tokens')[network];

async function main() {
  const signer = await getFrameSigner()

  const vault = await contractAt("Vault", getContractAddress("vault"))
  const vaultPositionController = await contractAt("VaultPositionController", getContractAddress("vaultPositionController"))
  const router = await contractAt("Router", getContractAddress("router"), signer)
  const weth = await contractAt("WETH", tokens.nativeToken.address)
  const referralStorage = await contractAt("ReferralStorage", getContractAddress("referralStorage"), signer)
  const depositFee = 30 // 0.3%
  const minExecutionFee = "300000000000000" // 0.0003 ETH
  const orderKeeper = { address: getContractAddress("keeper") }
  const prevPositionRouter = await contractAt("PositionRouter", getContractAddress("positionRouter"))
  const fulfillController = await contractAt("FulfillController", getContractAddress("fulfillController"), signer)

  console.log(`🪄 Upgrade PositionRouter`);

  // ------------------------------
  // timelock setGov
  // ------------------------------
  // setGov to deployer
  const timelock = await contractAt("Timelock", getContractAddress("timelock"), signer);
  await sendTxn(timelock.signalSetGov(router.address, signer.address), `timelock.signalSetGov(router)`);
  await sendTxn(timelock.signalSetGov(referralStorage.address, signer.address), `timelock.signalSetGov(referralStorage)`);
  
  console.log(`wait for timelock...`);
  await sleep(1000 * 60 * 5.1); // wait 5.1 mins

  await sendTxn(timelock.setGov(router.address, signer.address), `timelock.setGov(router)`);
  await sendTxn(timelock.setGov(referralStorage.address, signer.address), `timelock.setGov(referralStorage)`);
  
  // ------------------------------
  // deploy
  // ------------------------------
  // deploy positionRouter
  const positionRouter = await deployContract("PositionRouter", [vault.address, vaultPositionController.address, router.address, weth.address, depositFee, minExecutionFee], "PositionRouter", signer, { gasLimit: 5000000 })

  // ------------------------------
  // migrate
  // ------------------------------
  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(positionRouter.setDelayValues(1, 180, 30 * 60), "positionRouter.setDelayValues")
  await sendTxn(positionRouter.setPositionKeeper(orderKeeper.address, true), "positionRouter.setPositionKeeper")
  
  await sendTxn(positionRouter.setFulfillController(fulfillController.address, getContractAddress("feeReceiver")), `positionRouter.setFulfillController`);

  await sendTxn(referralStorage.setHandler(prevPositionRouter.address, false), "referralStorage.setHandler(prevPositionRouter,false)")
  await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter,true)")

  await sendTxn(router.removePlugin(prevPositionRouter.address), "router.removePlugin(prevPositionRouter)");
  await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin(positionRouter)")

  await sendTxn(fulfillController.setHandler(prevPositionRouter.address, false), `fulfillController.setHandler(prevPositionRouter)`);
  await sendTxn(fulfillController.setHandler(positionRouter.address, true), `fulfillController.setHandler(positionRouter)`);
  
  // ------------------------------
  // Set timelock
  // ------------------------------
  await sendTxn(router.setGov(timelock.address), `router.setGov(timelock)`);
  await sendTxn(referralStorage.setGov(timelock.address), `referralStorage.setGov(timelock)`);

  await sendTxn(timelock.setContractHandler(prevPositionRouter.address, false), "timelock.setContractHandler(prevPositionRouter,false)")
  await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter,true)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })