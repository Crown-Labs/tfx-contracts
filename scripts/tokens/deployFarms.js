const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const usdx = await contractAt("USDX", "0x85E76cbf4893c1fbcB34dCF1239A91CE2A4CF5a7")
  const wbnb = await contractAt("WETH", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c")
  const xgmt = await contractAt("YieldToken", "0xe304ff0983922787Fd84BC9170CD21bF78B16B10")

  const gmtUsdxPair = { address: "0xa41e57459f09a126F358E118b693789d088eA8A0" }
  const gmtUsdxFarm = await deployContract("YieldFarm", ["GMT-USDX Farm", "GMT-USDX:FARM", gmtUsdxPair.address], "gmtUsdxFarm")

  const xgmtUsdxPair = { address: "0x0b622208fc0691C2486A3AE6B7C875b4A174b317" }
  const xgmtUsdxFarm = await deployContract("YieldFarm", ["xGMT-USDX Farm", "xGMT-USDX:FARM", xgmtUsdxPair.address], "xgmtUsdxFarm")

  const usdxYieldTracker = await deployContract("YieldTracker", [usdx.address], "usdxYieldTracker")
  const usdxRewardDistributor = await deployContract("TimeDistributor", [], "usdxRewardDistributor")

  await sendTxn(usdx.setYieldTrackers([usdxYieldTracker.address]), "usdx.setYieldTrackers")
  await sendTxn(usdxYieldTracker.setDistributor(usdxRewardDistributor.address), "usdxYieldTracker.setDistributor")
  await sendTxn(usdxRewardDistributor.setDistribution([usdxYieldTracker.address], ["0"], [wbnb.address]), "usdxRewardDistributor.setDistribution")

  const xgmtYieldTracker = await deployContract("YieldTracker", [xgmt.address], "xgmtYieldTracker")
  const xgmtRewardDistributor = await deployContract("TimeDistributor", [], "xgmtRewardDistributor")

  await sendTxn(xgmt.setYieldTrackers([xgmtYieldTracker.address]), "xgmt.setYieldTrackers")
  await sendTxn(xgmtYieldTracker.setDistributor(xgmtRewardDistributor.address), "xgmtYieldTracker.setDistributor")
  await sendTxn(xgmtRewardDistributor.setDistribution([xgmtYieldTracker.address], ["0"], [wbnb.address]), "xgmtRewardDistributor.setDistribution")

  const gmtUsdxFarmYieldTrackerXgmt = await deployContract("YieldTracker", [gmtUsdxFarm.address], "gmtUsdxFarmYieldTrackerXgmt")
  const gmtUsdxFarmDistributorXgmt = await deployContract("TimeDistributor", [], "gmtUsdxFarmDistributorXgmt")

  await sendTxn(gmtUsdxFarmYieldTrackerXgmt.setDistributor(gmtUsdxFarmDistributorXgmt.address), "gmtUsdxFarmYieldTrackerXgmt.setDistributor")
  await sendTxn(gmtUsdxFarmDistributorXgmt.setDistribution([gmtUsdxFarmYieldTrackerXgmt.address], ["0"], [xgmt.address]), "gmtUsdxFarmDistributorXgmt.setDistribution")

  const gmtUsdxFarmYieldTrackerWbnb = await deployContract("YieldTracker", [gmtUsdxFarm.address], "gmtUsdxFarmYieldTrackerWbnb")
  const gmtUsdxFarmDistributorWbnb = await deployContract("TimeDistributor", [], "gmtUsdxFarmDistributorWbnb")

  await sendTxn(gmtUsdxFarmYieldTrackerWbnb.setDistributor(gmtUsdxFarmDistributorWbnb.address), "gmtUsdxFarmYieldTrackerWbnb.setDistributor")
  await sendTxn(gmtUsdxFarmDistributorWbnb.setDistribution([gmtUsdxFarmYieldTrackerWbnb.address], ["0"], [wbnb.address]), "gmtUsdxFarmDistributorWbnb.setDistribution")

  await sendTxn(gmtUsdxFarm.setYieldTrackers([gmtUsdxFarmYieldTrackerXgmt.address, gmtUsdxFarmYieldTrackerWbnb.address]), "gmtUsdxFarm.setYieldTrackers")

  const xgmtUsdxFarmYieldTrackerXgmt = await deployContract("YieldTracker", [xgmtUsdxFarm.address], "xgmtUsdxFarmYieldTrackerXgmt")
  const xgmtUsdxFarmDistributorXgmt = await deployContract("TimeDistributor", [], "xgmtUsdxFarmDistributorXgmt")

  await sendTxn(xgmtUsdxFarmYieldTrackerXgmt.setDistributor(xgmtUsdxFarmDistributorXgmt.address), "xgmtUsdxFarmYieldTrackerXgmt.setDistributor")
  await sendTxn(xgmtUsdxFarmDistributorXgmt.setDistribution([xgmtUsdxFarmYieldTrackerXgmt.address], ["0"], [xgmt.address]), "xgmtUsdxFarmDistributorXgmt.setDistribution")

  const xgmtUsdxFarmYieldTrackerWbnb = await deployContract("YieldTracker", [xgmtUsdxFarm.address], "xgmtUsdxFarmYieldTrackerWbnb")
  const xgmtUsdxFarmDistributorWbnb = await deployContract("TimeDistributor", [], "xgmtUsdxFarmDistributorWbnb")

  await sendTxn(xgmtUsdxFarmYieldTrackerWbnb.setDistributor(xgmtUsdxFarmDistributorWbnb.address), "xgmtUsdxFarmYieldTrackerWbnb.setDistributor")
  await sendTxn(xgmtUsdxFarmDistributorWbnb.setDistribution([xgmtUsdxFarmYieldTrackerWbnb.address], ["0"], [wbnb.address]), "gmtUsdxFarmDistributorWbnb.setDistribution")

  await sendTxn(xgmtUsdxFarm.setYieldTrackers([xgmtUsdxFarmYieldTrackerXgmt.address, xgmtUsdxFarmYieldTrackerWbnb.address]), "xgmtUsdxFarm.setYieldTrackers")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
