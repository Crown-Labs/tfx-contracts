const networkId = {
  arbTestnet: 421614,
}

const tokenIndexs = {
  BTC: 0,
  ETH: 1,
  USDT: 3,
  USDC: 5,
  SOL: 22,
  OP: 28,
  ARB: 29,
}

const config = {
  421614: { // Arbitrum Testnet
    // address signer
    deployer: '0x11114D88d288c48Ea5dEC180bA5DCC2D137398dF', // signer1
    signer2: '0x666634e72c4948c7CB3F7206D2f731A34e076469',
    signer3: '0x9103c4B112ec249a34aB7AdD9D5589Ca4DF36Aaa',
    keeper: '0x6C56eddb37a8d38f1bDeB33360A7f875eAB75c20',
    liquidator: '0x6C56eddb37a8d38f1bDeB33360A7f875eAB75c20',

    // fees
    feeReceiver: '0x9103c4B112ec249a34aB7AdD9D5589Ca4DF36Aaa', // execute fee
    mintReceiver: '0x9103c4B112ec249a34aB7AdD9D5589Ca4DF36Aaa',

    // weth
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',

    // xOracle price feed
    xOracle: '0xa3B16ad55513d91c8650Ef7D218A5299d59265d7', // update 2024-06-12
    btcPriceFeed: '0x1296d3a1DE3f7BE8cB1F76C888e51c47915d8001',
    ethPriceFeed: '0x4c685b51bc534508a3AfBf0d8F4c0Ec73E5d3c5A',
    usdtPriceFeed: '0xC7cCDbD2cC787065A5b634A1E532430411A5849a',
    usdcPriceFeed: '0xEd9DB6294C83670366970D75d30FF3cB3717ddA6',
    solPriceFeed: '0xB2F5659Ee1868D014E38dB33ddB1143Be62B23Dd',
    opPriceFeed: '0x0f73CD73993E224358b8cB412A5331bfdf3422Cc',
    arbPriceFeed: '0x002422A5d2206a5b14c522Fa50bf0Ad37Ccf8bDC',
  },
}

module.exports = { networkId, tokenIndexs, config }
