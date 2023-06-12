const { deployContract, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../../test/shared/utilities")

async function main() {
  const signer = await getFrameSigner()

  const btc = await deployContract("FaucetToken", ["Bitcoin", "BTC", 18, expandDecimals(1000, 18)], "BTC", signer)
  const eth = await deployContract("FaucetToken", ["Ethereum", "ETH", 18, expandDecimals(1000, 18)], "ETH", signer)
  const usdc = await deployContract("FaucetToken", ["USDC Coin", "USDC", 18, expandDecimals(1000, 18)], "USDC", signer)
  const usdt = await deployContract("FaucetToken", ["Tether", "USDT", 18, expandDecimals(1000, 18)], "USDT", signer)
  const busd = await deployContract("FaucetToken", ["Binance USD", "BUSD", 18, expandDecimals(1000, 18)], "BUSD", signer)
  const doge = await deployContract("FaucetToken", ["DOGE Coin", "DOGE", 18, expandDecimals(1000, 18)], "DOGE", signer)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
