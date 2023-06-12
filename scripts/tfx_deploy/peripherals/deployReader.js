const { deployContract, contractAt, writeTmpAddresses, sendTxn, getFrameSigner } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function main() {
  const signer = await getFrameSigner()
  const reader = await deployContract("Reader", [], "Reader", signer)

  if (network === "xorTestnet") {
    await sendTxn(reader.setConfig(true), "Reader.setConfig")
  }
  if (network === "bscTestnet") {
    await sendTxn(reader.setConfig(true), "Reader.setConfig")
  }

  // if (network === "avax") {
  //   await sendTxn(reader.setConfig(true), "Reader.setConfig")
  // }

  // writeTmpAddresses({
  //   reader: reader.address
  // })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
