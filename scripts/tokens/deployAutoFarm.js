const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const usdx = await contractAt("USDX", "0x85E76cbf4893c1fbcB34dCF1239A91CE2A4CF5a7")
  const wbnb = await contractAt("WETH", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c")
  const xgmt = await contractAt("YieldToken", "0xe304ff0983922787Fd84BC9170CD21bF78B16B10")

  const autoUsdxPair = { address: "0x0523FD5C53ea5419B4DAF656BC1b157dDFE3ce50" }
  const autoUsdxFarm = await deployContract("YieldFarm", ["AUTO-USDX Farm", "AUTO-USDX:FARM", autoUsdxPair.address], "autoUsdxFarm")

  const autoUsdxFarmYieldTrackerXgmt = await deployContract("YieldTracker", [autoUsdxFarm.address], "autoUsdxFarmYieldTrackerXgmt")
  const autoUsdxFarmDistributorXgmt = await deployContract("TimeDistributor", [], "autoUsdxFarmDistributorXgmt")

  await sendTxn(autoUsdxFarmYieldTrackerXgmt.setDistributor(autoUsdxFarmDistributorXgmt.address), "autoUsdxFarmYieldTrackerXgmt.setDistributor")
  await sendTxn(autoUsdxFarmDistributorXgmt.setDistribution([autoUsdxFarmYieldTrackerXgmt.address], ["0"], [xgmt.address]), "autoUsdxFarmDistributorXgmt.setDistribution")

  const autoUsdxFarmYieldTrackerWbnb = await deployContract("YieldTracker", [autoUsdxFarm.address], "autoUsdxFarmYieldTrackerWbnb")
  const autoUsdxFarmDistributorWbnb = await deployContract("TimeDistributor", [], "autoUsdxFarmDistributorWbnb")

  await sendTxn(autoUsdxFarmYieldTrackerWbnb.setDistributor(autoUsdxFarmDistributorWbnb.address), "autoUsdxFarmYieldTrackerWbnb.setDistributor")
  await sendTxn(autoUsdxFarmDistributorWbnb.setDistribution([autoUsdxFarmYieldTrackerWbnb.address], ["0"], [wbnb.address]), "autoUsdxFarmDistributorWbnb.setDistribution")

  await sendTxn(autoUsdxFarm.setYieldTrackers([autoUsdxFarmYieldTrackerXgmt.address, autoUsdxFarmYieldTrackerWbnb.address]), "autoUsdxFarm.setYieldTrackers")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
