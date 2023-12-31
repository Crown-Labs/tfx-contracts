const { deployContract } = require("./fixtures")
const { tokenIndexs } = require("../core/Vault/helpers")

let xOracle;
let btcPriceFeed;
let ethPriceFeed;
let bnbPriceFeed;
let usdtPriceFeed;
let busdPriceFeed;
let usdcPriceFeed;
const fulfillFee = 3000; // 30%
const minGasPrice = 0.5 * 10 ** 9

async function deployXOracle(weth) {
    xOracle = await deployContract("XOracleMock", [weth.address])
    btcPriceFeed = await deployContract("PriceFeedStoreMock", [xOracle.address, "BTC/USD Price Feed", tokenIndexs.BTC, 8])
    ethPriceFeed = await deployContract("PriceFeedStoreMock", [xOracle.address, "ETH/USD Price Feed", tokenIndexs.ETH, 8])
    bnbPriceFeed = await deployContract("PriceFeedStoreMock", [xOracle.address, "BNB/USD Price Feed", tokenIndexs.BNB, 8])
    usdtPriceFeed = await deployContract("PriceFeedStoreMock", [xOracle.address, "USDT/USD Price Feed", tokenIndexs.USDT, 8])
    busdPriceFeed = await deployContract("PriceFeedStoreMock", [xOracle.address, "BUSD/USD Price Feed", tokenIndexs.BUSD, 8])
    usdcPriceFeed = await deployContract("PriceFeedStoreMock", [xOracle.address, "USDC/USD Price Feed", tokenIndexs.USDC, 8])

    await xOracle.setPriceFeedStore(btcPriceFeed.address, tokenIndexs.BTC)
    await xOracle.setPriceFeedStore(ethPriceFeed.address, tokenIndexs.ETH)
    await xOracle.setPriceFeedStore(bnbPriceFeed.address, tokenIndexs.BNB)
    await xOracle.setPriceFeedStore(usdtPriceFeed.address, tokenIndexs.USDT)
    await xOracle.setPriceFeedStore(busdPriceFeed.address, tokenIndexs.BUSD)
    await xOracle.setPriceFeedStore(usdcPriceFeed.address, tokenIndexs.USDC)
    
    // set reqFee
    await xOracle.setFulfillFee(fulfillFee);
    await xOracle.setMinGasPrice(minGasPrice)

    return xOracle;
}

function getPriceFeed() {
    return [
        btcPriceFeed,
        ethPriceFeed,
        bnbPriceFeed,
        usdtPriceFeed,
        busdPriceFeed,
        usdcPriceFeed
    ];
}

module.exports = { deployXOracle, getPriceFeed }
