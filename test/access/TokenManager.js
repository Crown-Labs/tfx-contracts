const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

const { AddressZero } = ethers.constants

describe("TokenManager", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, signer0, signer1, signer2] = provider.getWallets()
  let eth
  let tokenManager
  let timelock


  beforeEach(async () => {
    eth = await deployContract("Token", [])
    tokenManager = await deployContract("TokenManager", [2])

    await tokenManager.initialize([signer0.address, signer1.address, signer2.address])

    timelock = await deployContract("Timelock", [
      wallet.address,
      5 * 24 * 60 * 60,
      user0.address,
      tokenManager.address,
      user2.address,
      expandDecimals(1000, 18),
      10,
      100
    ])

  })

  it("inits", async () => {
    await expect(tokenManager.initialize([signer0.address, signer1.address, signer2.address]))
      .to.be.revertedWith("TokenManager: already initialized")

    expect(await tokenManager.signers(0)).eq(signer0.address)
    expect(await tokenManager.signers(1)).eq(signer1.address)
    expect(await tokenManager.signers(2)).eq(signer2.address)
    expect(await tokenManager.signersLength()).eq(3)

    expect(await tokenManager.isSigner(user0.address)).eq(false)
    expect(await tokenManager.isSigner(signer0.address)).eq(true)
    expect(await tokenManager.isSigner(signer1.address)).eq(true)
    expect(await tokenManager.isSigner(signer2.address)).eq(true)
  })

  it("signalApprove", async () => {
    await expect(tokenManager.connect(user0).signalApprove(eth.address, user2.address, expandDecimals(5, 18)))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))
  })

  it("signApprove", async () => {
    await expect(tokenManager.connect(user0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))

    await expect(tokenManager.connect(user0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(tokenManager.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: already signed")

    await tokenManager.connect(signer1).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)
  })

  it("approve", async () => {
    await eth.mint(tokenManager.address, expandDecimals(5, 18))

    await expect(tokenManager.connect(user0).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))

    // await expect(tokenManager.connect(wallet).approve(gmx.address, user2.address, expandDecimals(5, 18), 1))
    //   .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approve(eth.address, user0.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approve(eth.address, user2.address, expandDecimals(6, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not authorized")

    await tokenManager.connect(signer0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(tokenManager.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await tokenManager.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(eth.connect(user2).transferFrom(tokenManager.address, user1.address, expandDecimals(4, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await tokenManager.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(eth.connect(user2).transferFrom(tokenManager.address, user1.address, expandDecimals(6, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    expect(await eth.balanceOf(user1.address)).eq(0)
    await eth.connect(user2).transferFrom(tokenManager.address, user1.address, expandDecimals(5, 18))
    expect(await eth.balanceOf(user1.address)).eq(expandDecimals(5, 18))
  })

  it("signalSetAdmin", async () => {
    await expect(tokenManager.connect(user0).signalSetAdmin(timelock.address, user1.address))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).signalSetAdmin(timelock.address, user1.address))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(signer0).signalSetAdmin(timelock.address, user1.address)
  })

  it("signSetAdmin", async () => {
    await expect(tokenManager.connect(user0).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer1).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(signer1).signalSetAdmin(timelock.address, user1.address)

    await expect(tokenManager.connect(user0).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer1).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: already signed")

    await tokenManager.connect(signer2).signSetAdmin(timelock.address, user1.address, 1)

    await expect(tokenManager.connect(signer2).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: already signed")
  })

  it("setAdmin", async () => {
    await expect(tokenManager.connect(user0).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer0).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(signer0).signalSetAdmin(timelock.address, user1.address)

    await expect(tokenManager.connect(signer0).setAdmin(user0.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(signer0).setAdmin(timelock.address, user0.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(signer0).setAdmin(timelock.address, user1.address, 2))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(signer0).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await tokenManager.connect(signer2).signSetAdmin(timelock.address, user1.address, 1)

    expect(await timelock.admin()).eq(wallet.address)
    await tokenManager.connect(signer2).setAdmin(timelock.address, user1.address, 1)
    expect(await timelock.admin()).eq(user1.address)
  })
})
