const { expandDecimals } = require("../../shared/utilities")
const { toUsd } = require("../../shared/units")
const { deployContract } = require("../../shared/fixtures")
const { errors } = require("../../../scripts/shared/errorCodes")

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
