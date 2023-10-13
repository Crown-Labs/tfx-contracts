const { deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const usdx = await contractAt("USDX", "0x45096e7aA921f27590f8F19e457794EB09678141")
  const vault = await contractAt("Vault", "0xDE3590067c811b6F023b557ed45E4f1067859663")

  await sendTxn(usdx.removeVault(vault.address), "usdx.removeVault")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
