const fs = require("fs");
const path = require("path");
const parse = require("csv-parse");

const network = process.env.HARDHAT_NETWORK || "mainnet";
const tmpAddressesFilepath = path.join(
  __dirname,
  "..",
  "..",
  `.tmp-addresses-${process.env.HARDHAT_NETWORK}.json`
);
const deployedAddress = readTmpAddresses();

const contactAddress = {
  // address signer
  deployer: "0x11114D88d288c48Ea5dEC180bA5DCC2D137398dF", // signer1
  signer2: "0xceE8B143eBE02dFa69c508aaE715B5C06e976684", // account2
  signer3: "0x8d83aC8D2cd20bCB74a376aBcc20ffaE4Cab89D9", // account3

  // bot
  updater: "0x5eD93987704b42f297d80ae784AfF17e19646d67",
  keeper: "0x5eD93987704b42f297d80ae784AfF17e19646d67",
  liquidator: "0x5eD93987704b42f297d80ae784AfF17e19646d67",

  // fees
  feeReceiver: "0xceE8B143eBE02dFa69c508aaE715B5C06e976684", // execute fee
  mintReceiver: "0xceE8B143eBE02dFa69c508aaE715B5C06e976684",

  // deployed contract
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
  fastPriceFeed: deployedAddress["FastPriceFeed"],
  timelock: deployedAddress["Timelock"],
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
  if (network === "arbitrum") {
    return 42161;
  }

  if (network === "avax") {
    return 43114;
  }

  if (network === "testnet") {
    return 97;
  }

  if (network === "lineaTestnet") {
    return 59140;
  }

  throw new Error("Unsupported network");
}

async function getFrameSigner() {
  try {
    const frame = new ethers.providers.JsonRpcProvider("http://127.0.0.1:1248");
    const signer = frame.getSigner();
    if (getChainId(network) !== (await signer.getChainId())) {
      throw new Error("Incorrect frame network");
    }

    console.log("FrameSigner ChainId:", await signer.getChainId());

    return signer;
  } catch (e) {
    throw new Error(`getFrameSigner error: ${e.toString()}`);
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
};
