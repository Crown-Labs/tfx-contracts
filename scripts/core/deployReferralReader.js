const { deployContract, contractAt, writeTmpAddresses, sendTxn, getFrameSigner } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function main() {
  const signer = await getFrameSigner()
  await deployContract("ReferralReader", [], "ReferralReader", signer)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
