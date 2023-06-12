const {
  contractAt,
  sendTxn,
  getFrameSigner,
  getContractAddress
} = require("../shared/helpers");
const BigNumber = require('bignumber.js');

// const impersonateAddress = async (address) => {
//   const hre = require('hardhat');
//   await hre.network.provider.request({
//       method: 'hardhat_impersonateAccount',
//       params: [address],
//   });
//   const signer = await ethers.provider.getSigner(address);
//   signer.address = signer._address;
//   return signer;
// };  

async function main() {
  const signer = await getFrameSigner();
  const signerArr = await signer.address;

  console.log(`signerArr: ${signerArr}`)

  const provider = signer.provider

  // // impersonate and steal fund
  // const signer = await impersonateAddress("0x11114D88d288c48Ea5dEC180bA5DCC2D137398dF"); 
  // const signerArr = await signer.getAddress();
  
  const balance = await provider.getBalance(signerArr)
  
  console.log(`\n ======= BNB / WBNB Balance =======`);
  console.log("BNB balanceBefore",+balance / 10 ** 18)

  const tokenDecimals = 18;
  const distributorArr = [
    // {
    //   name: "StakedGmxDistributor",
    //   address: getContractAddress("stakedGmxDistributor"),
    //   transferAmount: "0", // 1000
    //   rewardCName: "EsGMX",  // EsGMX
    //   isRewardsPerInterval: true,
    //   isRewardNativeToken: false,
    // },
    // {
    //   name: "BonusDistributor",
    //   address: getContractAddress("bonusDistributor"),
    //   transferAmount: "0", // 1000
    //   rewardCName: "MintableBaseToken",  // bnGMX
    //   isRewardsPerInterval: false,
    //   isRewardNativeToken: false,
    // },
    // {
    //   name: "FeeGmxDistributor",
    //   address: getContractAddress("feeGmxDistributor"),
    //   transferAmount: "0.1", // 20
    //   rewardCName: "MintableBaseToken",  // WXORD
    //   isRewardsPerInterval: true,
    //   isRewardNativeToken: true,
    // },
    {
      name: "FeeGlpDistributor",
      address: getContractAddress("feeGlpDistributor"),
      transferAmount: "3", // 20
      rewardCName: "MintableBaseToken",  // WXORD
      isRewardsPerInterval: true,
      isRewardNativeToken: true,
    },
    // {
    //   name: "StakedGlpDistributor",
    //   address: getContractAddress("stakedGlpDistributor"),
    //   transferAmount: "0", // 1000
    //   rewardCName: "MintableBaseToken",  // EsGMX
    //   isRewardsPerInterval: true,
    //   isRewardNativeToken: false,
    // },
  ];

  let sumOfShouldWrap = 0;
  for (let j = 0; j < distributorArr.length; j++){
    if (distributorArr[j].isRewardNativeToken == true){
      sumOfShouldWrap = sumOfShouldWrap + +distributorArr[j].transferAmount;
    }
  }
  console.log(`sumOfShouldWrap: ${sumOfShouldWrap}`);

  const wbnb = await contractAt(
    "Token",
    "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", //wBNB bsctestnet
    signer
  );

  const wbnbBalanceBefore = await wbnb.balanceOf(signerArr);
  console.log("WBNB BalanceBefore: ", wbnbBalanceBefore.toString() / 10 ** 18);

  const depositAmount = await new BigNumber(sumOfShouldWrap).times(new BigNumber(10).pow(18));

  await sendTxn(
    wbnb.deposit({value: depositAmount.toString()}),
    `Wrap BNB: ${depositAmount.toString() / 10 ** 18}`
  );

  const wbnbBalanceAfter = await wbnb.balanceOf(signerArr);
  console.log("WBNB BalanceAfter: ", wbnbBalanceAfter.toString() / 10 ** 18);

  const balanceAfter = await provider.getBalance(signerArr)
  console.log("BNB balanceAfter",+balanceAfter / 10 ** 18,"\n")



const wbnbBalance = await wbnb.balanceOf(signerArr);

if (!Number(wbnbBalance.toString() / 10 ** 18)) {
  throw new Error("No WBNB balance!!");
}

  for (let i = 0; i < distributorArr.length; i++) {
    const distributorItem = distributorArr[i];

    console.log(`======= ${distributorItem.name} =======`);

    const distributor = await contractAt(
      "RewardDistributor",
      distributorItem.address, 
      signer
    );
    const rewardArr = await distributor.rewardToken();
    const reward = await contractAt(distributorItem.rewardCName, rewardArr, signer);
    const convertedTransferAmount = ethers.utils.parseUnits(
      distributorItem.transferAmount,
      tokenDecimals
    );

    const timeInSeconds = 1 * 24 * 60 * 60; // 90 days

    const rewardsPerInterval = convertedTransferAmount.div(timeInSeconds);
    //  token per second (66 days)
    //  token per second (90 days)

    await sendTxn(
      distributor.updateLastDistributionTime(),
      `${distributorItem.rewardCName}.updateLastDistributionTime`
    );

    // if (!distributorItem.isRewardNativeToken) {
    //   await sendTxn(
    //     reward.setMinter(signerArr, true),
    //     `${distributorItem.rewardCName}.setMinter to ${signerArr}`
    //   );
    //   await sendTxn(
    //     reward.mint(distributorItem.address, convertedTransferAmount),
    //     `${distributorItem.rewardCName}.mint to ${distributorItem.address}`
    //   );
    // }
    if (distributorItem.isRewardNativeToken) {
      await sendTxn(
        wbnb.transfer(distributorItem.address, convertedTransferAmount),
        "wbnb.transfer"
      );
    }
    if (distributorItem.isRewardsPerInterval) {
      console.log("rewardsPerInterval: ", +rewardsPerInterval)
      await sendTxn(
        distributor.setTokensPerInterval(rewardsPerInterval, { gasLimit: 5000000 }),
        "rewardDistributor.setTokensPerInterval"
      );
    }

  }
  for (let k = 0; k < distributorArr.length; k++) {
    const distributorItem = distributorArr[k];

    console.log(`======= ${distributorItem.name} =======`);

    const distributor = await contractAt(
      "RewardDistributor",
      distributorItem.address, 
      signer
    );
    const rewardArr = await distributor.rewardToken(); // get reward address
    const reward = await contractAt(distributorItem.rewardCName, rewardArr, signer);

    const balanceOf = await reward.balanceOf(distributorItem.address)
    console.log(`balanceOfReward ${distributorItem.name} = ${balanceOf / 10 ** 18}\n`)

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
