require("dotenv").config();
const fs = require("fs");
const path = require("path");
const parse = require("csv-parse");

const network = process.env.HARDHAT_NETWORK || "mainnet";
const tmpAddressesFilepath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  `.tmp-addresses-${process.env.HARDHAT_NETWORK}.json`
);
const deployedAddress = readTmpAddresses();

const tokenIndexs = {
  BTC: 0,
  ETH: 1,
  BNB: 2,
  BUSD: 4,
  USDC: 5,
  MATIC: 21,
  OP: 28,
  ARB: 29,
};

const contactAddress = {
  // address signer
  deployer: "0x11114D88d288c48Ea5dEC180bA5DCC2D137398dF", // signer1
  signer2: "0x666634e72c4948c7CB3F7206D2f731A34e076469", // account2
  signer3: "0x9103c4B112ec249a34aB7AdD9D5589Ca4DF36Aaa", // account3

  // bot
  // updater: "0x5eD93987704b42f297d80ae784AfF17e19646d67",
  keeper: "0x6C56eddb37a8d38f1bDeB33360A7f875eAB75c20",
  liquidator: "0x6C56eddb37a8d38f1bDeB33360A7f875eAB75c20",

  // fees
  feeReceiver: "0x9103c4B112ec249a34aB7AdD9D5589Ca4DF36Aaa", // execute fee
  mintReceiver: "0x9103c4B112ec249a34aB7AdD9D5589Ca4DF36Aaa",

  // token address
  btc: deployedAddress["BTC"],
  eth: deployedAddress["ETH"],
  wbnb: "0x617d91847b74b70a3d3e3745445cb0d1b3c8560e",
  busd: deployedAddress["BUSD"],
  usdc: deployedAddress["USDC"],
  // usdt: deployedAddress["USDT"],
  matic: deployedAddress["MATIC"],
  op: deployedAddress["OP"],
  arb: deployedAddress["ARB"],

  // xOracle price feed
  btcPriceFeed: "0xb376D2fe17CAfc7Fe841E16b897Fe658f1e8De7D",
  ethPriceFeed: "0x1b404D1491e488001A8545b86E58ac8362D0E95C",
  bnbPriceFeed: "0x1296d3a1DE3f7BE8cB1F76C888e51c47915d8001",
  busdPriceFeed: "0xba13123b80d65fC170B30f29918884f212f62Fc5",
  usdcPriceFeed: "0xC7cCDbD2cC787065A5b634A1E532430411A5849a",
  maticPriceFeed: "0xccCd5c5D4e3d2F85d07f041759B96f8b8A622056",
  opPriceFeed: "0x8008ef7228C13e14CB66F7cd08076728bd7538Bd",
  arbPriceFeed: "0x7943EBf07bBf8b0068d708c1997FFB22b15eEB57",

  // deployed contract
  xOracle: "0x8D57F2AcA5a352051eF9d5b8bfEaccE901Df3e33", // update 2023-08-03
  fulfillController: deployedAddress["FulfillController"],
  tokenManager: deployedAddress["TokenManager"],
  vault: deployedAddress["Vault"],
  vaultPositionController: deployedAddress["VaultPositionController"],
  vaultPriceFeed: deployedAddress["VaultPriceFeed"],
  router: deployedAddress["Router"],
  usdg: deployedAddress["USDG"],
  glp: deployedAddress["GLP"],
  glpManager: deployedAddress["GlpManager"],
  referralStorage: deployedAddress["ReferralStorage"],
  positionRouter: deployedAddress["PositionRouter"],
  orderBook: deployedAddress["OrderBook"],
  positionManager: deployedAddress["PositionManager"],
  rewardRouterV2: deployedAddress["RewardRouterV2"],
  timelock: deployedAddress["Timelock"],
  stakedGmxDistributor: deployedAddress["1. stakedGmxDistributor"],
  bonusDistributor: deployedAddress["2. BonusDistributor"],
  feeGmxDistributor: deployedAddress["3. feeGmxDistributor"],
  feeGlpDistributor: deployedAddress["4. feeGlpDistributor"],
  stakedGlpDistributor: deployedAddress["5. stakedGlpDistributor"],
  
};

