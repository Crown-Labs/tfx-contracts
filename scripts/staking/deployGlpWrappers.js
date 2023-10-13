const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getTestnetValues() {
  const xlp = { address: "0xfe8922C02fb5eb2E6F3FfD727de0962d9EBC222C" }
  const xlpManager = { address: "0x99afD4434e61d8C871387298eA0efeF6bf5E9eEB" }
  const stakedXlpTracker = { address: "0x1aDDD80E6039594eE970E5872D247bf0414C8903" }
  const feeXlpTracker = { address: "0x4e971a87900b931fF39d1Aad67697F49835400b6" }

  return { xlp, xlpManager, stakedXlpTracker, feeXlpTracker }
}

async function getArbValues() {
  const xlp = { address: "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258" }
  const xlpManager = { address: "0x321F653eED006AD1C29D174e17d96351BDe22649" }
  const stakedXlpTracker = { address: "0x1aDDD80E6039594eE970E5872D247bf0414C8903" }
  const feeXlpTracker = { address: "0x4e971a87900b931fF39d1Aad67697F49835400b6" }

  return { xlp, xlpManager, stakedXlpTracker, feeXlpTracker }
}

async function getAvaxValues() {
  const xlp = { address: "0x01234181085565ed162a948b6a5e88758CD7c7b8" }
  const xlpManager = { address: "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F" }
  const stakedXlpTracker = { address: "0x9e295B5B976a184B14aD8cd72413aD846C299660" }
  const feeXlpTracker = { address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F" }

  return { xlp, xlpManager, stakedXlpTracker, feeXlpTracker }
}

async function getValues() {
  if (network === "testnet") {
    return getTestnetValues()
  }

  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const { xlp, xlpManager, stakedXlpTracker, feeXlpTracker } = await getValues()

  await deployContract("StakedXlp", [
    xlp.address,
    xlpManager.address,
    stakedXlpTracker.address,
    feeXlpTracker.address
  ])

  // await deployContract("XlpBalance", [xlpManager.address, stakedXlpTracker.address])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
