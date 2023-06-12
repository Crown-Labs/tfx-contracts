const {
  deployContract,
  contractAt,
  sendTxn,
  writeTmpAddresses,
  getFrameSigner,
  getContractAddress,
} = require("../shared/helpers");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv").config();

const network = process.env.HARDHAT_NETWORK || "mainnet";
const tokens = require("../core/tokens")[network];

async function main() {
  const signer = await getFrameSigner();
  const signerArr = await signer.getAddress();

  const tokenDecimals = 18;
  const distributorArr = [
    {
      name: "StakedGmxDistributor",
      address: "0x7c526824ED1e454dD850ada4D40CB65f39CeAec5",
      transferAmount: "1000",
      rewardCName: "EsGMX",
      isRewardsPerInterval: true,
      isRewardNativeToken: false,
    },
    {
      name: "BonusDistributor",
      address: "0xfbB33dCC835B82B68673e3AC24AbE4C5eDa12795",
      transferAmount: "1000",
      rewardCName: "MintableBaseToken",
      isRewardsPerInterval: false,
      isRewardNativeToken: false,
    },
    {
      name: "FeeGmxDistributor",
      address: "0x9C45133555192F0e9095e1bAc9Be518dC3031B4e",
      transferAmount: "20",
      rewardCName: "MintableBaseToken",
      isRewardsPerInterval: true,
      isRewardNativeToken: true,
    },
    {
      name: "FeeGlpDistributor",
      address: "0x7256F4E1458B16937DC12eBFE3442b7C809e50Fb",
      transferAmount: "20",
      rewardCName: "MintableBaseToken",
      isRewardsPerInterval: true,
      isRewardNativeToken: true,
    },
    {
      name: "StakedGlpDistributor",
      address: "0xE3Ac64Bf773a85b5Bb7eAD004f8Ce768c6980FF8",
      transferAmount: "1000",
      rewardCName: "MintableBaseToken",
      isRewardsPerInterval: true,
      isRewardNativeToken: false,
    },
  ];

  const wbnb = await contractAt(
    "Token",
    "0x174D69aB029284E13BB65Caeff0b6722F9707512"
  );

  const wbnbBalance = await wbnb.balanceOf(signerArr);
  if (!Number(wbnbBalance)) {
    throw new Error("No WBNB balance!!");
  }

  for (let i = 0; i < distributorArr.length; i++) {
    const distributorItem = distributorArr[i];

    console.log(`======= ${distributorItem.name} =======`);

    const distributor = await contractAt(
      "RewardDistributor",
      distributorItem.address
    );
    const rewardArr = await distributor.rewardToken();
    const reward = await contractAt(distributorItem.rewardCName, rewardArr);
    const convertedTransferAmount = ethers.utils.parseUnits(
      distributorItem.transferAmount,
      tokenDecimals
    );

    // 66 Days calculated
    const rewardsPerInterval = convertedTransferAmount.div(66 * 24 * 60 * 60);
    // 11574074074074 token per day

    await sendTxn(
      distributor.updateLastDistributionTime(),
      `${distributorItem.rewardCName}.updateLastDistributionTime`
    );

    if (!distributorItem.isRewardNativeToken) {
      await sendTxn(
        reward.setMinter(signerArr, true),
        `${distributorItem.rewardCName}.setMinter to ${signerArr}`
      );
      await sendTxn(
        reward.mint(distributorItem.address, convertedTransferAmount),
        `${distributorItem.rewardCName}.mint to ${signerArr}`
      );
    }

    if (distributorItem.isRewardNativeToken) {
      await sendTxn(
        wbnb.transfer(distributorItem.address, convertedTransferAmount),
        "wbnb.transfer"
      );
    }

    if (distributorItem.isRewardsPerInterval) {
      await sendTxn(
        distributor.setTokensPerInterval(rewardsPerInterval),
        "rewardDistributor.setTokensPerInterval"
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// const network = process.env.HARDHAT_NETWORK || "mainnet";

// async function getArbValues(signer) {
//   const rewardToken = await contractAt(
//     "Token",
//     "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
//     signer
//   );
//   const tokenDecimals = 18;

//   const rewardTrackerArr = [
//     {
//       name: "feeGmxTracker",
//       address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F",
//       transferAmount: "197",
//     },
//     {
//       name: "feeGlpTracker",
//       address: "0x4e971a87900b931fF39d1Aad67697F49835400b6",
//       transferAmount: "173",
//     },
//   ];

//   return { rewardToken, tokenDecimals, rewardTrackerArr };
// }

// async function getTestnetValues(signer) {
//   const rewardToken = await contractAt(
//     "Token",
//     "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
//     signer
//   );
//   const tokenDecimals = 18;

//   const rewardTrackerArr = [
//     {
//       name: "feeGmxTracker",
//       address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F",
//       transferAmount: "197",
//     },
//     {
//       name: "feeGlpTracker",
//       address: "0x4e971a87900b931fF39d1Aad67697F49835400b6",
//       transferAmount: "173",
//     },
//   ];

//   return { rewardToken, tokenDecimals, rewardTrackerArr };
// }

// async function getAvaxValues(signer) {
//   const rewardToken = await contractAt(
//     "Token",
//     "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
//     signer
//   );
//   const tokenDecimals = 18;

//   const rewardTrackerArr = [
//     {
//       name: "feeGmxTracker",
//       address: "0x4d268a7d4C16ceB5a606c173Bd974984343fea13",
//       transferAmount: "962",
//     },
//     {
//       name: "feeGlpTracker",
//       address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F",
//       transferAmount: "23130",
//     },
//   ];

//   return { rewardToken, tokenDecimals, rewardTrackerArr };
// }

// function getValues(signer) {
//   if (network === "testnet") {
//     return getTestnetValues(signer);
//   }
// }

// async function main() {
//   const signer = await getFrameSigner();
//   const { rewardToken, tokenDecimals, rewardTrackerArr } = await getValues(
//     signer
//   );

//   for (let i = 0; i < rewardTrackerArr.length; i++) {
//     const rewardTrackerItem = rewardTrackerArr[i];
//     const { transferAmount } = rewardTrackerItem;
//     const rewardTracker = await contractAt(
//       "RewardTracker",
//       rewardTrackerItem.address
//     );
//     const rewardDistributorAddress = await rewardTracker.distributor();
//     const rewardDistributor = await contractAt(
//       "RewardDistributor",
//       rewardDistributorAddress
//     );
//     const convertedTransferAmount = ethers.utils.parseUnits(
//       transferAmount,
//       tokenDecimals
//     );
//     const rewardsPerInterval = convertedTransferAmount.div(7 * 24 * 60 * 60);
//     console.log("rewardDistributorAddress", rewardDistributorAddress);
//     console.log("convertedTransferAmount", convertedTransferAmount.toString());
//     console.log("rewardsPerInterval", rewardsPerInterval.toString());

//     await sendTxn(
//       rewardToken.transfer(rewardDistributorAddress, convertedTransferAmount),
//       `rewardToken.transfer ${i}`
//     );
//     await sendTxn(
//       rewardDistributor.setTokensPerInterval(rewardsPerInterval),
//       "rewardDistributor.setTokensPerInterval"
//     );
//   }
// }

// async function main1() {
//   const signer = await getFrameSigner();

//   const tokenDecimals = 18;
//   const distributorArr = [
//     {
//       name: "stakedGmxDistributor",
//       address: "0x8b44fDFA59A612f0dC3e8Fb534F4dFBbd90AED0C",
//       transferAmount: "1234",
//       rewardCName: "EsGMX",
//     },
//   ];

//   // for (let i = 0; i < distributorArr.length; i++) {
//   //   const distributorItem = distributorArr[i];
//   //   const distributor = await contractAt(
//   //     "RewardDistributor",
//   //     distributorItem.address
//   //   );
//   //   const rewardArr = await distributor.rewardToken();

//   //   const reward = await contractAt(distributorItem[rewardCName], rewardArr);
//   //   const convertedTransferAmount = ethers.utils.parseUnits(
//   //     transferAmount,
//   //     tokenDecimals
//   //   );

//   //   await sendTxn(
//   //     reward.setMinter(signer.address, true),
//   //     `${distributorItem[rewardCName]}.setMinter`
//   //   );
//   //   await sendTxn(
//   //     reward.mint(distributorItem.address, convertedTransferAmount),
//   //     `${distributorItem[rewardCName]}.mint`
//   //   );
//   // }
// }

// main1()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
