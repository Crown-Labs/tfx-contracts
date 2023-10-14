require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-contract-sizer");
require("@typechain/hardhat");
require("dotenv").config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.info(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    hardhat: {
      /* allowUnlimitedContractSize: true, 
      forking: {
        url: "", 
      } */
    },
    lineaTestnet: {
      url: "https://rpc.goerli.linea.build",
      chainId: 59140,
      gasPrice: 3 * 10**9,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
    develop: {
      url: `https://develop-chain.0xnode.cloud/`,
      chainId: 1112,
      gasPrice: 1 * 10**9,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
  },
  etherscan: {
    apiKey: {
      lineaTestnet: `${process.env.LINEA_TESTNET_APIKEY}`,
      develop: `e11547e6-738d-48c3-9cbb-2f918c24689f`,
    },
    customChains: [{
        network: "lineaTestnet",
        chainId: parseInt(`${process.env.LINEA_TESTNET_CHAIN_ID}`),
        urls: {
          apiURL: "https://api-testnet.lineascan.build/api",
          browserURL: "https://goerli.lineascan.build/"
        }
      },
      {
        network: "develop",
        chainId: 1112,
        urls: {
          apiURL: "https://develop-chain-explorer.0xnode.cloud/api",
          browserURL: "https://develop-chain-explorer.0xnode.cloud/"
        }
      }
    ], 
  },
  solidity: {
    compilers: [
      {
        version: "0.8.18",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
        },
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
        },
      },
    ],
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
};
