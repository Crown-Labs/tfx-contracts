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
    /* opbnbTestnet
    eth: deployedAddress["ETH"],
    wbnb: "0x617d91847b74b70a3d3e3745445cb0d1b3c8560e",*/
    // lineaTestnet
    weth: "0x2C1b868d6596a18e32E61B901E4060C872647b6C",
    bnb: deployedAddress["BNB"],
    busd: deployedAddress["BUSD"],
    usdc: deployedAddress["USDC"],
    // usdt: deployedAddress["USDT"],
    matic: deployedAddress["MATIC"],
    op: deployedAddress["OP"],
    arb: deployedAddress["ARB"],
  
    // xOracle price feed
    btcPriceFeed: "0x3432dD444774c4A88D330EdB127D837072e5cc9e",
    ethPriceFeed: "0xe767d64F9b37fe809232a7f20304d28F03EED2B1",
    bnbPriceFeed: "0x0c8b54e305E8CBb9958671a9C02467328EF4c95C",
    busdPriceFeed: "0x4926B8803db627a3a77687cB9160725c0845Aabb",
    usdcPriceFeed: "0xA23902465EC47904b4b53dCD95f2395b45F33E4F",
    maticPriceFeed: "0xE41CEc959C332968226B2a07f6252Bc57964de1d",
    opPriceFeed: "0x81E12991821d0bFdFC7D1a79D49056bcFa0Eaf75",
    arbPriceFeed: "0x9b5C82a57AcF5569e10fe1f1783ab57230B18ab9",
  
    // deployed contract
    xOracle: "0xB1CBd1d5A394E6B4BDaA687468266Caf533D9035", // update 2023-09-13
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
    rewardTracker: deployedAddress["5. fsGLP (Fee + Staked GLP)"],
    
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

  if (network === "lineaTestnet") {
    return 59140;
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
