const { deployContract, contractAt, sendTxn, writeTmpAddresses, getFrameSigner, getContractAddress } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const { nativeToken } = tokens
  const signer = await getFrameSigner()
  const minRewardCompound = "10000000000000000"; // 0.01 = $15 ETH $1500

  const xlpManager = await contractAt("XlpManager", getContractAddress("xlpManager"), signer)
  const xlp = await contractAt("XLP", getContractAddress("xlp"), signer)

  await sendTxn(xlp.setInPrivateTransferMode(true), "xlp.setInPrivateTransferMode")

  const feeXlpTracker = await deployContract("RewardTracker", ["Fee XLP", "fXLP"], "fXLP (Fee XLP)", signer)
  const feeXlpDistributor = await deployContract("RewardDistributor", [nativeToken.address, feeXlpTracker.address], "feeXlpDistributor", signer)

  await sendTxn(feeXlpTracker.initialize([xlp.address], feeXlpDistributor.address), "feeXlpTracker.initialize")
  await sendTxn(feeXlpDistributor.updateLastDistributionTime(), "feeXlpDistributor.updateLastDistributionTime")

  await sendTxn(feeXlpTracker.setInPrivateTransferMode(true), "feeXlpTracker.setInPrivateTransferMode")
  await sendTxn(feeXlpTracker.setInPrivateStakingMode(true), "feeXlpTracker.setInPrivateStakingMode")

  const rewardRouter = await deployContract("RewardRouterV3", [], "RewardRouterV3", signer)

  await sendTxn(rewardRouter.initialize(
    nativeToken.address,
    xlp.address,
    feeXlpTracker.address,
    xlpManager.address,
    minRewardCompound
  ), "rewardRouter.initialize")

  await sendTxn(xlpManager.setHandler(rewardRouter.address, true), "xlpManager.setHandler(rewardRouter)")

  // allow feeXlpTracker to stake xlp
  await sendTxn(xlp.setHandler(feeXlpTracker.address, true), "xlp.setHandler(feeXlpTracker)")

  // allow rewardRouter to stake in feeXlpTracker
  await sendTxn(feeXlpTracker.setHandler(rewardRouter.address, true), "feeXlpTracker.setHandler(rewardRouter)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
