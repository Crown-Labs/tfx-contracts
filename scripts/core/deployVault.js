const { deployContract, contractAt , sendTxn, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")
const { errors } = require("./errorCode")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const { nativeToken } = tokens
  const signer = await getFrameSigner()

  const vault = await deployContract("Vault", [], "", signer)
  // const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")

  const vaultPositionController = await deployContract("VaultPositionController", [], "", signer)
  await vaultPositionController.initialize(vault.address)

  const usdx = await deployContract("USDX", [vault.address], "", signer)
  // const usdx = await contractAt("USDX", "0x45096e7aA921f27590f8F19e457794EB09678141")
  const router = await deployContract("Router", [vault.address, vaultPositionController.address, usdx.address, nativeToken.address], "", signer)
  // const router = await contractAt("Router", "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064")
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x30333ce00ac3025276927672aaefd80f22e89e54")
  // const secondaryPriceFeed = await deployContract("FastPriceFeed", [5 * 60])

  const vaultPriceFeed = await deployContract("VaultPriceFeed", [], "", signer)

  await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(5, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")

  const xlp = await deployContract("XLP", [], "", signer)
  await sendTxn(xlp.setInPrivateTransferMode(true), "xlp.setInPrivateTransferMode")
  // const xlp = await contractAt("XLP", "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258")
  const xlpManager = await deployContract("XlpManager", [vault.address, usdx.address, xlp.address, 15 * 60], "", signer)
  await sendTxn(xlpManager.setInPrivateMode(true), "xlpManager.setInPrivateMode")

  await sendTxn(xlp.setMinter(xlpManager.address, true), "xlp.setMinter")
  await sendTxn(usdx.addVault(xlpManager.address), "usdx.addVault(xlpManager)")

  await sendTxn(vault.initialize(
    vaultPositionController.address, // vaultPositionController
    router.address, // router
    usdx.address, // usdx
    vaultPriceFeed.address, // priceFeed
    toUsd(2), // liquidationFeeUsd
    100, // fundingRateFactor
    100 // stableFundingRateFactor
  ), "vault.initialize")

  await sendTxn(vault.setFundingRate(60 * 60, 100, 100), "vault.setFundingRate")

  await sendTxn(vault.setInManagerMode(true), "vault.setInManagerMode")
  await sendTxn(vault.setManager(xlpManager.address, true), "vault.setManager")

  await sendTxn(vault.setFees(
    10, // _taxBasisPoints
    5, // _stableTaxBasisPoints
    20, // _mintBurnFeeBasisPoints
    20, // _swapFeeBasisPoints
    1, // _stableSwapFeeBasisPoints
    10, // _marginFeeBasisPoints
    toUsd(2), // _liquidationFeeUsd
    24 * 60 * 60, // _minProfitTime
    true // _hasDynamicFees
  ), "vault.setFees")

  const vaultErrorController = await deployContract("VaultErrorController", [], "", signer)
  await sendTxn(vault.setErrorController(vaultErrorController.address), "vault.setErrorController")
  await sendTxn(vaultErrorController.setErrors(vault.address, errors), "vaultErrorController.setErrors")

  // const vaultUtils = await deployContract("VaultUtils", [vault.address])
  // await sendTxn(vault.setVaultUtils(vaultUtils.address), "vault.setVaultUtils")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
