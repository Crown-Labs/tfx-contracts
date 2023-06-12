const { getFrameSigner, deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const signer = await getFrameSigner()
  //const [wallet, user0, user1, user2, user3] = provider.getWallets()
  const { btc, eth, bnb, busd, usdc, usdt } = tokens

  //console.log([wallet, user0, user1, user2, user3])
//   console.log(signer)
//   return;

  const vaultPositionController = await contractAt("VaultPositionController", "0x14f93e3a35F3e91bA5DEc238D0bE8CD2F1b3e866", signer)

  //console.log(await vaultPositionController.gov())
  //await vaultPositionController.increasePosition("0x083B4acb59B0D102740cDA8de8f31cB603091043", btc.address, btc.address, toUsd(47), true)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
