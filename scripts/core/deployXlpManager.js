const { deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const {
    nativeToken
  } = tokens

  /*const vault = await contractAt("Vault", "")
  const usdx = await contractAt("USDX", "")
  const xlp = await contractAt("XLP", "0x53760CF4B97B63e3fC931113916EDB17c62A70AD")

  const xlpManager = await deployContract("XlpManager", [vault.address, usdx.address, xlp.address, 15 * 60])

  await sendTxn(xlpManager.setInPrivateMode(true), "xlpManager.setInPrivateMode")

  await sendTxn(xlp.setMinter(xlpManager.address, true), "xlp.setMinter")
  await sendTxn(usdx.addVault(xlpManager.address), "usdx.addVault")
  await sendTxn(vault.setManager(xlpManager.address, true), "vault.setManager")

  writeTmpAddresses({
    xlpManager: xlpManager.address
  })*/
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
