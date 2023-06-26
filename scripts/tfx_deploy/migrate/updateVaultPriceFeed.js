const { deployContract, contractAt, sendTxn, getContractAddress, getFrameSigner, sleep } = require("../shared/helpers")
const { expandDecimals } = require("../../../test/shared/utilities")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const { btc, eth, bnb, busd, usdc, matic, op, arb} = tokens
  const tokenArr = [btc, eth, bnb, busd, usdc, matic, op, arb]

  const signer = await getFrameSigner()

  const vaultPriceFeed = await contractAt("VaultPriceFeed", getContractAddress("vaultPriceFeed"), signer)
  let timelock;

  console.log(`🪄 Upgrade VaultPriceFeed to ${vaultPriceFeed.address}`);
  
  // setGov to deployer
  timelock = await contractAt("Timelock", getContractAddress("timelock"), signer)
  await sendTxn(timelock.signalSetGov(vaultPriceFeed.address, signer.address), `timelock.signalSetGov(router)`);
  
  console.log(`wait for timelock...`);
  await sleep(1000 * 60 * 5.1); // wait 5.1 mins

  await sendTxn(timelock.setGov(vaultPriceFeed.address, signer.address), `timelock.setGov(router)`);

  // whitelist tokens
  for (const token of tokenArr) {
    console.log("setTokenConfig:", token.name);

    await sendTxn(vaultPriceFeed.setTokenConfig(
      token.address, // _token
      token.priceFeed, // _priceFeed
      token.priceDecimals, // _priceDecimals
      token.isStrictStable // _isStrictStable
    ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)
  }

  // Set timelock
  await sendTxn(vaultPriceFeed.setGov(timelock.address), `vaultPriceFeed.setGov(timelock)`);  
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
