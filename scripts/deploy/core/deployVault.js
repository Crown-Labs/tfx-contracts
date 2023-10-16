const { deployContract, contractAt , sendTxn, getFrameSigner, expandDecimals, toUsd } = require("../../shared/helpers")
const { errors } = require("../../shared/errorCodes")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../../shared/tokens')[network];

async function main() {
  const { nativeToken } = tokens
  const signer = await getFrameSigner()

  const vault = await deployContract("Vault", [], "", signer)

  const vaultPositionController = await deployContract("VaultPositionController", [], "", signer)
  await vaultPositionController.initialize(vault.address)

  const usdx = await deployContract("USDX", [vault.address], "", signer)
  const router = await deployContract("Router", [vault.address, vaultPositionController.address, usdx.address, nativeToken.address], "", signer)

  const vaultPriceFeed = await deployContract("VaultPriceFeed", [], "", signer)

  await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(5, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  await sendTxn(vaultPriceFeed.setPriceSampleSpaceTime(10*3), "vaultPriceFeed.setPriceSampleSpace")

  const xlp = await deployContract("XLP", [], "", signer)
  await sendTxn(xlp.setInPrivateTransferMode(true), "xlp.setInPrivateTransferMode")
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
  await sendTxn(vault.setMaxLeverage(50.1 * 10000), "vault.setMaxLeverage")

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
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
