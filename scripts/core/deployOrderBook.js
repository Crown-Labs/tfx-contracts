const { deployContract, contractAt , sendTxn, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const { nativeToken } = tokens

  const orderBook = await deployContract("OrderBook", []);

  // testnet
  await sendTxn(orderBook.initialize(
    "0x4849793282A5A0dD594b39a7516a2955904433a6", // router
    "0x340A223CbFD6EcB08Ae6376829A8027aBf4deA02", // vault
    nativeToken.address, // weth
    "0x829fA678870e27177De076684a00c2aBA297AC12", // usdg
    "10000000000000000", // 0.01 AVAX
    expandDecimals(10, 30) // min purchase token amount usd
  ), "orderBook.initialize");

  // Arbitrum mainnet addresses
  /*await sendTxn(orderBook.initialize(
    "0x5F719c2F1095F7B9fc68a68e35B51194f4b6abe8", // router
    "0x9ab2De34A33fB459b538c43f251eB825645e8595", // vault
    nativeToken.address, // weth
    "0xc0253c3cC6aa5Ab407b5795a04c28fB063273894", // usdg
    "10000000000000000", // 0.01 AVAX
    expandDecimals(10, 30) // min purchase token amount usd
  ), "orderBook.initialize");*/

  writeTmpAddresses({
    orderBook: orderBook.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
