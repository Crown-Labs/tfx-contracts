const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const rewardRouter = await contractAt("RewardRouter", "0xEa7fCb85802713Cb03291311C66d6012b23402ea")
  const bnGmx = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921")
  const xlpManager = await contractAt("XlpManager", "0x91425Ac4431d068980d497924DD540Ae274f3270")

  const stakedGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusGmxTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeGmxTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  const feeXlpTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6")
  const stakedXlpTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")

  // allow rewardRouter to stake in stakedGmxTracker
  await sendTxn(stakedGmxTracker.setHandler(rewardRouter.address, false), "stakedGmxTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in bonusGmxTracker
  await sendTxn(bonusGmxTracker.setHandler(rewardRouter.address, false), "bonusGmxTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeGmxTracker
  await sendTxn(feeGmxTracker.setHandler(rewardRouter.address, false), "feeGmxTracker.setHandler(rewardRouter)")
  // allow rewardRouter to burn bnGmx
  await sendTxn(bnGmx.setMinter(rewardRouter.address, false), "bnGmx.setMinter(rewardRouter)")

  // allow rewardRouter to mint in xlpManager
  await sendTxn(xlpManager.setHandler(rewardRouter.address, false), "xlpManager.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeXlpTracker
  await sendTxn(feeXlpTracker.setHandler(rewardRouter.address, false), "feeXlpTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedXlpTracker
  await sendTxn(stakedXlpTracker.setHandler(rewardRouter.address, false), "stakedXlpTracker.setHandler(rewardRouter)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
