const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, increaseBlocktime, mineBlock, reportGasUsed } = require("../../shared/utilities")
const { toXOraclePrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, validateVaultBalance, tokenIndexs } = require("./helpers")
const { deployXOracle, getPriceFeed } = require("../../shared/xOracle")

use(solidity)

describe("Vault.settings", function () {
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

    // set vaultPriceFeed
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, usdtPriceFeed.address, 8, false) // instead DAI with USDT
  })

  it("directPoolDeposit", async () => {
    await fulfillController.requestUpdatePrices()
    await xOracle.fulfillRequest([
        { tokenIndex: tokenIndexs.BNB, price: toXOraclePrice(300), lastUpdate: 0 } 
    ], 0)

    await expect(vault.connect(user0).directPoolDeposit(bnb.address))
      .to.be.revertedWith("Vault: _token not whitelisted")

    await vault.setTokenConfig(...getBnbConfig(bnb))

    await expect(vault.connect(user0).directPoolDeposit(bnb.address))
      .to.be.revertedWith("Vault: invalid tokenAmount")

    await bnb.mint(user0.address, 1000)
    await bnb.connect(user0).transfer(vault.address, 1000)

    expect(await vault.poolAmounts(bnb.address)).eq(0)
    await vault.connect(user0).directPoolDeposit(bnb.address)
    expect(await vault.poolAmounts(bnb.address)).eq(1000)

    await validateVaultBalance(expect, vault, bnb)
  })
})
