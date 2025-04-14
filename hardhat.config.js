require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },

    optimismMainnet: {
      url: process.env.OPTIMISM_MAINNET_URL,
      accounts: [process.env.PRIVATE_KEY],
    },
    optimismSepolia: {
      url: process.env.OPTIMISM_SEPOLIA_URL,
      accounts: [process.env.PRIVATE_KEY],
    },
    // Add configuration for testnet and mainnet when ready for deployment
    // goerli: {
    //   url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
    //   accounts: [process.env.PRIVATE_KEY]
    // }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
}; 