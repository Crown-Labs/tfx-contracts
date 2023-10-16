const { contractAt, sendTxn, getContractAddress, getFrameSigner, expandDecimals } = require("../shared/helpers")

async function main() {
  
  const signer = await getFrameSigner()
  const wallet = "0x240EF48786F79a0EDc2C4ebcE452af23984443C3";

  const btc = await contractAt("FaucetToken", getContractAddress("btc"), signer)
  const bnb = await contractAt("FaucetToken", getContractAddress("bnb"), signer)
  const usdt = await contractAt("FaucetToken", getContractAddress("usdt"), signer)
  const usdc = await contractAt("FaucetToken", getContractAddress("usdc"), signer)
  const matic = await contractAt("FaucetToken", getContractAddress("matic"), signer)
  const op = await contractAt("FaucetToken", getContractAddress("op"), signer)
  const arb = await contractAt("FaucetToken", getContractAddress("arb"), signer)

  // Wallet

  await sendTxn(btc.mint(wallet, expandDecimals(10000000, 18)),"Mint BTC");
  await sendTxn(bnb.mint(wallet, expandDecimals(10000000, 18)),"Mint BNB");
  await sendTxn(usdt.mint(wallet, expandDecimals(10000000, 18)),"Mint USDT");
  await sendTxn(usdc.mint(wallet, expandDecimals(10000000, 18)),"Mint USDC");
  await sendTxn(matic.mint(wallet, expandDecimals(10000000, 18)),"Mint MATIC");
  await sendTxn(op.mint(wallet, expandDecimals(10000000, 18)),"Mint OP");
  await sendTxn(arb.mint(wallet, expandDecimals(10000000, 18)),"Mint ARB");
  
  // Deployer
  await sendTxn(btc.mint(signer.address, expandDecimals(10000000, 18)),"Mint BTC");
  await sendTxn(bnb.mint(signer.address, expandDecimals(10000000, 18)),"Mint BNB");
  await sendTxn(usdt.mint(signer.address, expandDecimals(10000000, 18)),"Mint USDT");
  await sendTxn(usdc.mint(signer.address, expandDecimals(10000000, 18)),"Mint USDC");
  await sendTxn(matic.mint(signer.address, expandDecimals(10000000, 18)),"Mint MATIC");
  await sendTxn(op.mint(signer.address, expandDecimals(10000000, 18)),"Mint OP");
  await sendTxn(arb.mint(signer.address, expandDecimals(10000000, 18)),"Mint ARB");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
