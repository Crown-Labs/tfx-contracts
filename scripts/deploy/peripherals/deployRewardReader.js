const { deployContract, contractAt, writeTmpAddresses, getFrameSigner } = require("../../shared/helpers")

async function main() {
  const signer = await getFrameSigner()
  await deployContract("RewardReader", [], "RewardReader", signer)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
