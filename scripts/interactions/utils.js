const { ethers } = require("hardhat");

// Contract addresses from local deployment
const CONTRACT_ADDRESSES = {
  CEL_TOKEN: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d",
  PROTOCOL_TREASURY: "0x59b670e9fA9D0A427751Af201D676719a970857b",
  INNOVATION_UNITS: "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1",
  PROJECT_STAKING: "0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44",
  EMISSION_CONTROLLER: "0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f"
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
  console.log(`\n${title}:`);
  console.log(`Transaction Hash: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
  console.log(`Block Number: ${receipt.blockNumber}`);
  
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