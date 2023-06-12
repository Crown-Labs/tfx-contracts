const { deployContract, getFrameSigner } = require("../shared/helpers")

async function main() {
  const signer = await getFrameSigner()
  await deployContract("StakeManager", [], "", signer)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
