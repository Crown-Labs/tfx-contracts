const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed } = require("../shared/utilities")
const { toXOraclePrice } = require("../shared/chainlink")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getEthConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("../core/Vault/helpers")

use(solidity)

describe("XLPManagerReader", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let usdx
  let router
  let btc
  let eth
  let bnb
  let busd
  let xlpManagerReader
  let xOracle
  let fulfillController

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    btc = await deployContract("Token", [])
    eth = await deployContract("Token", [])
    busd = await deployContract("Token", [])

    vault = await deployContract("Vault", [])
    vaultPositionController = await deployContract("VaultPositionController", [])
    usdx = await deployContract("USDX", [vault.address])
    router = await deployContract("Router", [vault.address, vaultPositionController.address, usdx.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    xlp = await deployContract("XLP", [])

    await initVault(vault, vaultPositionController, router, usdx, vaultPriceFeed)
    xlpManager = await deployContract("XlpManager", [vault.address, usdx.address, xlp.address, 24 * 60 * 60])

    await usdx.addVault(xlpManager.address)

    // deploy xOracle
    xOracle = await deployXOracle(bnb);
    const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

    // deploy fulfillController
    fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address, 0])

    // deposit req fund to fulfillController
    await bnb.mint(fulfillController.address, ethers.utils.parseEther("1.0"))

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(busd.address, busdPriceFeed.address, 8, false) // instead DAI with USDT

    // set fulfillController
    await fulfillController.setController(wallet.address, true)
    await fulfillController.setHandler(xlpManager.address, true)

    // set xlpManager
    await xlpManager.setFulfillController(fulfillController.address);

    xlpManagerReader = await deployContract("XLPManagerReader", [])

    // set vault
    await vault.setTokenConfig(...getDaiConfig(busd))
    await vault.setTokenConfig(...getBtcConfig(btc))
    await vault.setTokenConfig(...getEthConfig(eth))
    await vault.setTokenConfig(...getBnbConfig(bnb))

    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
      { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(4000), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 },
      { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 }
    ], 0)

    await xlp.setInPrivateTransferMode(true)
    await xlp.setMinter(xlpManager.address, true)

    await vault.setManager(xlpManager.address, true)
    await vault.setInManagerMode(true)
  })

  it("getAum", async () => {
    await btc.mint(user2.address, "100000000") // 1 BTC
    await btc.connect(user2).approve(xlpManager.address,"100000000")

    await xlpManager.connect(user2).addLiquidity(
        btc.address,
        "100000000",
        0,
        0
    )

    await increaseBlocktime(provider, 10)

    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.ETH, price: toXOraclePrice(4000), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 },
        { tokenIndex: tokenIndexs.BUSD, price: toXOraclePrice(1), lastUpdate: 0 }
    ], 0)

    const result1 = await xlpManager.getAum(true, false)

    console.log(`xlpManager.getAum: ${result1}`)
    expect(result1).eq("59820000000000000000000000000000000") // 59,820 = (1 BTC * 60,000) - fee

    // function getAum(address xlpManager, address vault, LastPrice[] memory lastPrice) external view returns (uint256)
    const result2 = await xlpManagerReader.getAum(
        xlpManager.address, 
        vault.address, 
        [
            [ btc.address, "60000000000000000000000000000000000" ],
            [ eth.address, "4000000000000000000000000000000000" ],
            [ bnb.address, "300000000000000000000000000000000" ],
            [ busd.address, "1000000000000000000000000000000" ]
        ]
    );
    console.log(`xlpManagerReader.getAum: ${result2}`)
    expect(result2).eq(result1) 
  })
})
