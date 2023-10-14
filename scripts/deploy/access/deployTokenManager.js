const { deployContract, contractAt, writeTmpAddresses, sendTxn, getFrameSigner, getContractAddress } = require("../../shared/helpers")

async function main() {
  const signer = await getFrameSigner()
  const tokenManager = await deployContract("TokenManager", [2], "TokenManager", signer)

  const signers = [
    getContractAddress("deployer"), // admin
    getContractAddress("signer2"), // account2
    getContractAddress("signer3") // account3
  ]

  await sendTxn(tokenManager.initialize(signers), "tokenManager.initialize")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
