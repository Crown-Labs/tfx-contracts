const { deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const {
    nativeToken
  } = tokens

  const vault = await contractAt("Vault", "0xDE3590067c811b6F023b557ed45E4f1067859663")
  const usdx = await contractAt("USDX", "0x45096e7aA921f27590f8F19e457794EB09678141")
  const xlp = await contractAt("XLP", "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258")

  const xlpManager = await contractAt("XlpManager", "0x91425Ac4431d068980d497924DD540Ae274f3270")

  await sendTxn(xlp.setMinter(xlpManager.address, false), "xlp.setMinter")
  await sendTxn(usdx.removeVault(xlpManager.address), "usdx.removeVault")
  await sendTxn(vault.setManager(xlpManager.address, false), "vault.setManager")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
