const { deployContract, getFrameSigner } = require("../../shared/helpers")

async function main() {
  const signer = await getFrameSigner()
  const batchSender = await deployContract("BatchSender", [], "", signer)
  return { batchSender }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
