const { deployContract, getFrameSigner, expandDecimals } = require("../shared/helpers")

async function main() {
  const signer = await getFrameSigner()

  const btc = await deployContract("FaucetToken", ["Bitcoin", "BTC", 18, expandDecimals(1000, 18)], "BTC", signer)
  // const eth = await deployContract("FaucetToken", ["Ethereum", "ETH", 18, expandDecimals(1000, 18)], "ETH", signer)
  const bnb = await deployContract("FaucetToken", ["Binance Coin", "BNB", 18, expandDecimals(1000, 18)], "BNB", signer)
  const usdt = await deployContract("FaucetToken", ["Tether Coin", "USDT", 18, expandDecimals(1000, 18)], "USDT", signer)
  const usdc = await deployContract("FaucetToken", ["USDC Coin", "USDC", 18, expandDecimals(1000, 18)], "USDC", signer)
  const matic = await deployContract("FaucetToken", ["Matic", "MATIC", 18, expandDecimals(1000, 18)], "MATIC", signer)
  const op = await deployContract("FaucetToken", ["OP", "OP", 18, expandDecimals(1000, 18)], "OP", signer)
  const arb = await deployContract("FaucetToken", ["Arbitrum", "ARB", 18, expandDecimals(1000, 18)], "ARB", signer)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
