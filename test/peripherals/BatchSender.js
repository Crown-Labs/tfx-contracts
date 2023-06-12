const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")

use(solidity)

describe("BatchSender", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let batchSender
  let gmt

  beforeEach(async () => {
    batchSender = await deployContract("BatchSender", [])
    gmt = await deployContract("GMT", [1500])
    await gmt.beginMigration()
  })

  it("setHandler", async () => {
    expect(await batchSender.isHandler(wallet.address)).eq(true)
    expect(await batchSender.isHandler(user0.address)).eq(false)

    await expect(batchSender.connect(user1).setHandler(user0.address, true))
      .to.be.revertedWith("Governable: forbidden")

    await expect(batchSender.connect(user1).setGov(user1.address))
      .to.be.revertedWith("Governable: forbidden")

    expect(await batchSender.gov()).eq(wallet.address)
    await batchSender.connect(wallet).setGov(user1.address)
    expect(await batchSender.gov()).eq(user1.address)

    const accounts = [user0.address, user1.address, user2.address, user3.address]
    const amounts = [100, 200, 300, 400]

    await expect(batchSender.connect(user0).send(gmt.address, accounts, amounts))
      .to.be.revertedWith("BatchSender: forbidden")

    await expect(batchSender.connect(user0).sendAndEmit(gmt.address, accounts, amounts, 1))
      .to.be.revertedWith("BatchSender: forbidden")

    expect(await batchSender.isHandler(user0.address)).eq(false)
    await batchSender.connect(user1).setHandler(user0.address, true)
    expect(await batchSender.isHandler(user0.address)).eq(true)

    await expect(batchSender.connect(user0).send(gmt.address, accounts, amounts))
      .to.be.revertedWith("GMT: transfer amount exceeds allowance")

    await expect(batchSender.connect(user0).sendAndEmit(gmt.address, accounts, amounts, 1))
      .to.be.revertedWith("GMT: transfer amount exceeds allowance")
  })
})
