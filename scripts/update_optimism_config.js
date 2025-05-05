// SCRIPT TO UPDATE ADDRESSES IN UTILITY FILES FOR OPTIMISM SEPOLIA
// Run with: node scripts/update_optimism_config.js

const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔧 Updating contract addresses for Optimism Sepolia interaction...");
  
  // Load deployment data
  const deploymentPath = path.join(__dirname, "../deployment-optimism-sepolia.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error(`❌ Deployment data not found at ${deploymentPath}`);
    console.error("Please deploy contracts first using scripts/deploy_optimism_testnet.js");
    process.exit(1);
  }
  
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  console.log(`📄 Loaded deployment data from ${deploymentPath}`);
  
  // Extract contract addresses
  const addresses = {
    CEL_TOKEN: deploymentData.contracts.CELToken.address,
    PROTOCOL_TREASURY: deploymentData.contracts.ProtocolTreasury.address,
    INNOVATION_UNITS: deploymentData.contracts.InnovationUnits.address,
    PROJECT_STAKING: deploymentData.contracts.ProjectStaking.address,
    EMISSION_CONTROLLER: deploymentData.contracts.EmissionController.address
  };
  
  // Create a new utils file for Optimism
  const utilsTemplate = `
const { ethers } = require("hardhat");

// Contract addresses from Optimism Sepolia deployment
const CONTRACT_ADDRESSES = {
  CEL_TOKEN: "${addresses.CEL_TOKEN}",
  PROTOCOL_TREASURY: "${addresses.PROTOCOL_TREASURY}",
  INNOVATION_UNITS: "${addresses.INNOVATION_UNITS}",
  PROJECT_STAKING: "${addresses.PROJECT_STAKING}",
  EMISSION_CONTROLLER: "${addresses.EMISSION_CONTROLLER}"
};

/**
 * Gets contract instances for the deployed contracts
 * @param {boolean} useSigner - Whether to connect contracts to the signer
 * @returns {Object} Object containing all contract instances
 */
async function getContracts(useSigner = true) {
  const CELToken = await ethers.getContractFactory("CELToken");
  const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const ProjectStaking = await ethers.getContractFactory("ProjectStaking");
  const EmissionController = await ethers.getContractFactory("EmissionController");

  let signer = null;
  if (useSigner) {
    const [deployer] = await ethers.getSigners();
    signer = deployer;
  }

  // Connect to the deployed contract instances
  const celToken = CELToken.attach(CONTRACT_ADDRESSES.CEL_TOKEN);
  const protocolTreasury = ProtocolTreasury.attach(CONTRACT_ADDRESSES.PROTOCOL_TREASURY);
  const innovationUnits = InnovationUnits.attach(CONTRACT_ADDRESSES.INNOVATION_UNITS);
  const projectStaking = ProjectStaking.attach(CONTRACT_ADDRESSES.PROJECT_STAKING);
  const emissionController = EmissionController.attach(CONTRACT_ADDRESSES.EMISSION_CONTROLLER);

  // Connect contracts to signer if required
  if (useSigner) {
    return {
      celToken: celToken.connect(signer),
      protocolTreasury: protocolTreasury.connect(signer),
      innovationUnits: innovationUnits.connect(signer),
      projectStaking: projectStaking.connect(signer),
      emissionController: emissionController.connect(signer),
      signer
    };
  }

  return {
    celToken,
    protocolTreasury,
    innovationUnits,
    projectStaking,
    emissionController
  };
}

/**
 * Helper to log transaction details
 * @param {string} title - Title for the transaction
 * @param {Object} tx - Transaction object
 */
async function logTransaction(title, tx) {
  console.log(\`\\n\${title}:\`);
  console.log(\`Transaction Hash: \${tx.hash}\`);
  console.log(\`Optimism Sepolia Explorer: https://sepolia-optimism.etherscan.io/tx/\${tx.hash}\`);
  
  const receipt = await tx.wait();
  console.log(\`Gas Used: \${receipt.gasUsed.toString()}\`);
  console.log(\`Block Number: \${receipt.blockNumber}\`);
  
  return receipt;
}

/**
 * Helper to format ethers BigNumber to readable string with decimals
 * @param {BigNumber} amount - The amount to format
 * @param {number} decimals - Number of decimals (default: 18)
 * @returns {string} Formatted amount string
 */
function formatAmount(amount, decimals = 18) {
  return ethers.utils.formatUnits(amount, decimals);
}

/**
 * Helper to parse string to BigNumber with proper decimals
 * @param {string} amount - The amount string to parse
 * @param {number} decimals - Number of decimals (default: 18)
 * @returns {BigNumber} Parsed amount as BigNumber
 */
function parseAmount(amount, decimals = 18) {
  return ethers.utils.parseUnits(amount.toString(), decimals);
}

module.exports = {
  CONTRACT_ADDRESSES,
  getContracts,
  logTransaction,
  formatAmount,
  parseAmount
};
`;

  // Write the new utils file for Optimism
  const optimismUtilsPath = path.join(__dirname, "./interactions/utils.optimism.js");
  fs.writeFileSync(optimismUtilsPath, utilsTemplate);
  console.log(`✅ Created Optimism Sepolia utilities at ${optimismUtilsPath}`);
  
  // Create a README file for Optimism interaction
  const readmeTemplate = `# Celystik Hub on Optimism Sepolia

## Deployment Information

This file contains information about the Celystik Hub contracts deployed on Optimism Sepolia testnet.

## Contract Addresses

- CEL Token: ${addresses.CEL_TOKEN}
- Protocol Treasury: ${addresses.PROTOCOL_TREASURY}
- Innovation Units: ${addresses.INNOVATION_UNITS}
- Project Staking: ${addresses.PROJECT_STAKING}
- Emission Controller: ${addresses.EMISSION_CONTROLLER}

## Blockchain Explorer Links

- CEL Token: [https://sepolia-optimism.etherscan.io/address/${addresses.CEL_TOKEN}](https://sepolia-optimism.etherscan.io/address/${addresses.CEL_TOKEN})
- Protocol Treasury: [https://sepolia-optimism.etherscan.io/address/${addresses.PROTOCOL_TREASURY}](https://sepolia-optimism.etherscan.io/address/${addresses.PROTOCOL_TREASURY})
- Innovation Units: [https://sepolia-optimism.etherscan.io/address/${addresses.INNOVATION_UNITS}](https://sepolia-optimism.etherscan.io/address/${addresses.INNOVATION_UNITS})
- Project Staking: [https://sepolia-optimism.etherscan.io/address/${addresses.PROJECT_STAKING}](https://sepolia-optimism.etherscan.io/address/${addresses.PROJECT_STAKING})
- Emission Controller: [https://sepolia-optimism.etherscan.io/address/${addresses.EMISSION_CONTROLLER}](https://sepolia-optimism.etherscan.io/address/${addresses.EMISSION_CONTROLLER})

## Interacting with Contracts

To interact with these contracts, use the utils.optimism.js file in the scripts/interactions directory:

\`\`\`javascript
// Import the Optimism utilities
const utils = require('./utils.optimism.js');

async function main() {
  // Get contract instances
  const { celToken, innovationUnits, projectStaking, emissionController } = await utils.getContracts();
  
  // Interact with contracts
  const balance = await celToken.balanceOf(yourAddress);
  console.log(\`CEL Token Balance: \${utils.formatAmount(balance)}\`);
}
\`\`\`

## Deployment Timestamp

Deployed on: ${deploymentData.timestamp}

## Deployer Address

Deployer: ${deploymentData.deployer}
`;

  // Write the README file
  const readmePath = path.join(__dirname, "../OPTIMISM_SEPOLIA.md");
  fs.writeFileSync(readmePath, readmeTemplate);
  console.log(`✅ Created Optimism Sepolia README at ${readmePath}`);
  
  console.log("\n🎉 Configuration update completed!");
  console.log("You can now interact with the contracts on Optimism Sepolia using the provided utilities.");
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Configuration update failed:", error);
    process.exit(1);
  }); 