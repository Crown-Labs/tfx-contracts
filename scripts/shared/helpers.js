require('dotenv').config()
const { networkId, tokenIndexs, config } = require('./config')
const fs = require('fs')
const path = require('path')
const parse = require('csv-parse')

const network = process.env.HARDHAT_NETWORK || 'mainnet'
const tmpAddressesFilepath = path.join(__dirname, '..', '..', `.tmp-addresses-${process.env.HARDHAT_NETWORK}.json`)
const deployedAddress = readTmpAddresses()

const contactAddress = {
  // address signer
  deployer: config[getChainId(network)].deployer, // signer1
  signer2: config[getChainId(network)].signer2,
  signer3: config[getChainId(network)].signer3,

  // bot
  keeper: config[getChainId(network)].keeper,
  liquidator: config[getChainId(network)].liquidator,

  // fees
  feeReceiver: config[getChainId(network)].feeReceiver, // execute fee
  mintReceiver: config[getChainId(network)].mintReceiver,

  // token address
  btc: deployedAddress['BTC'],
  weth: config[getChainId(network)].weth,
  bnb: deployedAddress['BNB'],
  usdt: deployedAddress['USDT'],
  usdc: deployedAddress['USDC'],
  matic: deployedAddress['MATIC'],
  op: deployedAddress['OP'],
  arb: deployedAddress['ARB'],

  // xOracle price feed
  btcPriceFeed: config[getChainId(network)].btcPriceFeed,
  ethPriceFeed: config[getChainId(network)].ethPriceFeed,
  bnbPriceFeed: config[getChainId(network)].bnbPriceFeed,
  usdtPriceFeed: config[getChainId(network)].usdtPriceFeed,
  usdcPriceFeed: config[getChainId(network)].usdcPriceFeed,
  maticPriceFeed: config[getChainId(network)].maticPriceFeed,
  opPriceFeed: config[getChainId(network)].opPriceFeed,
  arbPriceFeed: config[getChainId(network)].arbPriceFeed,

  // deployed contract
  xOracle: config[getChainId(network)].xOracle,
  fulfillController: deployedAddress['FulfillController'],
  tokenManager: deployedAddress['TokenManager'],
  vault: deployedAddress['Vault'],
  vaultPositionController: deployedAddress['VaultPositionController'],
  vaultPriceFeed: deployedAddress['VaultPriceFeed'],
  router: deployedAddress['Router'],
  usdx: deployedAddress['USDX'],
  xlp: deployedAddress['XLP'],
  xlpManager: deployedAddress['XlpManager'],
  referralStorage: deployedAddress['ReferralStorage'],
  positionRouter: deployedAddress['PositionRouter'],
  orderBook: deployedAddress['OrderBook'],
  positionManager: deployedAddress['PositionManager'],
  rewardRouterV3: deployedAddress['RewardRouterV3'],
  timelock: deployedAddress['Timelock'],
  fXLP: deployedAddress['fXLP (Fee XLP)'],
  feeXlpDistributor: deployedAddress['feeXlpDistributor'],
}

function getContractAddress(name, allowEmpty = false) {
  const addr = contactAddress[name]
  if (!addr) {
    if (allowEmpty) {
      return ''
    }

    throw new Error('not found ' + name + ' address')
  }

  return addr
}

const readCsv = async (file) => {
  records = []
  const parser = fs.createReadStream(file).pipe(parse({ columns: true, delimiter: ',' }))
  parser.on('error', function (err) {
    console.error(err.message)
  })
  for await (const record of parser) {
    records.push(record)
  }
  return records
}

function getChainId(network) {
  const chainId = networkId[network]
  if (!chainId) {
    throw new Error('Unsupported network')
  }
  return chainId
}

async function getFrameSigner() {
  if (process.env.USE_FRAME_SIGNER == 'true') {
    try {
      const frame = new ethers.providers.JsonRpcProvider('http://127.0.0.1:1248')
      const signer = frame.getSigner()

      if (getChainId(network) !== (await signer.getChainId())) {
        throw new Error('Incorrect frame network')
      }

      console.log('🖼️ FrameSigner ChainId:', await signer.getChainId())
      console.log(`signer: ${signer.address}`)

      return signer
    } catch (e) {
      throw new Error(`getFrameSigner error: ${e.toString()}`)
    }
  } else {
    const [signer] = await hre.ethers.getSigners()
    console.log(`📝 use deployer from PRIVATE_KEY in .env`)
    console.log(`signer: ${signer.address}`)
    return signer
  }
}

