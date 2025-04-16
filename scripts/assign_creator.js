// Script to assign a creator to a project
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Helper function to load the deployment information
function loadDeploymentInfo() {
  const networkName = network.name;
  const filePath = path.join(__dirname, "../deployments", `${networkName}-deployment.json`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Deployment file not found for network ${networkName}. Please run deploy.js first.`);
  }
  
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  // Get command-line arguments
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(`
Usage: npx hardhat run scripts/assign_creator.js --network <network> <project_id> <creator_address>

Arguments:
  project_id     - ID of the project
  creator_address - Address of the creator
    `);
    process.exit(1);
  }

  const projectId = parseInt(args[0]);
  const creatorAddress = args[1];

  // Validate inputs
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }

  if (!ethers.utils.isAddress(creatorAddress)) {
    throw new Error("Invalid creator address");
  }

  console.log(`
Assigning creator:
Project ID: ${projectId}
Creator Address: ${creatorAddress}
  `);

  // Load deployment information
  const deploymentInfo = loadDeploymentInfo();
  console.log(`Using deployment on network: ${deploymentInfo.network}`);

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);

  // Connect to EmissionController
  const EmissionController = await ethers.getContractFactory("EmissionController");
  const emissionController = EmissionController.attach(deploymentInfo.emissionController);

  // Check if project exists
  const exists = await emissionController.projectExists(projectId);
  if (!exists) {
    throw new Error(`Project with ID ${projectId} does not exist`);
  }

  // Assign the creator
  console.log("Assigning creator...");
  const tx = await emissionController.assignCreator(projectId, creatorAddress);
  console.log(`Transaction sent: ${tx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log(`Creator assigned successfully in block ${receipt.blockNumber}`);

  // Connect to InnovationUnits to check creator's balance
  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const innovationUnits = InnovationUnits.attach(deploymentInfo.innovationUnits);
  
  const creatorBalance = await innovationUnits.balanceOf(creatorAddress, projectId);
  console.log(`
Creator's IU balance: ${ethers.utils.formatEther(creatorBalance)} IU tokens
  `);

  console.log(`
Creator assignment completed successfully!
Project ID: ${projectId}
Creator Address: ${creatorAddress}
Transaction: ${tx.hash}
  `);

  // Return assignment details for potential use in frontend or other scripts
  return {
    projectId,
    creatorAddress,
    creatorBalance: ethers.utils.formatEther(creatorBalance),
    transaction: tx.hash
  };
}

// Export the assignment function for use in other scripts or frontend
async function assignCreator(config) {
  const {
    projectId,
    creatorAddress,
    deploymentInfo,
    signer
  } = config;

  // Connect to EmissionController
  const emissionControllerAbi = require('../artifacts/contracts/EmissionController.sol/EmissionController.json').abi;
  const emissionController = new ethers.Contract(
    deploymentInfo.emissionController,
    emissionControllerAbi,
    signer
  );

  // Assign the creator
  const tx = await emissionController.assignCreator(projectId, creatorAddress);
  const receipt = await tx.wait();
  
  // Connect to InnovationUnits to check creator's balance
  const innovationUnitsAbi = require('../artifacts/contracts/InnovationUnits.sol/InnovationUnits.json').abi;
  const innovationUnits = new ethers.Contract(
    deploymentInfo.innovationUnits,
    innovationUnitsAbi,
    signer
  );
  
  const creatorBalance = await innovationUnits.balanceOf(creatorAddress, projectId);
  
  return {
    projectId,
    creatorAddress,
    creatorBalance: ethers.utils.formatEther(creatorBalance),
    transaction: tx.hash,
    blockNumber: receipt.blockNumber,
    success: true
  };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  main()
    .then((result) => {
      console.log("Creator assignment result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  assignCreator
}; 