require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
require("solidity-coverage");
require("dotenv").config();
const { utils } = require("ethers");

// Load environment variables from .env file
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const INFURA_API_KEY = process.env.INFURA_API_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const OPTIMISM_API_KEY = process.env.OPTIMISM_API_KEY || "";
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY || "";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || ""; // Add BscScan key if verifying

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    // Local development networks
    hardhat: {
      chainId: 31337,
      accounts: {
        count: 100,  // Increase from default of 20
        accountsBalance: utils.parseEther("10000").toString() // 10,000 ETH per account
      },
      gas: 12000000,          // Higher gas limit for complex transactions
      blockGasLimit: 12000000 // Higher block gas limit
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },
    
    // Ethereum networks
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
      gasPrice: 30000000000, // 30 gwei (adjust based on current gas prices)
      chainId: 1
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 5
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 11155111
    },
    
    // Layer 2 and sidechains
    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
      gasPrice: 100000000000, // 100 gwei (adjust based on current gas prices)
      chainId: 137
    },
    polygonMumbai: {
      url: `https://polygon-mumbai.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 80001
    },
    optimism: {
      url: `https://optimism-mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 10
    },
    optimismSepolia: {
      url: process.env.OPTIMISM_SEPOLIA_RPC_URL || "https://sepolia.optimism.io",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 11155420,
      gasPrice: process.env.GAS_PRICE !== "auto" ? parseInt(process.env.GAS_PRICE) : "auto",
      gasLimit: parseInt(process.env.GAS_LIMIT || "8000000"),
      verify: {
        etherscan: {
          apiKey: process.env.OPTIMISM_API_KEY
        }
      }
    },
    arbitrum: {
      url: `https://arbitrum-mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 42161
    },
    bnbTestnet: {
      url: process.env.BNB_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 97,
      verify: {
        etherscan: {
          apiKey: process.env.BSCSCAN_API_KEY
        }
      }
    }
  },
  etherscan: {
    apiKey: {
      // Ethereum
      mainnet: ETHERSCAN_API_KEY,
      goerli: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      
      // Polygon
      polygon: POLYGONSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY,
      
      // Optimism
      optimisticEthereum: OPTIMISM_API_KEY,
      optimisticSepolia: OPTIMISM_API_KEY,
      
      // Arbitrum
      arbitrumOne: ARBISCAN_API_KEY,

      // BNB Testnet
      bscTestnet: BSCSCAN_API_KEY
    },
    customChains: [
      {
        network: "optimisticSepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://sepolia-optimism.etherscan.io/"
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 300000  // 5 minutes instead of 60 seconds
  }
}; 