const impersonateAddress = async (address) => {
  const hre = require('hardhat')
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  })
  const signer = await ethers.provider.getSigner(address)
  signer.address = signer._address
  return signer
}

async function callWithRetries(func, args, retriesCount = 3) {
  let i = 0
  while (true) {
    i++
    try {
      return await func(...args)
    } catch (ex) {
      if (i === retriesCount) {
        console.error('call failed %s times. throwing error', retriesCount)
        throw ex
      }
      console.error('call i=%s failed. retrying....', i)
      console.error(ex.message)
    }
  }
}

async function sendTxn(txnPromise, label) {
  const txn = await txnPromise
  console.info(`Sending ${label}...`)
  await txn.wait()
  console.info(`... Sent! ${txn.hash}`)

  return txn
}

async function deployContract(name, args, label, provider, options, retry = 3) {
  if (!label) {
    label = name
  }
  let contractFactory = await ethers.getContractFactory(name)
  if (provider) {
    contractFactory = contractFactory.connect(provider)
  }

  let contract
  let i = 0
  while (true) {
    try {
      if (options) {
        contract = await contractFactory.deploy(...args, options)
      } else {
        contract = await contractFactory.deploy(...args)
      }
      const argStr = args.map((i) => `"${i}"`).join(' ')
      console.info(`\n[Deploy ${name}] ${label}: ${contract.address} ${argStr}`)
      await contract.deployTransaction.wait()
      console.info('... Completed!')
      break
    } catch (e) {
      console.error(`deploy ${name} error:\n`, e)
    }

    if (i == retry) {
      throw new Error(`cannot deploy ${name}`)
    }
    i++

    console.log(`[${i}/${retry}] retrying deploy...`)
    await sleep(2 * 60 * 1000)
  }

  writeTmpAddresses({
    [label]: contract.address,
  })

  return contract
}

async function contractAt(name, address, provider) {
  let contractFactory = await ethers.getContractFactory(name)
  if (provider) {
    contractFactory = contractFactory.connect(provider)
  }
  return await contractFactory.attach(address)
}

function readTmpAddresses() {
  if (fs.existsSync(tmpAddressesFilepath)) {
    return JSON.parse(fs.readFileSync(tmpAddressesFilepath))
  }
  return {}
}

function writeTmpAddresses(json) {
  const tmpAddresses = Object.assign(readTmpAddresses(), json)
  fs.writeFileSync(tmpAddressesFilepath, JSON.stringify(tmpAddresses))
}

// batchLists is an array of lists
async function processBatch(batchLists, batchSize, handler) {
  let currentBatch = []
  const referenceList = batchLists[0]

  for (let i = 0; i < referenceList.length; i++) {
    const item = []

    for (let j = 0; j < batchLists.length; j++) {
      const list = batchLists[j]
      item.push(list[i])
    }

    currentBatch.push(item)

    if (currentBatch.length === batchSize) {
      console.log('handling currentBatch', i, currentBatch.length, referenceList.length)
      await handler(currentBatch)
      currentBatch = []
    }
  }

  if (currentBatch.length > 0) {
    console.log('handling final batch', currentBatch.length, referenceList.length)
    await handler(currentBatch)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function bigNumberify(n) {
  return ethers.BigNumber.from(n)
}

function expandDecimals(n, decimals) {
  return bigNumberify(n).mul(bigNumberify(10).pow(decimals))
}

function toUsd(value) {
  const normalizedValue = parseInt(value * Math.pow(10, 10))
  return ethers.BigNumber.from(normalizedValue).mul(ethers.BigNumber.from(10).pow(20))
}

module.exports = {
  getContractAddress,
  readCsv,
  getFrameSigner,
  sendTxn,
  deployContract,
  contractAt,
  writeTmpAddresses,
  readTmpAddresses,
  callWithRetries,
  processBatch,
  tokenIndexs,
  sleep,
  expandDecimals,
  toUsd,
}
