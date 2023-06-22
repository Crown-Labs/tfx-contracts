const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses, getContractAddress } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const signer = await getFrameSigner()

  const vault = await contractAt("Vault", getContractAddress("vault"), signer)
  const vaultPositionController = await contractAt("VaultPositionController", getContractAddress("vaultPositionController"), signer)
  // const timelock = await contractAt("Timelock", await vault.gov(), signer) 
  const router = await contractAt("Router", getContractAddress("router"), signer)
  const weth = await contractAt("WETH", tokens.nativeToken.address) // WBNB
  const referralStorage = await contractAt("ReferralStorage", getContractAddress("referralStorage"), signer)
  const depositFee = "30" // 0.3%
  const minExecutionFee = "300000000000000" // 0.0003 ETH

  const positionRouter = await deployContract("PositionRouter", [vault.address, vaultPositionController.address, router.address, weth.address, depositFee, minExecutionFee], "PositionRouter", signer /*, { gasLimit: 125000000 }*/)
  // const positionRouter = await contractAt("PositionRouter", "0x338fF5b9d64484c8890704a76FE7166Ed7d3AEAd")

  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")

  await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")

  await sendTxn(positionRouter.setDelayValues(1, 180, 30 * 60), "positionRouter.setDelayValues")
  //await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")

  const keeper = { address: getContractAddress("keeper") };
  await sendTxn(positionRouter.setPositionKeeper(keeper.address, true), "positionRouter.setPositionKeeper")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
