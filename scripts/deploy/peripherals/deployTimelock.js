const { deployContract, contractAt, sendTxn, getFrameSigner, getContractAddress, expandDecimals } = require("../../shared/helpers")

async function main() {
  const signer = await getFrameSigner()

  const admin = getContractAddress("deployer")
  const buffer = 5 * 60; // 24 * 60 * 60
  const rewardManager = { address: ethers.constants.AddressZero }
  const maxTokenSupply = expandDecimals("1000000", 18)

  const vault = await contractAt("Vault", getContractAddress("vault"), signer)
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed(), signer)
  const router = await contractAt("Router", getContractAddress("router"), signer)
  const tokenManager = { address: getContractAddress("tokenManager") }
  const mintReceiver = { address: getContractAddress("mintReceiver") }
  const positionRouter = await contractAt("PositionRouter", await getContractAddress("positionRouter"), signer)
  const positionManager = await contractAt("PositionManager", await getContractAddress("positionManager"), signer)

  const timelock = await deployContract("Timelock", [
    admin,
    buffer,
    rewardManager.address,
    tokenManager.address,
    mintReceiver.address,
    maxTokenSupply,
    10, // marginFeeBasisPoints 0.1%
    100 // maxMarginFeeBasisPoints 1%
  ], "Timelock", signer) 

  // set Gov
  await sendTxn(vault.setGov(timelock.address), "vault.setGov")
  await sendTxn(vaultPriceFeed.setGov(timelock.address), "vaultPriceFeed.setGov")
  await sendTxn(router.setGov(timelock.address), "router.setGov")

  // set timelock
  await sendTxn(timelock.setShouldToggleIsLeverageEnabled(true), "timelock.setShouldToggleIsLeverageEnabled(true)")
  await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")
  await sendTxn(timelock.setContractHandler(positionManager.address, true), "timelock.setContractHandler(positionManager)")
  await sendTxn(timelock.setLiquidator(vault.address, positionManager.address, true), "timelock.setLiquidator(vault, positionManager, true)")

  const signers = [
    getContractAddress("deployer"),
    getContractAddress("signer2"),
    getContractAddress("signer3")
  ]

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i]
    await sendTxn(timelock.setContractHandler(signer, true), `timelock.setContractHandler(${signer})`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
