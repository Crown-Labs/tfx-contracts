const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const shouldSendTxn = true

async function getTestnetValues(signer) {
  const gmxRewardTracker = await contractAt("RewardTracker", "0xd693733c1b1b774c52D884D2091477ec8dE2E291")
  const xlpRewardTracker = await contractAt("RewardTracker", "0xAeDe8694099944b4c99bb721AD8C07ac3BAd32f9")
  const tokenDecimals = 18
  const monthlyEsGmxForXlp = expandDecimals(50 * 1000, 18)

  return { tokenDecimals, gmxRewardTracker, xlpRewardTracker, monthlyEsGmxForXlp }
}

async function getArbValues(signer) {
  const gmxRewardTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const xlpRewardTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")
  const tokenDecimals = 18
  const monthlyEsGmxForXlp = expandDecimals(50 * 1000, 18)

  return { tokenDecimals, gmxRewardTracker, xlpRewardTracker, monthlyEsGmxForXlp }
}

async function getAvaxValues(signer) {
  const gmxRewardTracker = await contractAt("RewardTracker", "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342")
  const xlpRewardTracker = await contractAt("RewardTracker", "0x9e295B5B976a184B14aD8cd72413aD846C299660")
  const tokenDecimals = 18
  const monthlyEsGmxForXlp = expandDecimals(0, 18)

  return { tokenDecimals, gmxRewardTracker, xlpRewardTracker, monthlyEsGmxForXlp }
}

function getValues() {
  if (network === "testnet") {
    return getTestnetValues()
  }

  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

function toInt(value) {
  return parseInt(value.replaceAll(",", ""))
}

async function main() {
  const { tokenDecimals, gmxRewardTracker, xlpRewardTracker, monthlyEsGmxForXlp } = await getValues()

  const stakedAmounts = {
    testnet: {
      gmx: toInt("1,050"),
      esGmx: toInt("0")
    },
    arbitrum: {
      gmx: toInt("6,147,470"),
      esGmx: toInt("1,277,087")
    },
    avax: {
      gmx: toInt("417,802"),
      esGmx: toInt("195,478")
    }
  }

  let totalStaked = 0
  for (const net in stakedAmounts) {
    stakedAmounts[net].total = stakedAmounts[net].gmx + stakedAmounts[net].esGmx
    totalStaked += stakedAmounts[net].total
  }

  const totalEsGmxRewards = expandDecimals(100000, tokenDecimals)
  const secondsPerMonth = 28 * 24 * 60 * 60

  const gmxRewardDistributor = await contractAt("RewardDistributor", await gmxRewardTracker.distributor())

  const gmxCurrentTokensPerInterval = await gmxRewardDistributor.tokensPerInterval()
  const gmxNextTokensPerInterval = totalEsGmxRewards.mul(stakedAmounts[network].total).div(totalStaked).div(secondsPerMonth)
  const gmxDelta = gmxNextTokensPerInterval.sub(gmxCurrentTokensPerInterval).mul(10000).div(gmxCurrentTokensPerInterval)

  console.log("gmxCurrentTokensPerInterval", gmxCurrentTokensPerInterval.toString())
  console.log("gmxNextTokensPerInterval", gmxNextTokensPerInterval.toString(), `${gmxDelta.toNumber() / 100.00}%`)

  const xlpRewardDistributor = await contractAt("RewardDistributor", await xlpRewardTracker.distributor())

  const xlpCurrentTokensPerInterval = await xlpRewardDistributor.tokensPerInterval()
  const xlpNextTokensPerInterval = monthlyEsGmxForXlp.div(secondsPerMonth)

  console.log("xlpCurrentTokensPerInterval", xlpCurrentTokensPerInterval.toString())
  console.log("xlpNextTokensPerInterval", xlpNextTokensPerInterval.toString())

  if (shouldSendTxn) {
    await sendTxn(gmxRewardDistributor.setTokensPerInterval(gmxNextTokensPerInterval), "gmxRewardDistributor.setTokensPerInterval")
    await sendTxn(xlpRewardDistributor.setTokensPerInterval(xlpNextTokensPerInterval), "xlpRewardDistributor.setTokensPerInterval")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
