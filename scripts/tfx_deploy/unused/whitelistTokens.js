const { deployContract, contractAt, sendTxn, callWithRetries, getFrameSigner, getContractAddress } = require("../shared/helpers")
const { expandDecimals } = require("../../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const signer = await getFrameSigner()

  const vault = await contractAt("Vault", getContractAddress("vault"), signer)
  const vaultPriceFeed = await contractAt("VaultPriceFeed", getContractAddress("vaultPriceFeed"), signer)
  // console.log("vault", vault.address)
  // console.log("vaultPriceFeed", vaultPriceFeed.address)

  const { btc, eth, bnb, busd, usdc, usdt } = tokens
  const tokenArr = [btc, eth, bnb, busd, /*usdc, usdt*/]

  for (const token of tokenArr) {

    console.log("setTokenConfig:", token.name);

    await sendTxn(vaultPriceFeed.setTokenConfig(
      token.address, // _token
      token.priceFeed, // _priceFeed
      token.priceDecimals, // _priceDecimals
      token.isStrictStable // _isStrictStable
    ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)

    await sendTxn(vault.setTokenConfig(
      token.address, // _token
      token.decimals, // _tokenDecimals
      token.tokenWeight, // _tokenWeight
      token.minProfitBps, // _minProfitBps
      expandDecimals(token.maxUsdxAmount, 18), // _maxUsdxAmount
      token.isStable, // _isStable
      token.isShortable // _isShortable
    ), `vault.setTokenConfig(${token.name}) ${token.address}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
