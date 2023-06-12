const { deployContract, contractAt, writeTmpAddresses, getFrameSigner } = require("../shared/helpers")

async function main() {
  const signer = await getFrameSigner()
  const contract = await deployContract("VaultReader", [], "VaultReader", signer)

  // writeTmpAddresses({
  //   reader: contract.address
  // })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
