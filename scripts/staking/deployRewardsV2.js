const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const admin = { address: "0x083B4acb59B0D102740cDA8de8f31cB603091043" }
  const buffer = 60 * 60
  const rewardManager = await deployContract("RewardManager", [])
  const tokenManager = { address: "0x3E647E4728087d0eBc24d46bDd7f01d58fA66DE1" }
  const mintReceiver = { address: "0xceE8B143eBE02dFa69c508aaE715B5C06e976684" }
  const maxTokenSupply = expandDecimals("13250000", 18)

  const weth = await contractAt("Token", "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd")

  const gmx = { address: "0x515a17c17A67ba12C7E8ca1731872F295dE02174" }
  const esGmx = { address: "0xe04328814719283c0a76bfeD5A958973325e35b5" }
  const bnGmx = { address: "0xdDd305f7623e56989c17ad0388DB2B93F94320B3" }
  const xlp = { address: "0xfe8922C02fb5eb2E6F3FfD727de0962d9EBC222C" }
  const stakedGmxTracker = { address: "0x7d8Bee631C43a87fd6A8D4B2f7a7798b67091619" } // sGMX
  const bonusGmxTracker = { address: "0xAA757Ff4deeed78608ab0652037e47C202D9BfC0" } // sbGMX
  const feeGmxTracker = { address: "0x6253d831b532cdF9f035d04670aF417C15cA5ED0" } // sbfGMX
  const feeXlpTracker = { address: "0x4e971a87900b931fF39d1Aad67697F49835400b6" } // ?
  const stakedXlpTracker = { address: "0x1aDDD80E6039594eE970E5872D247bf0414C8903" } // ?
  const xlpManager = { address: "0x99afD4434e61d8C871387298eA0efeF6bf5E9eEB" }
  const stakedGmxDistributor = { address: "0x5D5f6FB3d4C0813ca7657a27022E2ab4695ef9aA" } // stakedGmxDistributor
  const stakedXlpDistributor = { address: "0x60519b48ec4183a61ca2B8e37869E675FD203b34" } // ?

  const timelock = await deployContract("Timelock", [
    admin.address,
    buffer,
    rewardManager.address,
    tokenManager.address,
    mintReceiver.address,
    maxTokenSupply
  ])

  const vestingDuration = 365 * 24 * 60 * 60

  const gmxVester = await deployContract("Vester", [
    "Vested GMX", // _name
    "vGMX", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    feeGmxTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedGmxTracker.address, // _rewardTracker
  ])

  const xlpVester = await deployContract("Vester", [
    "Vested GLP", // _name
    "vGLP", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    stakedXlpTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedXlpTracker.address, // _rewardTracker
  ])

  const rewardRouter = await deployContract("RewardRouterV2", [])

  await rewardRouter.initialize(
    weth.address,
    gmx.address,
    esGmx.address,
    bnGmx.address,
    xlp.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    feeGmxTracker.address,
    feeXlpTracker.address,
    stakedXlpTracker.address,
    xlpManager.address,
    gmxVester.address,
    xlpVester.address
  )

  await rewardManager.initialize(
    timelock.address,
    rewardRouter.address,
    xlpManager.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    feeGmxTracker.address,
    feeXlpTracker.address,
    stakedXlpTracker.address,
    stakedGmxDistributor.address,
    stakedXlpDistributor.address,
    esGmx.address,
    bnGmx.address,
    gmxVester.address,
    xlpVester.address
  )

  // await rewardManager.updateEsGmxHandlers()
  // await rewardManager.enableRewardRouter()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
