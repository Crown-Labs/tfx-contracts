const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, increaseBlocktime, reportGasUsed } = require("../../shared/utilities")
const { toXOraclePrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, validateVaultBalance, tokenIndexs } = require("./helpers")
const { deployXOracle, getPriceFeed } = require("../../shared/xOracle")

use(solidity)

describe("Vault.buyUSDG", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultPriceFeed
  let usdg
  let router
  let bnb
  let btc
  let dai
  let distributor0
  let yieldTracker0
  let fulfillController

  let glpManager
  let glp

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    btc = await deployContract("Token", [])
    dai = await deployContract("Token", [])

    vault = await deployContract("Vault", [])
    vaultPositionController = await deployContract("VaultPositionController", [])
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, vaultPositionController.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    await initVault(vault, vaultPositionController, router, usdg, vaultPriceFeed)

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    // deploy xOracle
    xOracle = await deployXOracle();
    const [btcPriceFeed, ethPriceFeed, bnbPriceFeed, usdtPriceFeed, busdPriceFeed, usdcPriceFeed] = await getPriceFeed();

    // deploy fulfillController
    fulfillController = await deployContract("FulfillController", [xOracle.address, bnb.address])
    await fulfillController.setController(wallet.address, true)

    // send fund to fulfillController
    await wallet.sendTransaction({ to: fulfillController.address, value: ethers.utils.parseEther("1.0") })

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT

    glp = await deployContract("GLP", [])
    glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, 24 * 60 * 60])
  })

  it("buyUSDG", async () => {
    await expect(vault.buyUSDG(bnb.address, wallet.address))
      .to.be.revertedWith("Vault: _token not whitelisted")

    await expect(vault.connect(user0).buyUSDG(bnb.address, user1.address))
      .to.be.revertedWith("Vault: _token not whitelisted")

    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 } 
      ], 0)
    await vault.setTokenConfig(...getBnbConfig(bnb))

    await expect(vault.connect(user0).buyUSDG(bnb.address, user1.address))
      .to.be.revertedWith("Vault: invalid tokenAmount")

    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(0)
    expect(await vault.usdgAmounts(bnb.address)).eq(0)
    expect(await vault.poolAmounts(bnb.address)).eq(0)

    await bnb.mint(user0.address, 100)
    await bnb.connect(user0).transfer(vault.address, 100)
    const tx = await vault.connect(user0).buyUSDG(bnb.address, user1.address, { gasPrice: "10000000000" })
    await reportGasUsed(provider, tx, "buyUSDG gas used")

    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(29700)
    expect(await vault.feeReserves(bnb.address)).eq(1)
    expect(await vault.usdgAmounts(bnb.address)).eq(29700)
    expect(await vault.poolAmounts(bnb.address)).eq(100 - 1)

    await validateVaultBalance(expect, vault, bnb)

    expect(await glpManager.getAumInUsdg(true)).eq(29700)
  })

  it("buyUSDG allows gov to mint", async () => {
    await vault.setInManagerMode(true)
    await expect(vault.buyUSDG(bnb.address, wallet.address))
      .to.be.revertedWith("Vault: forbidden")

    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 } 
      ], 0)
    await vault.setTokenConfig(...getBnbConfig(bnb))

    await bnb.mint(wallet.address, 100)
    await bnb.transfer(vault.address, 100)

    expect(await usdg.balanceOf(wallet.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(0)
    expect(await vault.usdgAmounts(bnb.address)).eq(0)
    expect(await vault.poolAmounts(bnb.address)).eq(0)

    await expect(vault.connect(user0).buyUSDG(bnb.address, wallet.address))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setManager(user0.address, true)
    await vault.connect(user0).buyUSDG(bnb.address, wallet.address)

    expect(await usdg.balanceOf(wallet.address)).eq(29700)
    expect(await vault.feeReserves(bnb.address)).eq(1)
    expect(await vault.usdgAmounts(bnb.address)).eq(29700)
    expect(await vault.poolAmounts(bnb.address)).eq(100 - 1)

    await validateVaultBalance(expect, vault, bnb)
  })

  it("buyUSDG uses min price", async () => {
    await expect(vault.connect(user0).buyUSDG(bnb.address, user1.address))
      .to.be.revertedWith("Vault: _token not whitelisted")

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 } 
      ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(200), lastUpdate: 0 } 
      ], 0)

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(250), lastUpdate: 0 } 
      ], 0)

    await vault.setTokenConfig(...getBnbConfig(bnb))

    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(0)
    expect(await vault.usdgAmounts(bnb.address)).eq(0)
    expect(await vault.poolAmounts(bnb.address)).eq(0)
    await bnb.mint(user0.address, 100)
    await bnb.connect(user0).transfer(vault.address, 100)
    await vault.connect(user0).buyUSDG(bnb.address, user1.address)
    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(19800)
    expect(await vault.feeReserves(bnb.address)).eq(1)
    expect(await vault.usdgAmounts(bnb.address)).eq(19800)
    expect(await vault.poolAmounts(bnb.address)).eq(100 - 1)

    await validateVaultBalance(expect, vault, bnb)
  })

  it("buyUSDG updates fees", async () => {
    await expect(vault.connect(user0).buyUSDG(bnb.address, user1.address))
      .to.be.revertedWith("Vault: _token not whitelisted")

    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 } 
      ], 0)
    await vault.setTokenConfig(...getBnbConfig(bnb))

    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(0)
    expect(await vault.usdgAmounts(bnb.address)).eq(0)
    expect(await vault.poolAmounts(bnb.address)).eq(0)
    await bnb.mint(user0.address, 10000)
    await bnb.connect(user0).transfer(vault.address, 10000)
    await vault.connect(user0).buyUSDG(bnb.address, user1.address)
    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(9970 * 300)
    expect(await vault.feeReserves(bnb.address)).eq(30)
    expect(await vault.usdgAmounts(bnb.address)).eq(9970 * 300)
    expect(await vault.poolAmounts(bnb.address)).eq(10000 - 30)

    await validateVaultBalance(expect, vault, bnb)
  })

  it("buyUSDG uses mintBurnFeeBasisPoints", async () => {
    await increaseBlocktime(provider, 10) // skip blocktime 10 sec
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.USDT, price: toXOraclePrice(1), lastUpdate: (await getBlockTime(provider)) + 24 * 60 * 60 } // set permanent price
    ], 0)
		await vault.setTokenConfig(...getDaiConfig(dai))

    await vault.setFees(
      50, // _taxBasisPoints
      10, // _stableTaxBasisPoints
      4, // _mintBurnFeeBasisPoints
      30, // _swapFeeBasisPoints
      4, // _stableSwapFeeBasisPoints
      10, // _marginFeeBasisPoints
      toUsd(5), // _liquidationFeeUsd
      0, // _minProfitTime
      false // _hasDynamicFees
    )

    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(bnb.address)).eq(0)
    expect(await vault.usdgAmounts(bnb.address)).eq(0)
    expect(await vault.poolAmounts(bnb.address)).eq(0)
    await dai.mint(user0.address, expandDecimals(10000, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(10000, 18))
    await vault.connect(user0).buyUSDG(dai.address, user1.address)
    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(expandDecimals(10000 - 4, 18))
    expect(await vault.feeReserves(dai.address)).eq(expandDecimals(4, 18))
    expect(await vault.usdgAmounts(dai.address)).eq(expandDecimals(10000 - 4, 18))
    expect(await vault.poolAmounts(dai.address)).eq(expandDecimals(10000 - 4, 18))
  })

  it("buyUSDG adjusts for decimals", async () => {
    await increaseBlocktime(provider, 10)
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BTC, price: toXOraclePrice(60000), lastUpdate: 0 } 
    ], 0)
		await vault.setTokenConfig(...getBtcConfig(btc))

    await expect(vault.connect(user0).buyUSDG(btc.address, user1.address))
      .to.be.revertedWith("Vault: invalid tokenAmount")

    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user1.address)).eq(0)
    expect(await vault.feeReserves(btc.address)).eq(0)
    expect(await vault.usdgAmounts(bnb.address)).eq(0)
    expect(await vault.poolAmounts(bnb.address)).eq(0)
    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user0).transfer(vault.address, expandDecimals(1, 8))
    await vault.connect(user0).buyUSDG(btc.address, user1.address)
    expect(await usdg.balanceOf(user0.address)).eq(0)
    expect(await vault.feeReserves(btc.address)).eq(300000)
    expect(await usdg.balanceOf(user1.address)).eq(expandDecimals(60000, 18).sub(expandDecimals(180, 18))) // 0.3% of 60,000 => 180
    expect(await vault.usdgAmounts(btc.address)).eq(expandDecimals(60000, 18).sub(expandDecimals(180, 18)))
    expect(await vault.poolAmounts(btc.address)).eq(expandDecimals(1, 8).sub(300000))

    await validateVaultBalance(expect, vault, btc)
  })
})
