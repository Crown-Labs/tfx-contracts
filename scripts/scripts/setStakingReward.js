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

  const tokenDecimals = 18;
  const distributorArr = [
    {
      name: "FeeXlpDistributor",
      address: getContractAddress("feeXlpDistributor"),
      transferAmount: "1",
      rewardCName: "MintableBaseToken",  // WETH
      isRewardsPerInterval: true,
      isRewardNativeToken: true,
    },
  ];

  let sumOfShouldWrap = 0;
  for (let j = 0; j < distributorArr.length; j++) {
    if (distributorArr[j].isRewardNativeToken == true) {
      sumOfShouldWrap = sumOfShouldWrap + +distributorArr[j].transferAmount;
    }
  }
  console.log(`sumOfShouldWrap: ${sumOfShouldWrap}`);

  const weth = await contractAt(
    "Token",
    "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", // WETH arb Testnet
    signer
  );

  const wethBalanceBefore = await weth.balanceOf(signerArr);
  console.log("WETH BalanceBefore: ", wethBalanceBefore.toString() / 10 ** 18);

  const depositAmount = await new BigNumber(sumOfShouldWrap).times(new BigNumber(10).pow(18));

  await sendTxn(
    weth.deposit({ value: depositAmount.toString() }),
    `Wrap ETH: ${depositAmount.toString() / 10 ** 18}`
  );

  const wethBalanceAfter = await weth.balanceOf(signerArr);
  console.log("WETH BalanceAfter: ", wethBalanceAfter.toString() / 10 ** 18);
  const provider = signer.provider;
  const balanceAfter = await provider.getBalance(signerArr)
  console.log("ETH balanceAfter", +balanceAfter / 10 ** 18, "\n")

  const wethBalance = await weth.balanceOf(signerArr);

  if (!Number(wethBalance.toString() / 10 ** 18)) {
    throw new Error("No WETH balance!!");
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
      // distributorItem.transferAmount,
      "1", // Adjust APR of XLP
      tokenDecimals
    );

    // const timeInSeconds = 90 * 24 * 60 * 60; // 90 days
    const timeInSeconds = 1 * 24 * 60 * 60; // 30 days

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
        weth.transfer(distributorItem.address, convertedTransferAmount),
        "weth.transfer"
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