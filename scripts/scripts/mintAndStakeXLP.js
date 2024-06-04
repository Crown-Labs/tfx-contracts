const { contractAt, sendTxn, getContractAddress, getFrameSigner, expandDecimals } = require("../shared/helpers")

async function main() {

  const signer = await getFrameSigner()

  //token
  const btc = await contractAt("FaucetToken", getContractAddress("btc"), signer)
  const usdt = await contractAt("FaucetToken", getContractAddress("usdt"), signer)
  const usdc = await contractAt("FaucetToken", getContractAddress("usdc"), signer)
  const sol = await contractAt("FaucetToken", getContractAddress("sol"), signer)
  const op = await contractAt("FaucetToken", getContractAddress("op"), signer)
  const arb = await contractAt("FaucetToken", getContractAddress("arb"), signer)

  const rewardRouterV3 = await contractAt("RewardRouterV3", getContractAddress("rewardRouterV3"), signer)
  console.log("rewardRouterV3.address: ", rewardRouterV3.address);
  
  await sendTxn(btc.connect(signer).approve(rewardRouterV3.address, expandDecimals(21, 18)),"Approve BTC"); // BTC Price $69162
  await sendTxn(rewardRouterV3.mintAndStakeXlp(btc.address, expandDecimals(21, 18), 0, 0),"Mint and Stake Xlp by BTC");

  await sendTxn(usdt.connect(signer).approve(rewardRouterV3.address, expandDecimals(1500000, 18)),"Approve USDT");
  await sendTxn(rewardRouterV3.mintAndStakeXlp(usdt.address, expandDecimals(1500000, 18), 0, "0"),"Mint and Stake Xlp by USDT");

  await sendTxn(usdc.connect(signer).approve(rewardRouterV3.address, expandDecimals(3500000, 18)),"Approve USDC");
  await sendTxn(rewardRouterV3.mintAndStakeXlp(usdc.address, expandDecimals(3500000, 18), 0, 0),"Mint and Stake Xlp by USDC");

  await sendTxn(sol.connect(signer).approve(rewardRouterV3.address, expandDecimals(6000, 18)),"Approve SOL"); // SOL Price $166.77
  await sendTxn(rewardRouterV3.mintAndStakeXlp(sol.address, expandDecimals(6000, 18), 0, 0),"Mint and Stake Xlp by SOL");

  await sendTxn(op.connect(signer).approve(rewardRouterV3.address, expandDecimals(207500, 18)),"Approve OP"); // OP Price $2.41
  await sendTxn(rewardRouterV3.mintAndStakeXlp(op.address, expandDecimals(207500, 18), 0, 0),"Mint and Stake Xlp by OP");
  
  await sendTxn(arb.connect(signer).approve(rewardRouterV3.address, expandDecimals(902500, 18)),"Approve ARB"); //ARB Price $1.108
  await sendTxn(rewardRouterV3.mintAndStakeXlp(arb.address, expandDecimals(902500, 18), 0, 0),"Mint and Stake Xlp by ARB");
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
