const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv").config();
const { exec } = require("child_process");
const { expandDecimals } = require("../../test/shared/utilities");
const { getContractAddress } = require("./shared/helpers");
const network = process.env.HARDHAT_NETWORK || "mainnet";
const tokens = require("./core/tokens")[network];

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
    usdg: { address: deployedAddress["USDG"] },
    nativeToken: { address: tokens.nativeToken.address },
    glp: { address: deployedAddress["GLP"] },
    router: { address: deployedAddress["Router"] },
    weth: { address: tokens.nativeToken.address },
    orderBook: { address: deployedAddress["OrderBook"] },
    esGmx: { address: deployedAddress["esGmx"] },
    stakedGmxTracker: { address: deployedAddress["1. sGMX (Staked GMX)"] },
    bnGmx: { address: deployedAddress["bnGmx"] },
    bonusGmxTracker: {
      address: deployedAddress["2. sbGMX (Staked + Bonus GMX)"],
    },
    feeGmxTracker: {
      address: deployedAddress["3. sbfGMX (Staked + Bonus + Fee GMX)"],
    },
    feeGlpTracker: { address: deployedAddress["4. fGLP (Fee GLP)"] },
    stakedGlpTracker: {
      address: deployedAddress["5. fsGLP (Fee + Staked GLP)"],
    },
    gmx: { address: deployedAddress["GMX"] },
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
  } else if (name == "USDG") {
    const { vault } = getContract();
    param = [vault.address];
  } else if (name == "Router") {
    const { vault, vaultPositionController, usdg, nativeToken } = getContract();
    param = [
      vault.address,
      vaultPositionController.address,
      usdg.address,
      nativeToken.address,
    ];
  } else if (name == "GlpManager") {
    const { vault, usdg, glp } = getContract();
    param = [vault.address, usdg.address, glp.address, 15 * 60];
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
  } else if (name == "bnGmx") {
    param = ["Bonus GMX", "bnGMX", 0];
  } else if (name == "1. sGMX (Staked GMX)") {
    param = ["Staked GMX", "sGMX"];
  } else if (name == "1. stakedGmxDistributor") {
    const { esGmx, stakedGmxTracker } = getContract();
    param = [esGmx.address, stakedGmxTracker.address];
  } else if (name == "2. sbGMX (Staked + Bonus GMX)") {
    param = ["Staked + Bonus GMX", "sbGMX"];
  } else if (name == "2. BonusDistributor") {
    const { bnGmx, bonusGmxTracker } = getContract();
    param = [bnGmx.address, bonusGmxTracker.address];
  } else if (name == "3. sbfGMX (Staked + Bonus + Fee GMX)") {
    param = ["Staked + Bonus + Fee GMX", "sbfGMX"];
  } else if (name == "3. feeGmxDistributor") {
    const { nativeToken, feeGmxTracker } = getContract();
    param = [nativeToken.address, feeGmxTracker.address];
  } else if (name == "4. fGLP (Fee GLP)") {
    param = ["Fee GLP", "fGLP"];
  } else if (name == "4. feeGlpDistributor") {
    const { nativeToken, feeGlpTracker } = getContract();
    param = [nativeToken.address, feeGlpTracker.address];
  } else if (name == "5. fsGLP (Fee + Staked GLP)") {
    param = ["Fee + Staked GLP", "fsGLP"];
  } else if (name == "5. stakedGlpDistributor") {
    const { esGmx, stakedGlpTracker } = getContract();
    param = [esGmx.address, stakedGlpTracker.address];
  } else if (name == "vestedGMX") {
    const vestingDuration = 365 * 24 * 60 * 60;
    const { esGmx, feeGmxTracker, gmx, stakedGmxTracker } = getContract();
    param = [
      "Vested GMX", // _name
      "vGMX", // _symbol
      vestingDuration, // _vestingDuration
      esGmx.address, // _esToken
      feeGmxTracker.address, // _pairToken
      gmx.address, // _claimableToken
      stakedGmxTracker.address, // _rewardTracker
    ];
  } else if (name == "vestedGLP") {
    const vestingDuration = 365 * 24 * 60 * 60;
    const { esGmx, stakedGlpTracker, gmx } = getContract();
    param = [
      "Vested GLP", // _name
      "vGLP", // _symbol
      vestingDuration, // _vestingDuration
      esGmx.address, // _esToken
      stakedGlpTracker.address, // _pairToken
      gmx.address, // _claimableToken
      stakedGlpTracker.address, // _rewardTracker
    ];
  } else if (name == "FulfillController") {
    const { xOracle, weth } = getContract();
    param = [xOracle.address, weth.address];
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
  const contractName = Object.keys(deployedAddress);
  const contractAddress = Object.values(deployedAddress);
  // recursive verify
  const start = 0;
  verify(start, contractName, contractAddress);

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
