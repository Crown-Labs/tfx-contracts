const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses, getContractAddress } = require("../../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../../shared/tokens')[network];

async function main() {
  const signer = await getFrameSigner()

  const vault = await contractAt("Vault", getContractAddress("vault"), signer)
  const vaultPositionController = await contractAt("VaultPositionController", getContractAddress("vaultPositionController"), signer)
  const router = await contractAt("Router", getContractAddress("router"), signer)
  const weth = await contractAt("WETH", tokens.nativeToken.address) 
  const referralStorage = await contractAt("ReferralStorage", getContractAddress("referralStorage"), signer)
  const depositFee = "10" // 0.1%
  const minExecutionFee = "300000000000000" // 0.0003 ETH

  const positionRouter = await deployContract("PositionRouter", [vault.address, vaultPositionController.address, router.address, weth.address, depositFee, minExecutionFee], "PositionRouter", signer)

  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")

  await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")

  await sendTxn(positionRouter.setDelayValues(1, 180, 30 * 60), "positionRouter.setDelayValues")

  const keeper = { address: getContractAddress("keeper") };
  await sendTxn(positionRouter.setPositionKeeper(keeper.address, true), "positionRouter.setPositionKeeper")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
