// price feeds https://docs.chain.link/docs/binance-smart-chain-addresses/
const { getContractAddress } = require("../shared/helpers");
const { expandDecimals } = require("../../../test/shared/utilities");

module.exports = {
  /* bsc: {
    btc: {
      name: "btc",
      address: getContractAddress("btc"),
      decimals: 18,
      priceDecimals: 8,
      isStrictStable: false,
    },
    eth: {
      name: "eth",
      address: getContractAddress("eth"),
      decimals: 18,
      priceDecimals: 8,
      isStrictStable: false,
    },
    bnb: {
      name: "bnb",
      address: getContractAddress("wbnb"),
      decimals: 18,
      priceDecimals: 8,
      isStrictStable: false,
    },
    busd: {
      name: "busd",
      address: getContractAddress("busd"),
      decimals: 18,
      priceDecimals: 8,
      isStrictStable: true,
    },
    usdc: {
      name: "usdc",
      address: getContractAddress("usdc"),
      decimals: 18,
      priceDecimals: 8,
      isStrictStable: true,
    },
    // usdt: {
    //   name: "usdt",
    //   address: getContractAddress("usdt"),
    //   decimals: 18,
    //   priceDecimals: 8,
    //   isStrictStable: true,
    // },
    nativeToken: {
      address: getContractAddress("wbnb"),
      decimals: 18,
    },
  }, */
  /* opbnbTestnet: {
    // tokenWeight = 100,000
    btc: {
      name: "btc",
      address: getContractAddress("btc"),
      priceFeed: getContractAddress("btcPriceFeed"),
      decimals: 18,
      tokenIndex: 0,
      priceDecimals: 8,
      fastPricePrecision: 1000,
      isStrictStable: false,
      tokenWeight: 15000, // 15%
      minProfitBps: 0,
      maxUsdgAmount: 150 * 1000 * 1000,
      // bufferAmount: 450,
      isStable: false,
      isShortable: true,
      maxGlobalShortSize: 30 * 1000 * 1000,
    },
    eth: {
      name: "eth",
      address: getContractAddress("eth"),
      priceFeed: getContractAddress("ethPriceFeed"),
      decimals: 18,
      tokenIndex: 1,
      priceDecimals: 8,
      fastPricePrecision: 1000,
      isStrictStable: false,
      tokenWeight: 10000, // 10%
      minProfitBps: 0,
      maxUsdgAmount: 100 * 1000 * 1000,
      // bufferAmount: 15000,
      isStable: false,
      isShortable: true,
      maxGlobalShortSize: 30 * 1000 * 1000,
    },
    bnb: {
      name: "wbnb",
      address: getContractAddress("wbnb"),
      priceFeed: getContractAddress("bnbPriceFeed"),
      decimals: 18,
      tokenIndex: 2,
      priceDecimals: 8,
      fastPricePrecision: 1000,
      isStrictStable: false,
      tokenWeight: 10000, // 10%
      minProfitBps: 0,
      maxUsdgAmount: 100 * 1000 * 1000,
      // bufferAmount: 15000,
      isStable: false,
      isShortable: true,
      maxGlobalShortSize: 30 * 1000 * 1000,
    },
    busd: {
      name: "busd",
      address: getContractAddress("busd"),
      priceFeed: getContractAddress("busdPriceFeed"),
      decimals: 18,
      tokenIndex: 4,
      priceDecimals: 8,
      isStrictStable: true,
      tokenWeight: 35000, // 35%
      minProfitBps: 0,
      maxUsdgAmount: 350 * 1000 * 1000,
      // bufferAmount: 60 * 1000 * 1000,
      isStable: true,
      isShortable: false,
    },
    usdc: {
      name: "usdc",
      address: getContractAddress("usdc"),
      decimals: 18,
      priceFeed: getContractAddress("usdcPriceFeed"),
      priceDecimals: 8,
      isStrictStable: true,
      tokenWeight: 15000, // 15%
      minProfitBps: 0,
      maxUsdgAmount: 150 * 1000 * 1000,
      // bufferAmount: 60 * 1000 * 1000,
      isStable: true,
      isShortable: false
    },
    matic: {
      name: "matic",
      address: getContractAddress("matic"),
      priceFeed: getContractAddress("maticPriceFeed"),
      decimals: 18,
      tokenIndex: 1,
      priceDecimals: 8,
      fastPricePrecision: 1000,
      isStrictStable: false,
      tokenWeight: 5000, // 5%
      minProfitBps: 0,
      maxUsdgAmount: 50 * 1000 * 1000,
      // bufferAmount: 15000,
      isStable: false,
      isShortable: true,
      maxGlobalShortSize: 30 * 1000 * 1000,
    },
    op: {
      name: "op",
      address: getContractAddress("op"),
      priceFeed: getContractAddress("opPriceFeed"),
      decimals: 18,
      tokenIndex: 1,
      priceDecimals: 8,
      fastPricePrecision: 1000,
      isStrictStable: false,
      tokenWeight: 5000, // 5%
      minProfitBps: 0,
      maxUsdgAmount: 50 * 1000 * 1000,
      // bufferAmount: 15000,
      isStable: false,
      isShortable: true,
      maxGlobalShortSize: 30 * 1000 * 1000,
    },
    arb: {
      name: "arb",
      address: getContractAddress("arb"),
      priceFeed: getContractAddress("arbPriceFeed"),
      decimals: 18,
      tokenIndex: 1,
      priceDecimals: 8,
      fastPricePrecision: 1000,
      isStrictStable: false,
      tokenWeight: 5000, // 5%
      minProfitBps: 0,
      maxUsdgAmount: 50 * 1000 * 1000,
      // bufferAmount: 15000,
      isStable: false,
      isShortable: true,
      maxGlobalShortSize: 30 * 1000 * 1000,
    },
    nativeToken: {
      address: getContractAddress("wbnb"),
      decimals: 18,
      // priceDecimals: 8,
      isStrictStable: false,
    },
  }, */
  /* bscTestnet: {
    // tokenWeight = 100,000
    btc: {
      name: "btc",
      address: getContractAddress("btc"),
      priceFeed: getContractAddress("btcPriceFeed"),
      decimals: 18,
      tokenIndex: 0,
      priceDecimals: 8,
      fastPricePrecision: 1000,
      isStrictStable: false,
      tokenWeight: 15000, // 15%
      minProfitBps: 0,
      maxUsdgAmount: 150 * 1000 * 1000,
      // bufferAmount: 450,
      isStable: false,
      isShortable: true,
      maxGlobalShortSize: 30 * 1000 * 1000,
    },
    eth: {
      name: "eth",
      address: getContractAddress("eth"),
      priceFeed: getContractAddress("ethPriceFeed"),
      decimals: 18,
      tokenIndex: 1,
      priceDecimals: 8,
      fastPricePrecision: 1000,
      isStrictStable: false,
      tokenWeight: 15000, // 15%
      minProfitBps: 0,
      maxUsdgAmount: 150 * 1000 * 1000,
      // bufferAmount: 15000,
      isStable: false,
      isShortable: true,
      maxGlobalShortSize: 30 * 1000 * 1000,
    },
    bnb: {
      name: "wbnb",
      address: getContractAddress("wbnb"),
      priceFeed: getContractAddress("bnbPriceFeed"),
      decimals: 18,
      tokenIndex: 2,
      priceDecimals: 8,
      fastPricePrecision: 1000,
      isStrictStable: false,
      tokenWeight: 15000, // 15%
      minProfitBps: 0,
      maxUsdgAmount: 150 * 1000 * 1000,
      // bufferAmount: 15000,
      isStable: false,
      isShortable: true,
      maxGlobalShortSize: 30 * 1000 * 1000,
    },
    busd: {
      name: "busd",
      address: getContractAddress("busd"),
      priceFeed: getContractAddress("busdPriceFeed"),
      decimals: 18,
      tokenIndex: 4,
      priceDecimals: 8,
      isStrictStable: true,
      tokenWeight: 35000, // 35%
      minProfitBps: 0,
      maxUsdgAmount: 350 * 1000 * 1000,
      // bufferAmount: 60 * 1000 * 1000,
      isStable: true,
      isShortable: false,
    },
    usdc: {
      name: "usdc",
      address: getContractAddress("usdc"),
      priceFeed: getContractAddress("usdcPriceFeed"),
      decimals: 18,
      tokenIndex: 5,
      priceDecimals: 8,
      isStrictStable: true,
      tokenWeight: 15000, // 15%
      minProfitBps: 0,
      maxUsdgAmount: 150 * 1000 * 1000,
      // bufferAmount: 60 * 1000 * 1000,
      isStable: true,
      isShortable: false
    },
    // doge: {
    //   name: "doge",
    //   address: getContractAddress("doge"),
    //   priceFeed: getContractAddress("dogePriceFeed"),
    //   decimals: 18,
    //   tokenIndex: 6,
    //   priceDecimals: 8,
    //   fastPricePrecision: 1000,
    //   isStrictStable: false,
    //   tokenWeight: 5000, // 5%
    //   minProfitBps: 0,
    //   maxUsdgAmount: 50 * 1000 * 1000,
    //   // bufferAmount: 15000,
    //   isStable: false,
    //   isShortable: true,
    //   maxGlobalShortSize: 30 * 1000 * 1000,
    // },
    nativeToken: {
      address: getContractAddress("wbnb"),
      decimals: 18,
      // priceDecimals: 8,
      isStrictStable: false,
    },
  }, */
lineaTestnet: {
  // tokenWeight = 100,000
  btc: {
    name: "btc",
    address: getContractAddress("btc"),
    priceFeed: getContractAddress("btcPriceFeed"),
    decimals: 18,
    tokenIndex: 0,
    priceDecimals: 8,
    fastPricePrecision: 1000,
    isStrictStable: false,
    tokenWeight: 15000, // 15%
    minProfitBps: 0,
    maxUsdgAmount: 150 * 1000 * 1000,
    // bufferAmount: 450,
    isStable: false,
    isShortable: true,
    maxGlobalShortSize: 30 * 1000 * 1000,
  },
  eth: {
    name: "weth",
    address: getContractAddress("weth"),
    priceFeed: getContractAddress("ethPriceFeed"),
    decimals: 18,
    tokenIndex: 1,
    priceDecimals: 8,
    fastPricePrecision: 1000,
    isStrictStable: false,
    tokenWeight: 10000, // 10%
    minProfitBps: 0,
    maxUsdgAmount: 100 * 1000 * 1000,
    // bufferAmount: 15000,
    isStable: false,
    isShortable: true,
    maxGlobalShortSize: 30 * 1000 * 1000,
  },
  bnb: {
    name: "bnb",
    address: getContractAddress("bnb"),
    priceFeed: getContractAddress("bnbPriceFeed"),
    decimals: 18,
    tokenIndex: 2,
    priceDecimals: 8,
    fastPricePrecision: 1000,
    isStrictStable: false,
    tokenWeight: 10000, // 10%
    minProfitBps: 0,
    maxUsdgAmount: 100 * 1000 * 1000,
    // bufferAmount: 15000,
    isStable: false,
    isShortable: true,
    maxGlobalShortSize: 30 * 1000 * 1000,
  },
  busd: {
    name: "busd",
    address: getContractAddress("busd"),
    priceFeed: getContractAddress("busdPriceFeed"),
    decimals: 18,
    tokenIndex: 4,
    priceDecimals: 8,
    isStrictStable: true,
    tokenWeight: 35000, // 35%
    minProfitBps: 0,
    maxUsdgAmount: 350 * 1000 * 1000,
    // bufferAmount: 60 * 1000 * 1000,
    isStable: true,
    isShortable: false,
  },
  usdc: {
    name: "usdc",
    address: getContractAddress("usdc"),
    decimals: 18,
    priceFeed: getContractAddress("usdcPriceFeed"),
    priceDecimals: 8,
    isStrictStable: true,
    tokenWeight: 15000, // 15%
    minProfitBps: 0,
    maxUsdgAmount: 150 * 1000 * 1000,
    // bufferAmount: 60 * 1000 * 1000,
    isStable: true,
    isShortable: false
  },
  matic: {
    name: "matic",
    address: getContractAddress("matic"),
    priceFeed: getContractAddress("maticPriceFeed"),
    decimals: 18,
    tokenIndex: 1,
    priceDecimals: 8,
    fastPricePrecision: 1000,
    isStrictStable: false,
    tokenWeight: 5000, // 5%
    minProfitBps: 0,
    maxUsdgAmount: 50 * 1000 * 1000,
    // bufferAmount: 15000,
    isStable: false,
    isShortable: true,
    maxGlobalShortSize: 30 * 1000 * 1000,
  },
  op: {
    name: "op",
    address: getContractAddress("op"),
    priceFeed: getContractAddress("opPriceFeed"),
    decimals: 18,
    tokenIndex: 1,
    priceDecimals: 8,
    fastPricePrecision: 1000,
    isStrictStable: false,
    tokenWeight: 5000, // 5%
    minProfitBps: 0,
    maxUsdgAmount: 50 * 1000 * 1000,
    // bufferAmount: 15000,
    isStable: false,
    isShortable: true,
    maxGlobalShortSize: 30 * 1000 * 1000,
  },
  arb: {
    name: "arb",
    address: getContractAddress("arb"),
    priceFeed: getContractAddress("arbPriceFeed"),
    decimals: 18,
    tokenIndex: 1,
    priceDecimals: 8,
    fastPricePrecision: 1000,
    isStrictStable: false,
    tokenWeight: 5000, // 5%
    minProfitBps: 0,
    maxUsdgAmount: 50 * 1000 * 1000,
    // bufferAmount: 15000,
    isStable: false,
    isShortable: true,
    maxGlobalShortSize: 30 * 1000 * 1000,
  },
  nativeToken: {
    address: getContractAddress("weth"),
    decimals: 18,
    // priceDecimals: 8,
    isStrictStable: false,
  },
},
};
