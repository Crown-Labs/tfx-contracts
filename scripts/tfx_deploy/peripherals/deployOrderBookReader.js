const { deployContract, contractAt, writeTmpAddresses, getFrameSigner } = require("../shared/helpers")

async function main() {
  const signer = await getFrameSigner()
  const orderBookReader = await deployContract("OrderBookReader", [], "", signer)

  // writeTmpAddresses({
  //   orderBookReader: orderBookReader.address
  // })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
