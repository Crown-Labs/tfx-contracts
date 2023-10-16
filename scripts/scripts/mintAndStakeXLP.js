const { contractAt, sendTxn, getContractAddress, getFrameSigner, expandDecimals } = require("../shared/helpers")

async function main() {

  const signer = await getFrameSigner()

  //token
  const btc = await contractAt("FaucetToken", getContractAddress("btc"), signer)
  const bnb = await contractAt("FaucetToken", getContractAddress("bnb"), signer)
  const usdt = await contractAt("FaucetToken", getContractAddress("usdt"), signer)
  const usdc = await contractAt("FaucetToken", getContractAddress("usdc"), signer)
  const matic = await contractAt("FaucetToken", getContractAddress("matic"), signer)
  const op = await contractAt("FaucetToken", getContractAddress("op"), signer)
  const arb = await contractAt("FaucetToken", getContractAddress("arb"), signer)

  const rewardRouterV3 = await contractAt("RewardRouterV3", getContractAddress("rewardRouterV3"), signer)
  console.log("rewardRouterV3.address: ", rewardRouterV3.address);
  
  await sendTxn(btc.connect(signer).approve(rewardRouterV3.address, expandDecimals(60, 18)),"Approve BTC"); // BTC Price $26000
  await sendTxn(rewardRouterV3.mintAndStakeXlp(btc.address, expandDecimals(60, 18), 0, 0),"Mint and Stake Xlp by BTC");

  await sendTxn(bnb.connect(signer).approve(rewardRouterV3.address, expandDecimals(4800, 18)),"Approve BNB"); // BNB Price $210
  await sendTxn(rewardRouterV3.mintAndStakeXlp(bnb.address, expandDecimals(4800, 18), 0, 0),"Mint and Stake Xlp by BNB");

  await sendTxn(usdt.connect(signer).approve(rewardRouterV3.address, expandDecimals(3500000, 18)),"Approve USDT");
  await sendTxn(rewardRouterV3.mintAndStakeXlp(usdt.address, expandDecimals(3500000, 18), 0, "0"),"Mint and Stake Xlp by USDT");

  await sendTxn(usdc.connect(signer).approve(rewardRouterV3.address, expandDecimals(1500000, 18)),"Approve USDC");
  await sendTxn(rewardRouterV3.mintAndStakeXlp(usdc.address, expandDecimals(1500000, 18), 0, 0),"Mint and Stake Xlp by USDC");

  await sendTxn(matic.connect(signer).approve(rewardRouterV3.address, expandDecimals(950000, 18)),"Approve MATIC"); // MATIC Price $0.526
  await sendTxn(rewardRouterV3.mintAndStakeXlp(matic.address, expandDecimals(950000, 18), 0, 0),"Mint and Stake Xlp by MATIC");

  await sendTxn(op.connect(signer).approve(rewardRouterV3.address, expandDecimals(406000, 18)),"Approve OP"); // OP Price $1.23
  await sendTxn(rewardRouterV3.mintAndStakeXlp(op.address, expandDecimals(406000, 18), 0, 0),"Mint and Stake Xlp by OP");
  
  await sendTxn(arb.connect(signer).approve(rewardRouterV3.address, expandDecimals(625000, 18)),"Approve ARB"); //ARB Price $0.8
  await sendTxn(rewardRouterV3.mintAndStakeXlp(arb.address, expandDecimals(625000, 18), 0, 0),"Mint and Stake Xlp by ARB");
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
