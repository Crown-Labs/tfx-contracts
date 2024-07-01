const { deployContract, contractAt, sendTxn, getFrameSigner, expandDecimals, toUsd, getContractAddress } = require("../shared/helpers")
const { errors } = require("../shared/errorCodes")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../shared/tokens')[network];

async function main() {

    const signer = await getFrameSigner()

    const vault = await contractAt("Vault", getContractAddress("vault"), signer)
    const timelock = await contractAt("Timelock", getContractAddress("timelock"), signer)

    await sendTxn(timelock.setFees(
        vault.address,
        10, // _taxBasisPoints
        5, // _stableTaxBasisPoints
        20, // _mintBurnFeeBasisPoints
        20, // _swapFeeBasisPoints
        1, // _stableSwapFeeBasisPoints
        10, // _marginFeeBasisPoints
        toUsd(2), // _liquidationFeeUsd
        3 * 60 * 60, // _minProfitTime
        true // _hasDynamicFees
    ), "timelock.setFees")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })