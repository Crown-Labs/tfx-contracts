const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { getContractAddress, expandDecimals } = require("../shared/helpers");
const network = process.env.HARDHAT_NETWORK || "mainnet";
const tokens = require("../shared/tokens")[network];

const tmpAddressesFilepath = path.join(
  __dirname,
  "..",
  "..",
  `.tmp-addresses-${process.env.HARDHAT_NETWORK}.json`
);
const deployedAddress = readTmpAddresses();
var isDone = false;
var errors = [];

function readTmpAddresses() {
  if (fs.existsSync(tmpAddressesFilepath)) {
    return JSON.parse(fs.readFileSync(tmpAddressesFilepath));
  }
  return {};
}

function getContract() {
  return {
    vault: { address: deployedAddress["Vault"] },
    vaultPositionController: {
      address: deployedAddress["VaultPositionController"],
    },
    usdx: { address: deployedAddress["USDX"] },
    nativeToken: { address: tokens.nativeToken.address },
    xlp: { address: deployedAddress["XLP"] },
    router: { address: deployedAddress["Router"] },
    weth: { address: tokens.nativeToken.address },
    orderBook: { address: deployedAddress["OrderBook"] },
    feeXlpTracker: { address: deployedAddress["fXLP (Fee XLP)"] },
    xOracle: { address: getContractAddress("xOracle") },
    vaultPriceFeed: { address: deployedAddress["VaultPriceFeed"] },
    tokenManager: { address: deployedAddress["TokenManager"] },
    deployer: { address: getContractAddress("deployer") },
    mintReceiver: { address: getContractAddress("mintReceiver") },
  };
}

function makeParameter(name) {
  var param = [];
  if (name == "BTC") {
    param = ["Bitcoin", "BTC", 18, expandDecimals(1000, 18)];
  } else if (name == "ETH") {
    param = ["Ethereum", "ETH", 18, expandDecimals(1000, 18)];
  } else if (name == "USDC") {
    param = ["USDC Coin", "USDC", 18, expandDecimals(1000, 18)];
  } else if (name == "USDT") {
    param = ["Tether", "USDT", 18, expandDecimals(1000, 18)];
  } else if (name == "BUSD") {
    param = ["Binance USD", "BUSD", 18, expandDecimals(1000, 18)];
  } else if (name == "TokenManager") {
    param = [2];
  } else if (name == "USDX") {
    const { vault } = getContract();
    param = [vault.address];
  } else if (name == "Router") {
    const { vault, vaultPositionController, usdx, nativeToken } = getContract();
    param = [
      vault.address,
      vaultPositionController.address,
      usdx.address,
      nativeToken.address,
    ];
  } else if (name == "XlpManager") {
    const { vault, usdx, xlp } = getContract();
    param = [vault.address, usdx.address, xlp.address, 15 * 60];
  } else if (name == "PositionRouter") {
    const depositFee = "30"; // 0.3%
    const minExecutionFee = "300000000000000"; // 0.0003 ETH
    const { vault, vaultPositionController, router, weth } = getContract();
    param = [
      vault.address,
      vaultPositionController.address,
      router.address,
      weth.address,
      depositFee,
      minExecutionFee,
    ];
  } else if (name == "PositionManager") {
    const depositFee = 30; // 0.3%
    const { vault, vaultPositionController, router, weth, orderBook } =
      getContract();
    param = [
      vault.address,
      vaultPositionController.address,
      router.address,
      weth.address,
      depositFee,
      orderBook.address,
    ];
  } else if (name == "fXLP (Fee XLP)") {
    param = ["Fee XLP", "fXLP"];
  } else if (name == "feeXlpDistributor") {
    const { nativeToken, feeXlpTracker } = getContract();
    param = [nativeToken.address, feeXlpTracker.address];
  } else if (name == "FulfillController") {
    const { xOracle, weth } = getContract();
    const lastTaskId = 0;
    param = [xOracle.address, weth.address, lastTaskId];
  } else if (name == "OrderBookOpenOrder") {
    const { orderBook, vaultPositionController } = getContract();
    param = [orderBook.address, vaultPositionController.address];
  } else if (name == "Timelock") {
    const buffer = 5 * 60; //24 * 60 * 60
    const rewardManager = { address: ethers.constants.AddressZero };
    const maxTokenSupply = expandDecimals("1000000", 18);
    const { tokenManager, deployer, mintReceiver } = getContract();
    param = [
      deployer.address,
      buffer,
      rewardManager.address,
      tokenManager.address,
      mintReceiver.address,
      maxTokenSupply,
      10, // marginFeeBasisPoints 0.1%
      100, // maxMarginFeeBasisPoints 1%
    ];
  }

  if (param.length != 0) {
    return '"' + param.join('" "') + '"';
  }
  return "";
}

function verify(i, contractName, contractAddress) {
  const length = contractName.length;
  if (i == length) {
    isDone = true;
    return;
  }

  const name = contractName[i];
  const address = contractAddress[i];

  const params = makeParameter(name);
  const cmd = `npx hardhat verify ${address} ${params} --network ${network}`;
  console.log(`🚀 [${i + 1}/${length} ${name}] ${cmd}`);

  exec(cmd, (error, stdout, stderr) => {
    if (stdout.indexOf("Successfully submitted") != -1) {
      console.log(`✅ verified: ${stdout}`);
    } else {
      if (error || stderr) {
        const errMsg = error ? error.message : stderr ? stderr : "";
        if (errMsg.indexOf("Smart-contract already verified.") == -1) {
          console.log(`❌ error: ${errMsg}`);
          errors.push(
            `[${contractName[i]} - ${contractAddress[i]}]: ${errMsg}`
          );
        } else {
          console.log(`✅ skip verified: ${errMsg}`);
        }
      }
      console.log(`${stdout}`);
    }

    // recursive
    verify(i + 1, contractName, contractAddress);
  });
}

async function main() {
  const findContractName = "";
  // const findContractName = "FulfillController";

  const contractName = Object.keys(deployedAddress);
  const contractAddress = Object.values(deployedAddress);

  if (findContractName == "") {
    // recursive verify
    const start = 0;
    verify(start, contractName, contractAddress);
  } else {
    // find contract
    for (let i = 0; i < contractName.length; i++) {
      if (contractName[i] == findContractName) {
        verify(0, [ contractName[i] ], [ contractAddress[i] ]);
        break;
      }
    }
  }

  // wait for all done
  while (!isDone) {
    await sleep(1000);
  }

  console.log(`🌈 Done.`);
  if (errors.length > 0) {
    console.log(`❌ verify error: ${errors.length}`);
    errors.map((err) => console.log(err));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
