const { deployContract, contractAt, writeTmpAddresses, sendTxn, getFrameSigner } = require("../shared/helpers")

async function main() {
  const signer = await getFrameSigner()
  const xlpManagerReader = await deployContract("XLPManagerReader", [], "XLPManagerReader", signer)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
