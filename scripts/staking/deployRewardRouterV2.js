const { deployContract, contractAt, sendTxn, writeTmpAddresses, getFrameSigner, getContractAddress } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const { nativeToken } = tokens
  const signer = await getFrameSigner()

  const vestingDuration = 365 * 24 * 60 * 60

  const xlpManager = await contractAt("XlpManager", getContractAddress("xlpManager"), signer)
  const xlp = await contractAt("XLP", getContractAddress("xlp"), signer)

  /*const gmx = await contractAt("GMX", "0x62edc0692BD897D2295872a9FFCac5425011c661");
  const esGmx = await contractAt("EsGMX", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17");*/
  const gmx = await deployContract("GMX", [], "GMX", signer);
  const esGmx = await deployContract("EsGMX", [], "esGmx", signer);
  const bnGmx = await deployContract("MintableBaseToken", ["Bonus GMX", "bnGMX", 0], "bnGmx", signer);

  await sendTxn(esGmx.setInPrivateTransferMode(true), "esGmx.setInPrivateTransferMode")
  await sendTxn(xlp.setInPrivateTransferMode(true), "xlp.setInPrivateTransferMode")

  const stakedGmxTracker = await deployContract("RewardTracker", ["Staked GMX", "sGMX"], "1. sGMX (Staked GMX)", signer)
  const stakedGmxDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGmxTracker.address], "1. stakedGmxDistributor", signer)
  await sendTxn(stakedGmxTracker.initialize([gmx.address, esGmx.address], stakedGmxDistributor.address), "stakedGmxTracker.initialize")
  await sendTxn(stakedGmxDistributor.updateLastDistributionTime(), "stakedGmxDistributor.updateLastDistributionTime")

  const bonusGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus GMX", "sbGMX"], "2. sbGMX (Staked + Bonus GMX)", signer)
  const bonusGmxDistributor = await deployContract("BonusDistributor", [bnGmx.address, bonusGmxTracker.address], "2. BonusDistributor", signer)
  await sendTxn(bonusGmxTracker.initialize([stakedGmxTracker.address], bonusGmxDistributor.address), "bonusGmxTracker.initialize")
  await sendTxn(bonusGmxDistributor.updateLastDistributionTime(), "bonusGmxDistributor.updateLastDistributionTime")

  const feeGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee GMX", "sbfGMX"], "3. sbfGMX (Staked + Bonus + Fee GMX)", signer)
  const feeGmxDistributor = await deployContract("RewardDistributor", [nativeToken.address, feeGmxTracker.address], "3. feeGmxDistributor", signer)
  await sendTxn(feeGmxTracker.initialize([bonusGmxTracker.address, bnGmx.address], feeGmxDistributor.address), "feeGmxTracker.initialize")
  await sendTxn(feeGmxDistributor.updateLastDistributionTime(), "feeGmxDistributor.updateLastDistributionTime")

  const feeXlpTracker = await deployContract("RewardTracker", ["Fee GLP", "fGLP"], "4. fGLP (Fee GLP)", signer)
  const feeXlpDistributor = await deployContract("RewardDistributor", [nativeToken.address, feeXlpTracker.address], "4. feeXlpDistributor", signer)
  await sendTxn(feeXlpTracker.initialize([xlp.address], feeXlpDistributor.address), "feeXlpTracker.initialize")
  await sendTxn(feeXlpDistributor.updateLastDistributionTime(), "feeXlpDistributor.updateLastDistributionTime")

  const stakedXlpTracker = await deployContract("RewardTracker", ["Fee + Staked GLP", "fsGLP"], "5. fsGLP (Fee + Staked GLP)", signer)
  const stakedXlpDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedXlpTracker.address], "5. stakedXlpDistributor", signer)
  await sendTxn(stakedXlpTracker.initialize([feeXlpTracker.address], stakedXlpDistributor.address), "stakedXlpTracker.initialize")
  await sendTxn(stakedXlpDistributor.updateLastDistributionTime(), "stakedXlpDistributor.updateLastDistributionTime")

  await sendTxn(stakedGmxTracker.setInPrivateTransferMode(true), "stakedGmxTracker.setInPrivateTransferMode")
  await sendTxn(stakedGmxTracker.setInPrivateStakingMode(true), "stakedGmxTracker.setInPrivateStakingMode")
  await sendTxn(bonusGmxTracker.setInPrivateTransferMode(true), "bonusGmxTracker.setInPrivateTransferMode")
  await sendTxn(bonusGmxTracker.setInPrivateStakingMode(true), "bonusGmxTracker.setInPrivateStakingMode")
  await sendTxn(bonusGmxTracker.setInPrivateClaimingMode(true), "bonusGmxTracker.setInPrivateClaimingMode")
  await sendTxn(feeGmxTracker.setInPrivateTransferMode(true), "feeGmxTracker.setInPrivateTransferMode")
  await sendTxn(feeGmxTracker.setInPrivateStakingMode(true), "feeGmxTracker.setInPrivateStakingMode")

  await sendTxn(feeXlpTracker.setInPrivateTransferMode(true), "feeXlpTracker.setInPrivateTransferMode")
  await sendTxn(feeXlpTracker.setInPrivateStakingMode(true), "feeXlpTracker.setInPrivateStakingMode")
  await sendTxn(stakedXlpTracker.setInPrivateTransferMode(true), "stakedXlpTracker.setInPrivateTransferMode")
  await sendTxn(stakedXlpTracker.setInPrivateStakingMode(true), "stakedXlpTracker.setInPrivateStakingMode")

  const gmxVester = await deployContract("Vester", [
    "Vested GMX", // _name
    "vGMX", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    feeGmxTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedGmxTracker.address, // _rewardTracker
  ], "vestedGMX", signer)

  const xlpVester = await deployContract("Vester", [
    "Vested GLP", // _name
    "vGLP", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    stakedXlpTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedXlpTracker.address, // _rewardTracker
  ], "vestedGLP", signer)

  const rewardRouter = await deployContract("RewardRouterV2", [], "", signer)
  await sendTxn(rewardRouter.initialize(
    nativeToken.address,
    gmx.address,
    esGmx.address,
    bnGmx.address,
    xlp.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    feeGmxTracker.address,
    feeXlpTracker.address,
    stakedXlpTracker.address,
    xlpManager.address,
    gmxVester.address,
    xlpVester.address
  ), "rewardRouter.initialize")

  //await sendTxn(xlpManager.setHandler(rewardRouter.address), "xlpManager.setHandler(rewardRouter)")
  await sendTxn(xlpManager.setHandler(rewardRouter.address, true), "xlpManager.setHandler(rewardRouter)")

  // allow rewardRouter to stake in stakedGmxTracker
  await sendTxn(stakedGmxTracker.setHandler(rewardRouter.address, true), "stakedGmxTracker.setHandler(rewardRouter)")
  // allow bonusGmxTracker to stake stakedGmxTracker
  await sendTxn(stakedGmxTracker.setHandler(bonusGmxTracker.address, true), "stakedGmxTracker.setHandler(bonusGmxTracker)")
  // allow rewardRouter to stake in bonusGmxTracker
  await sendTxn(bonusGmxTracker.setHandler(rewardRouter.address, true), "bonusGmxTracker.setHandler(rewardRouter)")
  // allow bonusGmxTracker to stake feeGmxTracker
  await sendTxn(bonusGmxTracker.setHandler(feeGmxTracker.address, true), "bonusGmxTracker.setHandler(feeGmxTracker)")
  await sendTxn(bonusGmxDistributor.setBonusMultiplier(10000), "bonusGmxDistributor.setBonusMultiplier")
  // allow rewardRouter to stake in feeGmxTracker
  await sendTxn(feeGmxTracker.setHandler(rewardRouter.address, true), "feeGmxTracker.setHandler(rewardRouter)")
  // allow stakedGmxTracker to stake esGmx
  await sendTxn(esGmx.setHandler(stakedGmxTracker.address, true), "esGmx.setHandler(stakedGmxTracker)")
  // allow feeGmxTracker to stake bnGmx
  await sendTxn(bnGmx.setHandler(feeGmxTracker.address, true), "bnGmx.setHandler(feeGmxTracker")
  // allow rewardRouter to burn bnGmx
  await sendTxn(bnGmx.setMinter(rewardRouter.address, true), "bnGmx.setMinter(rewardRouter")

  // allow stakedXlpTracker to stake feeXlpTracker
  await sendTxn(feeXlpTracker.setHandler(stakedXlpTracker.address, true), "feeXlpTracker.setHandler(stakedXlpTracker)")
  // allow feeXlpTracker to stake xlp
  await sendTxn(xlp.setHandler(feeXlpTracker.address, true), "xlp.setHandler(feeXlpTracker)")

  // allow rewardRouter to stake in feeXlpTracker
  await sendTxn(feeXlpTracker.setHandler(rewardRouter.address, true), "feeXlpTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedXlpTracker
  await sendTxn(stakedXlpTracker.setHandler(rewardRouter.address, true), "stakedXlpTracker.setHandler(rewardRouter)")

  await sendTxn(esGmx.setHandler(rewardRouter.address, true), "esGmx.setHandler(rewardRouter)")
  await sendTxn(esGmx.setHandler(stakedGmxDistributor.address, true), "esGmx.setHandler(stakedGmxDistributor)")
  await sendTxn(esGmx.setHandler(stakedXlpDistributor.address, true), "esGmx.setHandler(stakedXlpDistributor)")
  await sendTxn(esGmx.setHandler(stakedXlpTracker.address, true), "esGmx.setHandler(stakedXlpTracker)")
  await sendTxn(esGmx.setHandler(gmxVester.address, true), "esGmx.setHandler(gmxVester)")
  await sendTxn(esGmx.setHandler(xlpVester.address, true), "esGmx.setHandler(xlpVester)")

  await sendTxn(esGmx.setMinter(gmxVester.address, true), "esGmx.setMinter(gmxVester)")
  await sendTxn(esGmx.setMinter(xlpVester.address, true), "esGmx.setMinter(xlpVester)")

  await sendTxn(gmxVester.setHandler(rewardRouter.address, true), "gmxVester.setHandler(rewardRouter)")
  await sendTxn(xlpVester.setHandler(rewardRouter.address, true), "xlpVester.setHandler(rewardRouter)")

  await sendTxn(feeGmxTracker.setHandler(gmxVester.address, true), "feeGmxTracker.setHandler(gmxVester)")
  await sendTxn(stakedXlpTracker.setHandler(xlpVester.address, true), "stakedXlpTracker.setHandler(xlpVester)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
