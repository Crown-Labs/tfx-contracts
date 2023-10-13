const { expandDecimals } = require("../../shared/utilities")
const { toUsd } = require("../../shared/units")
const { deployContract } = require("../../shared/fixtures")

const errors = [
  "Vault: zero error",
  "Vault: already initialized",
  "Vault: invalid _maxLeverage",
  "Vault: invalid _taxBasisPoints",
  "Vault: invalid _stableTaxBasisPoints",
  "Vault: invalid _mintBurnFeeBasisPoints",
  "Vault: invalid _swapFeeBasisPoints",
  "Vault: invalid _stableSwapFeeBasisPoints",
  "Vault: invalid _marginFeeBasisPoints",
  "Vault: invalid _liquidationFeeUsd",
  "Vault: invalid _fundingInterval",
  "Vault: invalid _fundingRateFactor",
  "Vault: invalid _stableFundingRateFactor",
  "Vault: token not whitelisted",
  "Vault: _token not whitelisted",
  "Vault: invalid tokenAmount",
  "Vault: _token not whitelisted",
  "Vault: invalid tokenAmount",
  "Vault: invalid usdxAmount",
  "Vault: _token not whitelisted",
  "Vault: invalid usdxAmount",
  "Vault: invalid redemptionAmount",
  "Vault: invalid amountOut",
  "Vault: swaps not enabled",
  "Vault: _tokenIn not whitelisted",
  "Vault: _tokenOut not whitelisted",
  "Vault: invalid tokens",
  "Vault: invalid amountIn",
  "Vault: leverage not enabled",
  "Vault: insufficient collateral for fees",
  "Vault: invalid position.size",
  "Vault: empty position",
  "Vault: position size exceeded",
  "Vault: position collateral exceeded",
  "Vault: invalid liquidator",
  "Vault: empty position",
  "Vault: position cannot be liquidated",
  "Vault: invalid position",
  "Vault: invalid _averagePrice",
  "Vault: collateral should be withdrawn",
  "Vault: _size must be more than _collateral",
  "Vault: invalid msg.sender",
  "Vault: mismatched tokens",
  "Vault: _collateralToken not whitelisted",
  "Vault: _collateralToken must not be a stableToken",
  "Vault: _collateralToken not whitelisted",
  "Vault: _collateralToken must be a stableToken",
  "Vault: _indexToken must not be a stableToken",
  "Vault: _indexToken not shortable",
  "Vault: invalid increase",
  "Vault: reserve exceeds pool",
  "Vault: max USDX exceeded",
  "Vault: reserve exceeds pool",
  "Vault: forbidden",
  "Vault: forbidden",
  "Vault: maxGasPrice exceeded"
]

const tokenIndexs = {
  BTC: 0,
  ETH: 1,
  BNB: 2,
  USDT: 3,
  BUSD: 4,
  USDC: 5,
  DOGE: 6,
};

async function initVaultErrors(vault) {
  const vaultErrorController = await deployContract("VaultErrorController", [])
  await vault.setErrorController(vaultErrorController.address)
  await vaultErrorController.setErrors(vault.address, errors);
  return vaultErrorController
}

async function initVault(vault, vaultPositionController, router, usdx, priceFeed) {
  await vault.initialize(
    vaultPositionController.address, // vaultPositionController
    router.address, // router
    usdx.address, // usdx
    priceFeed.address, // priceFeed
    toUsd(5), // liquidationFeeUsd
    600, // fundingRateFactor
    600 // stableFundingRateFactor
  )
  
  await vaultPositionController.initialize(vault.address)

  const vaultErrorController = await initVaultErrors(vault)

  return { vault, vaultErrorController }
}

async function validateVaultBalance(expect, vault, token, offset) {
  if (!offset) { offset = 0 }
  const poolAmount = await vault.poolAmounts(token.address)
  const feeReserve = await vault.feeReserves(token.address)
  const balance = await token.balanceOf(vault.address)
  let amount = poolAmount.add(feeReserve)
  expect(balance).gt(0)
  expect(poolAmount.add(feeReserve).add(offset)).eq(balance)
}

function getBnbConfig(bnb) {
  return [
    bnb.address, // _token
    18, // _tokenDecimals
    10000, // _tokenWeight
    75, // _minProfitBps,
    0, // _maxUsdxAmount
    false, // _isStable
    true // _isShortable
  ]
}

function getEthConfig(eth) {
  return [
    eth.address, // _token
    18, // _tokenDecimals
    10000, // _tokenWeight
    75, // _minProfitBps
    0, // _maxUsdxAmount
    false, // _isStable
    true // _isShortable
  ]
}

function getBtcConfig(btc) {
  return [
    btc.address, // _token
    8, // _tokenDecimals
    10000, // _tokenWeight
    75, // _minProfitBps
    0, // _maxUsdxAmount
    false, // _isStable
    true // _isShortable
  ]
}

function getDaiConfig(dai) {
  return [
    dai.address, // _token
    18, // _tokenDecimals
    10000, // _tokenWeight
    75, // _minProfitBps
    0, // _maxUsdxAmount
    true, // _isStable
    false // _isShortable
  ]
}

module.exports = {
  errors,
  tokenIndexs,
  initVault,
  validateVaultBalance,
  getBnbConfig,
  getBtcConfig,
  getEthConfig,
  getDaiConfig,
}
