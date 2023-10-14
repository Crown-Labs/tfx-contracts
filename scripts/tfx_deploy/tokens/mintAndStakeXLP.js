const { contractAt, sendTxn, getContractAddress, getFrameSigner, expandDecimals } = require("../shared/helpers")

async function main() {

  const signer = await getFrameSigner()

  //token
  const btc = await contractAt("FaucetToken", getContractAddress("btc"), signer)
  const bnb = await contractAt("FaucetToken", getContractAddress("bnb"), signer)
  const busd = await contractAt("FaucetToken", getContractAddress("busd"), signer)
  const usdc = await contractAt("FaucetToken", getContractAddress("usdc"), signer)
  const matic = await contractAt("FaucetToken", getContractAddress("matic"), signer)
  const op = await contractAt("FaucetToken", getContractAddress("op"), signer)
  const arb = await contractAt("FaucetToken", getContractAddress("arb"), signer)

  const rewardRouterV2 = await contractAt("RewardRouterV3", getContractAddress("rewardRouterV2"), signer)
  console.log("rewardRouterV2.address: ", rewardRouterV2.address);
  
  await sendTxn(btc.connect(signer).approve(rewardRouterV2.address, expandDecimals(60, 18)),"Approve BTC"); // BTC Price $26000
  await sendTxn(rewardRouterV2.mintAndStakeXlp(btc.address, expandDecimals(60, 18), 0, 0),"Mint and Stake Xlp by BTC");

  await sendTxn(bnb.connect(signer).approve(rewardRouterV2.address, expandDecimals(4800, 18)),"Approve BNB"); // BNB Price $210
  await sendTxn(rewardRouterV2.mintAndStakeXlp(bnb.address, expandDecimals(4800, 18), 0, 0),"Mint and Stake Xlp by BNB");

  await sendTxn(busd.connect(signer).approve(rewardRouterV2.address, expandDecimals(3500000, 18)),"Approve BUSD");
  await sendTxn(rewardRouterV2.mintAndStakeXlp(busd.address, expandDecimals(3500000, 18), 0, "114339270654517225309"),"Mint and Stake Xlp by BUSD");

  await sendTxn(usdc.connect(signer).approve(rewardRouterV2.address, expandDecimals(1500000, 18)),"Approve USDC");
  await sendTxn(rewardRouterV2.mintAndStakeXlp(usdc.address, expandDecimals(1500000, 18), 0, 0),"Mint and Stake Xlp by USDC");

  await sendTxn(matic.connect(signer).approve(rewardRouterV2.address, expandDecimals(880000, 18)),"Approve MATIC"); // MATIC Price $0.566
  await sendTxn(rewardRouterV2.mintAndStakeXlp(matic.address, expandDecimals(880000, 18), 0, 0),"Mint and Stake Xlp by MATIC");

  await sendTxn(op.connect(signer).approve(rewardRouterV2.address, expandDecimals(333333, 18)),"Approve OP"); // OP Price $1.5
  await sendTxn(rewardRouterV2.mintAndStakeXlp(op.address, expandDecimals(333333, 18), 0, 0),"Mint and Stake Xlp by OP");
  
  await sendTxn(arb.connect(signer).approve(rewardRouterV2.address, expandDecimals(500000, 18)),"Approve ARB"); //ARB Price $1
  await sendTxn(rewardRouterV2.mintAndStakeXlp(arb.address, expandDecimals(500000, 18), 0, 0),"Mint and Stake Xlp by ARB");
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
