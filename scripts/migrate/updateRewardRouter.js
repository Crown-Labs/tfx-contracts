const { deployContract, contractAt, sendTxn, getContractAddress, getFrameSigner, sleep, expandDecimals } = require("../shared/helpers")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../shared/tokens')[network];

async function main() {
  const { nativeToken } = tokens
  const signer = await getFrameSigner()
  const minRewardCompound = "10000000000000000"; // 0.01 = $15 ETH $1500

  const xlpManager = await contractAt("XlpManager", getContractAddress("xlpManager"), signer)
  const xlp = await contractAt("XLP", getContractAddress("xlp"), signer)
  const feeXlpTracker = await contractAt("RewardTracker", getContractAddress("fXLP"))
  const prevRewardRouter = await contractAt("RewardRouterV3", getContractAddress("rewardRouterV3"))
  const fulfillController = await contractAt("FulfillController", getContractAddress("fulfillController"), signer)

  console.log(`🪄 Upgrade RewardRouter`);

  // ------------------------------
  // remove previous
  // ------------------------------
  await sendTxn(xlpManager.setHandler(prevRewardRouter.address, false), "xlpManager.setHandler(prevRewardRouter)")
  await sendTxn(feeXlpTracker.setHandler(prevRewardRouter.address, false), "feeXlpTracker.setHandler(prevRewardRouter)")
  await sendTxn(fulfillController.setHandler(prevRewardRouter.address, false), `fulfillController.setHandler(prevRewardRouter)`);
  
  // ------------------------------
  // deploy
  // ------------------------------
  // deploy rewardRouter
  const rewardRouter = await deployContract("RewardRouterV3", [], "RewardRouterV3", signer)

  // initialize
  await sendTxn(rewardRouter.initialize(
    nativeToken.address,
    xlp.address,
    feeXlpTracker.address,
    xlpManager.address,
    minRewardCompound
  ), "rewardRouter.initialize")

  // ------------------------------
  // migrate
  // ------------------------------
  await sendTxn(xlpManager.setHandler(rewardRouter.address, true), "xlpManager.setHandler(rewardRouter)")
  await sendTxn(feeXlpTracker.setHandler(rewardRouter.address, true), "feeXlpTracker.setHandler(rewardRouter)")
  await sendTxn(fulfillController.setHandler(positionRouter.address, true), `fulfillController.setHandler(positionRouter)`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })