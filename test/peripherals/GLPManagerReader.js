const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed } = require("../shared/utilities")
const { toXOraclePrice } = require("../shared/chainlink")
const { deployXOracle, getPriceFeed } = require("../shared/xOracle")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getEthConfig, getBtcConfig, getDaiConfig, tokenIndexs } = require("../core/Vault/helpers")

use(solidity)

describe("GLPManagerReader", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let usdg
  let router
  let btc
  let eth
  let bnb
  let busd
  let glpManagerReader
  let xOracle
  let fulfillController

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    btc = await deployContract("Token", [])
    eth = await deployContract("Token", [])
    busd = await deployContract("Token", [])

    vault = await deployContract("Vault", [])
    vaultPositionController = await deployContract("VaultPositionController", [])
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, vaultPositionController.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    glp = await deployContract("GLP", [])

    await initVault(vault, vaultPositionController, router, usdg, vaultPriceFeed)
    glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, 24 * 60 * 60])

    await usdg.addVault(glpManager.address)

    // deploy xOracle
    xOracle = await deployXOracle();
    const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

    // deploy fulfillController
    fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address])

    // send fund to fulfillController
    await wallet.sendTransaction({ to: fulfillController.address, value: ethers.utils.parseEther("1.0") })

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(busd.address, busdPriceFeed.address, 8, false) // instead DAI with USDT

    // set fulfillController
    await fulfillController.setController(wallet.address, true)
    await fulfillController.setHandler(glpManager.address, true)

    // set glpManager
    await glpManager.setFulfillController(fulfillController.address);

    glpManagerReader = await deployContract("GLPManagerReader", [])

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

    await glp.setInPrivateTransferMode(true)
    await glp.setMinter(glpManager.address, true)

    await vault.setManager(glpManager.address, true)
    await vault.setInManagerMode(true)
  })

  it("getAum", async () => {
    await btc.mint(user2.address, "100000000") // 1 BTC
    await btc.connect(user2).approve(glpManager.address,"100000000")

    await glpManager.connect(user2).addLiquidity(
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

    const result1 = await glpManager.getAum(true, false)

    console.log(`glpManager.getAum: ${result1}`)
    expect(result1).eq("59820000000000000000000000000000000") // 59,820 = (1 BTC * 60,000) - fee

    // function getAum(address glpManager, address vault, LastPrice[] memory lastPrice) external view returns (uint256)
    const result2 = await glpManagerReader.getAum(
        glpManager.address, 
        vault.address, 
        [
            [ btc.address, "60000000000000000000000000000000000" ],
            [ eth.address, "4000000000000000000000000000000000" ],
            [ bnb.address, "300000000000000000000000000000000" ],
            [ busd.address, "1000000000000000000000000000000" ]
        ]
    );
    console.log(`glpManagerReader.getAum: ${result2}`)
    expect(result2).eq(result1) 
  })
})
