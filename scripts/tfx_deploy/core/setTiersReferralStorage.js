const { contractAt, sendTxn, getFrameSigner, getContractAddress } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getValues() {
  const signer = await getFrameSigner()
  const referralStorage = await contractAt("ReferralStorage", getContractAddress("referralStorage"), signer)
  const timelock = { address: getContractAddress("timelock") }

  return { referralStorage, timelock }
}

async function main() {
  const { referralStorage, timelock } = await getValues()

  await sendTxn(referralStorage.setTier(0, 1000, 5000), "referralStorage.setTier 0")
  await sendTxn(referralStorage.setTier(1, 2000, 5000), "referralStorage.setTier 1")
  await sendTxn(referralStorage.setTier(2, 2500, 4000), "referralStorage.setTier 2")

  // set gov
  await sendTxn(referralStorage.setGov(timelock.address), "referralStorage.setGov")

  //await sendTxn(referralStorage.setReferrerTier("0xbb00f2E53888E60974110d68F1060e5eAAB34790", 1), "referralStorage.setReferrerTier 1")
  //await sendTxn(referralStorage.setReferrerTier("0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8", 2), "referralStorage.setReferrerTier 2")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