function getContractAddress(name) {
  const addr = contactAddress[name];
  if (!addr) {
    throw new Error("not found " + name + " address");
  }

  return addr;
}

const readCsv = async (file) => {
  records = [];
  const parser = fs
    .createReadStream(file)
    .pipe(parse({ columns: true, delimiter: "," }));
  parser.on("error", function (err) {
    console.error(err.message);
  });
  for await (const record of parser) {
    records.push(record);
  }
  return records;
};

function getChainId(network) {
  if (network === "opbnbTestnet") {
    return 5611;
  }

  if (network === "bscTestnet") {
    return 97;
  }

  throw new Error("Unsupported network");
}

async function getFrameSigner() {
 if (process.env.USE_FRAME_SIGNER == "true") {
    try {
      const frame = new ethers.providers.JsonRpcProvider("http://127.0.0.1:1248");
      const signer = frame.getSigner();

      if (getChainId(network) !== (await signer.getChainId())) {
        throw new Error("Incorrect frame network");
      }

      console.log("🖼️ FrameSigner ChainId:", await signer.getChainId());
      console.log(`signer: ${signer.address}`);

      return signer;
    } catch (e) {
      throw new Error(`getFrameSigner error: ${e.toString()}`);
    }
 } else {
    const [ signer ] = await hre.ethers.getSigners();
    console.log(`📝 use deployer from PRIVATE_KEY in .env`);
    console.log(`signer: ${signer.address}`);
    return signer;
 }
}

async function sendTxn(txnPromise, label) {
  const txn = await txnPromise;
  console.info(`Sending ${label}...`);
  await txn.wait();
  console.info(`... Sent! ${txn.hash}`);
  return txn;
}

async function callWithRetries(func, args, retriesCount = 3) {
  let i = 0;
  while (true) {
    i++;
    try {
      return await func(...args);
    } catch (ex) {
      if (i === retriesCount) {
        console.error("call failed %s times. throwing error", retriesCount);
        throw ex;
      }
      console.error("call i=%s failed. retrying....", i);
      console.error(ex.message);
    }
  }
}

async function deployContract(name, args, label, provider, options) {
  //let info = name
  //if (label) { info = name + ":" + label }
  if (!label) {
    label = name;
  }
  let contractFactory = await ethers.getContractFactory(name);
  if (provider) {
    contractFactory = contractFactory.connect(provider);
  }

  let contract;
  if (options) {
    contract = await contractFactory.deploy(...args, options);
  } else {
    contract = await contractFactory.deploy(...args);
  }
  const argStr = args.map((i) => `"${i}"`).join(" ");
  console.info(`\n[Deploy ${name}] ${label}: ${contract.address} ${argStr}`);
  await contract.deployTransaction.wait();
  console.info("... Completed!");

  writeTmpAddresses({
    [label]: contract.address,
  });

  return contract;
}

async function contractAt(name, address, provider) {
  let contractFactory = await ethers.getContractFactory(name);
  if (provider) {
    contractFactory = contractFactory.connect(provider);
  }
  return await contractFactory.attach(address);
}

function readTmpAddresses() {
  if (fs.existsSync(tmpAddressesFilepath)) {
    return JSON.parse(fs.readFileSync(tmpAddressesFilepath));
  }
  return {};
}

function writeTmpAddresses(json) {
  const tmpAddresses = Object.assign(readTmpAddresses(), json);
  fs.writeFileSync(tmpAddressesFilepath, JSON.stringify(tmpAddresses));
}

// batchLists is an array of lists
async function processBatch(batchLists, batchSize, handler) {
  let currentBatch = [];
  const referenceList = batchLists[0];

  for (let i = 0; i < referenceList.length; i++) {
    const item = [];

    for (let j = 0; j < batchLists.length; j++) {
      const list = batchLists[j];
      item.push(list[i]);
    }

    currentBatch.push(item);

    if (currentBatch.length === batchSize) {
      console.log(
        "handling currentBatch",
        i,
        currentBatch.length,
        referenceList.length
      );
      await handler(currentBatch);
      currentBatch = [];
    }
  }

  if (currentBatch.length > 0) {
    console.log(
      "handling final batch",
      currentBatch.length,
      referenceList.length
    );
    await handler(currentBatch);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
};
