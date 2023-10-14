const { contractAt, sendTxn, getContractAddress, getFrameSigner, expandDecimals } = require("../shared/helpers")

async function main() {

  // const tokenArr = [btc, bnb, busd, usdc, matic, op, arb]
  
  const signer = await getFrameSigner()
  const wallet = "0x11114D88d288c48Ea5dEC180bA5DCC2D137398dF";

  const btc = await contractAt("FaucetToken", getContractAddress("btc"), signer)
  const bnb = await contractAt("FaucetToken", getContractAddress("bnb"), signer)
  const busd = await contractAt("FaucetToken", getContractAddress("busd"), signer)
  const usdc = await contractAt("FaucetToken", getContractAddress("usdc"), signer)
  const matic = await contractAt("FaucetToken", getContractAddress("matic"), signer)
  const op = await contractAt("FaucetToken", getContractAddress("op"), signer)
  const arb = await contractAt("FaucetToken", getContractAddress("arb"), signer)

  // Wallet
  await btc.mint(wallet, expandDecimals(10000, 18));
  await bnb.mint(wallet, expandDecimals(10000, 18));
  await busd.mint(wallet, expandDecimals(1000000, 18));
  await usdc.mint(wallet, expandDecimals(1000000, 18));
  await matic.mint(wallet, expandDecimals(100000, 18));
  await op.mint(wallet, expandDecimals(100000, 18));
  await arb.mint(wallet, expandDecimals(1000000, 18));
  
  // Deployer
  await btc.mint(signer.address, expandDecimals(10000000, 18));
  await bnb.mint(signer.address, expandDecimals(10000000, 18));
  await busd.mint(signer.address, expandDecimals(1000000000, 18));
  await usdc.mint(signer.address, expandDecimals(1000000000, 18));
  await matic.mint(signer.address, expandDecimals(5000000, 18));
  await op.mint(signer.address, expandDecimals(5000000, 18));
  await arb.mint(signer.address, expandDecimals(5000000, 18));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
