const networkId = {
  lineaTestnet: 59140,
  develop: 1112,
}

const tokenIndexs = {
  BTC: 0,
  ETH: 1,
  BNB: 2,
  USDT: 3,
  USDC: 5,
  MATIC: 21,
  OP: 28,
  ARB: 29,
}

const config = {
  59140: { // lineaTestnet
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
    weth: '0x2C1b868d6596a18e32E61B901E4060C872647b6C',

    // xOracle price feed
    xOracle: '0xB1CBd1d5A394E6B4BDaA687468266Caf533D9035', // update 2023-09-13
    btcPriceFeed: '0x3432dD444774c4A88D330EdB127D837072e5cc9e',
    ethPriceFeed: '0xe767d64F9b37fe809232a7f20304d28F03EED2B1',
    bnbPriceFeed: '0x0c8b54e305E8CBb9958671a9C02467328EF4c95C',
    usdtPriceFeed: '0x4B114D9D36b09FcC71C492C29e7F8796C655A08d',
    usdcPriceFeed: '0xA23902465EC47904b4b53dCD95f2395b45F33E4F',
    maticPriceFeed: '0xE41CEc959C332968226B2a07f6252Bc57964de1d',
    opPriceFeed: '0x81E12991821d0bFdFC7D1a79D49056bcFa0Eaf75',
    arbPriceFeed: '0x9b5C82a57AcF5569e10fe1f1783ab57230B18ab9',
  },
  1112: { // develop
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
    weth: '0x078c04b8cfC949101905fdd5912D31Aad0a244Cb',

    // xOracle price feed
    xOracle: '0xCaa766A36Ea93c581299719934404D099E65478f', // update 2023-10-13
    btcPriceFeed: '0x382799dc4Fc3d8c9Eb89c236552Ca1b7bA3369C8',
    ethPriceFeed: '0xC9BbBB15657eCAbAD46a440230e761dFC9cfeE35',
    bnbPriceFeed: '0x4e9223B617C00EcF67aBA43E9a4Bd641E194056F',
    usdtPriceFeed: '0xb27915032DE3285A3e785bD49091781D2C2e4a11',
    usdcPriceFeed: '0xA3E25fa12881c78FB70Bb8bF8DAb39EA1ecE637b',
    maticPriceFeed: '0x117cb3f6Ec0C8A9e39Ee234d49D09BEd532CDf14',
    opPriceFeed: '0x99475a0A04D601FBC94D26893A150d0bA9f2f7ae',
    arbPriceFeed: '0x1F608722A909F396A2626150FbA1C151fa55d56b',
  },
}

module.exports = { networkId, tokenIndexs, config }
