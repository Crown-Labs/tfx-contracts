const { deployContract, contractAt, sendTxn, getFrameSigner, getContractAddress } = require("../shared/helpers")
const { expandDecimals } = require("../../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
let signer; 

async function getTestnetValues() {
  const vault = await contractAt("Vault", getContractAddress("vault"), signer)
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed(), signer)
  // const fastPriceFeed = await contractAt("FastPriceFeed", await vaultPriceFeed.secondaryPriceFeed(), signer)
  const router = await contractAt("Router", getContractAddress("router"), signer)

  const tokenManager = { address: getContractAddress("tokenManager") }
  const mintReceiver = { address: getContractAddress("mintReceiver") }

  const positionRouter = await contractAt("PositionRouter", await getContractAddress("positionRouter"), signer)
  const positionManager = await contractAt("PositionManager", await getContractAddress("positionManager"), signer)

  return { vault, vaultPriceFeed, router, tokenManager, mintReceiver, positionRouter, positionManager }
}

/*async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const tokenManager = { address: "0x7b78CeEa0a89040873277e279C40a08dE59062f5" }
  const mintReceiver = { address: "0x50F22389C10FcC3bA9B1AB9BCDafE40448a357FB" }

  const positionRouter = { address: "0x3D6bA331e3D9702C5e8A8d254e5d8a285F223aba" }
  const positionManager = { address: "0x87a4088Bd721F83b6c2E5102e2FA47022Cb1c831" }

  return { vault, tokenManager, mintReceiver, positionRouter, positionManager }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const tokenManager = { address: "0x26137dfA81f9Ac8BACd748f6A298262f11504Da9" }
  const mintReceiver = { address: "0x7F98d265Ba2609c1534D12cF6b0976505Ad7F653" }

  const positionRouter = { address: "0x195256074192170d1530527abC9943759c7167d8" }
  const positionManager = { address: "0xF2ec2e52c3b5F8b8bd5A3f93945d05628A233216" }

  return { vault, tokenManager, mintReceiver, positionRouter, positionManager }
}*/

async function getValues() {
  if (network === "xorTestnet") {
    return getTestnetValues()
  }
  
  if (network === "bscTestnet") {
    return getTestnetValues()
  }

  // if (network === "arbitrum") {
  //   return getArbValues()
  // }

  // if (network === "avax") {
  //   return getAvaxValues()
  // }
}

async function main() {
  signer = await getFrameSigner()

  //const admin = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"
  const admin = getContractAddress("deployer")
  const buffer = 5 * 60; //24 * 60 * 60
  const rewardManager = { address: ethers.constants.AddressZero }
  //const maxTokenSupply = expandDecimals("13250000", 18)
  const maxTokenSupply = expandDecimals("1000000", 18)

  const { vault, vaultPriceFeed, router, tokenManager, mintReceiver, positionRouter, positionManager } = await getValues()

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
  //const timelock = { address: "0x3A541BC3ED9Ba303FB1928e1Ec72Bd9b1CCede22" } 

  //const deployedTimelock = await contractAt("Timelock", timelock.address, signer) 

  // set Gov
  await sendTxn(vault.setGov(timelock.address), "vault.setGov")
  await sendTxn(vaultPriceFeed.setGov(timelock.address), "vaultPriceFeed.setGov")
  // await sendTxn(fastPriceFeed.setGov(timelock.address), "fastPriceFeed.setGov")
  await sendTxn(router.setGov(timelock.address), "router.setGov")

  // set timelock
  await sendTxn(timelock.setShouldToggleIsLeverageEnabled(true), "timelock.setShouldToggleIsLeverageEnabled(true)")
  await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")
  await sendTxn(timelock.setContractHandler(positionManager.address, true), "timelock.setContractHandler(positionManager)")
  await sendTxn(timelock.setLiquidator(vault.address, positionManager.address, true), "timelock.setLiquidator(vault, positionManager, true)")
  

  // ----
  // const timelock = { address: "0x0a599134EDe4C3d4B2DfaEDf5D2CC167b9cFe5F2" }
  // const timelock = await contractAt("Timelock", timelock.address, signer) 

  // // update gov of vault, vaultPriceFeed, fastPriceFeed
  /*const vaultGov = await contractAt("Timelock", await vault.gov(), signer)
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed(), signer)
  const vaultPriceFeedGov = await contractAt("Timelock", await vaultPriceFeed.gov(), signer)
  const fastPriceFeed = await contractAt("FastPriceFeed", await vaultPriceFeed.secondaryPriceFeed(), signer)
  const fastPriceFeedGov = await contractAt("Timelock", await fastPriceFeed.gov(), signer)

  await sendTxn(vaultGov.signalSetGov(vault.address, timelock.address), "vaultGov.signalSetGov")
  await sendTxn(vaultPriceFeedGov.signalSetGov(vaultPriceFeed.address, timelock.address), "vaultPriceFeedGov.signalSetGov")
  await sendTxn(fastPriceFeedGov.signalSetGov(fastPriceFeed.address, timelock.address), "fastPriceFeedGov.signalSetGov")

  await sendTxn(timelock.signalSetGov(vault.address, vaultGov.address), "timelock.signalSetGov(vault)")
  await sendTxn(timelock.signalSetGov(vaultPriceFeed.address, vaultPriceFeedGov.address), "timelock.signalSetGov(vaultPriceFeed)")
  await sendTxn(timelock.signalSetGov(fastPriceFeed.address, fastPriceFeedGov.address), "timelock.signalSetGov(fastPriceFeed)")*/

  const signers = [
    /*"0x82429089e7c86B7047b793A9E7E7311C93d2b7a6", // coinflipcanada
    "0xD7941C4Ca57a511F21853Bbc7FBF8149d5eCb398", // G
    "0xfb481D70f8d987c1AE3ADc90B7046e39eb6Ad64B", // kr
    "0x99Aa3D1b3259039E8cB4f0B33d0Cfd736e1Bf49E", // quat
    "0x6091646D0354b03DD1e9697D33A7341d8C93a6F5", // xhiroz
    "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" // X*/
    getContractAddress("deployer"),
    getContractAddress("signer2"),
    getContractAddress("signer3")
  ]

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i]
    await sendTxn(timelock.setContractHandler(signer, true), `timelock.setContractHandler(${signer})`)
  }

  // const watchers = signers.concat([
  //   /*"0x45e48668F090a3eD1C7961421c60Df4E66f693BD", // Dovey
  //   "0x881690382102106b00a99E3dB86056D0fC71eee6", // Han Wen
  //   "0x2e5d207a4c0f7e7c52f6622dcc6eb44bc0fe1a13" // Krunal Amin*/
  //   //getContractAddress("deployer"),
  //   getContractAddress("signer2"),
  //   //getContractAddress("signer3")
  // ])

  // for (let i = 0; i < watchers.length; i++) {
  //   const watcher = watchers[i]
  //   await sendTxn(timelock.signalSetPriceFeedWatcher(fastPriceFeed.address, watcher, true), `timelock.signalSetPriceFeedWatcher(${watcher})`)
  // }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
