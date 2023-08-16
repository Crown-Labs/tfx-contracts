const { contractAt, sendTxn, getContractAddress, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../../test/shared/utilities")

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

  const rewardRouterV2 = await contractAt("RewardRouterV2", getContractAddress("rewardRouterV2"), signer)
  console.log("rewardRouterV2.address: ", rewardRouterV2.address);
  
  await sendTxn(btc.connect(signer).approve(rewardRouterV2.address, expandDecimals(20, 18)),"Approve BTC");
  await sendTxn(rewardRouterV2.mintAndStakeGlp(btc.address, expandDecimals(20, 18), 0, 0),"Mint and Stake Glp by BTC");

  await sendTxn(bnb.connect(signer).approve(rewardRouterV2.address, expandDecimals(5000, 18)),"Approve BNB");
  await sendTxn(rewardRouterV2.mintAndStakeGlp(bnb.address, expandDecimals(5000, 18), 0, 0),"Mint and Stake Glp by BNB");

  await sendTxn(busd.connect(signer).approve(rewardRouterV2.address, expandDecimals(100, 18)),"Approve BUSD");
  await sendTxn(rewardRouterV2.mintAndStakeGlp(busd.address, expandDecimals(100, 18), 0, "114339270654517225309"),"Mint and Stake Glp by BUSD");

  await sendTxn(usdc.connect(signer).approve(rewardRouterV2.address, expandDecimals(500000, 18)),"Approve USDC");
  await sendTxn(rewardRouterV2.mintAndStakeGlp(usdc.address, expandDecimals(500000, 18), 0, 0),"Mint and Stake Glp by USDC");

  await sendTxn(matic.connect(signer).approve(rewardRouterV2.address, expandDecimals(220000, 18)),"Approve MATIC");
  await sendTxn(rewardRouterV2.mintAndStakeGlp(matic.address, expandDecimals(220000, 18), 0, 0),"Mint and Stake Glp by MATIC");

  await sendTxn(op.connect(signer).approve(rewardRouterV2.address, expandDecimals(700000, 18)),"Approve OP");
  await sendTxn(rewardRouterV2.mintAndStakeGlp(op.address, expandDecimals(700000, 18), 0, 0),"Mint and Stake Glp by OP");
  
  await sendTxn(arb.connect(signer).approve(rewardRouterV2.address, expandDecimals(77500, 18)),"Approve ARB");
  await sendTxn(rewardRouterV2.mintAndStakeGlp(arb.address, expandDecimals(77500, 18), 0, 0),"Mint and Stake Glp by ARB");
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
