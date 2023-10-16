const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")

use(solidity)

describe("USDX", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let usdx

  beforeEach(async () => {
    usdx = await deployContract("USDX", [user1.address])
  })

  it("addVault", async () => {
    await expect(usdx.connect(user0).addVault(user0.address))
      .to.be.revertedWith("YieldToken: forbidden")

    await usdx.setGov(user0.address)

    expect(await usdx.vaults(user0.address)).eq(false)
    await usdx.connect(user0).addVault(user0.address)
    expect(await usdx.vaults(user0.address)).eq(true)
  })

  it("removeVault", async () => {
    await expect(usdx.connect(user0).removeVault(user0.address))
      .to.be.revertedWith("YieldToken: forbidden")

    await usdx.setGov(user0.address)

    expect(await usdx.vaults(user0.address)).eq(false)
    await usdx.connect(user0).addVault(user0.address)
    expect(await usdx.vaults(user0.address)).eq(true)
    await usdx.connect(user0).removeVault(user0.address)
    expect(await usdx.vaults(user0.address)).eq(false)
  })

  it("mint", async () => {
    expect(await usdx.balanceOf(user1.address)).eq(0)
    await usdx.connect(user1).mint(user1.address, 1000)
    expect(await usdx.balanceOf(user1.address)).eq(1000)
    expect(await usdx.totalSupply()).eq(1000)

    await expect(usdx.connect(user0).mint(user1.address, 1000))
      .to.be.revertedWith("USDX: forbidden")

    await usdx.addVault(user0.address)

    expect(await usdx.balanceOf(user1.address)).eq(1000)
    await usdx.connect(user0).mint(user1.address, 500)
    expect(await usdx.balanceOf(user1.address)).eq(1500)
    expect(await usdx.totalSupply()).eq(1500)
  })

  it("burn", async () => {
    expect(await usdx.balanceOf(user1.address)).eq(0)
    await usdx.connect(user1).mint(user1.address, 1000)
    expect(await usdx.balanceOf(user1.address)).eq(1000)
    await usdx.connect(user1).burn(user1.address, 300)
    expect(await usdx.balanceOf(user1.address)).eq(700)
    expect(await usdx.totalSupply()).eq(700)

    await expect(usdx.connect(user0).burn(user1.address, 100))
      .to.be.revertedWith("USDX: forbidden")

    await usdx.addVault(user0.address)

    await usdx.connect(user0).burn(user1.address, 100)
    expect(await usdx.balanceOf(user1.address)).eq(600)
    expect(await usdx.totalSupply()).eq(600)
  })
})
