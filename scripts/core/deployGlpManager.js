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
  const usdg = await contractAt("USDG", "")
  const glp = await contractAt("GLP", "0x53760CF4B97B63e3fC931113916EDB17c62A70AD")

  const glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, 15 * 60])

  await sendTxn(glpManager.setInPrivateMode(true), "glpManager.setInPrivateMode")

  await sendTxn(glp.setMinter(glpManager.address, true), "glp.setMinter")
  await sendTxn(usdg.addVault(glpManager.address), "usdg.addVault")
  await sendTxn(vault.setManager(glpManager.address, true), "vault.setManager")

  writeTmpAddresses({
    glpManager: glpManager.address
  })*/
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
