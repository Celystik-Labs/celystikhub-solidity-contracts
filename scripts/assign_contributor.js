// Script to assign a contributor to a project
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
  if (args.length < 3) {
    console.error(`
Usage: npx hardhat run scripts/assign_contributor.js --network <network> <project_id> <contributor_address> <allocation>

Arguments:
  project_id          - ID of the project
  contributor_address - Address of the contributor
  allocation          - Amount of Innovation Units to allocate to the contributor
    `);
    process.exit(1);
  }

  const projectId = parseInt(args[0]);
  const contributorAddress = args[1];
  const allocation = ethers.utils.parseEther(args[2]);

  // Validate inputs
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }

  if (!ethers.utils.isAddress(contributorAddress)) {
    throw new Error("Invalid contributor address");
  }

  if (allocation.lte(ethers.constants.Zero)) {
    throw new Error("Allocation must be greater than zero");
  }

  console.log(`
Assigning contributor:
Project ID: ${projectId}
Contributor Address: ${contributorAddress}
Allocation: ${ethers.utils.formatEther(allocation)} IU tokens
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

  // Connect to InnovationUnits to check available contributor reserve
  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const innovationUnits = InnovationUnits.attach(deploymentInfo.innovationUnits);
  
  const projectInfo = await emissionController.getProject(projectId);
  const contributorReserve = projectInfo.contributorReserve;
  console.log(`Available contributor reserve: ${ethers.utils.formatEther(contributorReserve)} IU tokens`);

  if (allocation.gt(contributorReserve)) {
    throw new Error(`Allocation exceeds available contributor reserve (${ethers.utils.formatEther(contributorReserve)} IU tokens)`);
  }

  // Assign the contributor
  console.log("Assigning contributor...");
  const tx = await emissionController.assignContributor(projectId, contributorAddress, allocation);
  console.log(`Transaction sent: ${tx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log(`Contributor assigned successfully in block ${receipt.blockNumber}`);

  // Check contributor's balance
  const contributorBalance = await innovationUnits.balanceOf(contributorAddress, projectId);
  console.log(`
Contributor's IU balance: ${ethers.utils.formatEther(contributorBalance)} IU tokens
  `);

  console.log(`
Contributor assignment completed successfully!
Project ID: ${projectId}
Contributor Address: ${contributorAddress}
Allocation: ${ethers.utils.formatEther(allocation)} IU tokens
Transaction: ${tx.hash}
  `);

  // Return assignment details for potential use in frontend or other scripts
  return {
    projectId,
    contributorAddress,
    allocation: ethers.utils.formatEther(allocation),
    contributorBalance: ethers.utils.formatEther(contributorBalance),
    transaction: tx.hash
  };
}

// Export the assignment function for use in other scripts or frontend
async function assignContributor(config) {
  const {
    projectId,
    contributorAddress,
    allocation,
    deploymentInfo,
    signer
  } = config;

  // Ensure allocation is a BigNumber
  const allocationBN = typeof allocation === 'string' 
    ? ethers.utils.parseEther(allocation)
    : allocation;

  // Connect to EmissionController
  const emissionControllerAbi = require('../artifacts/contracts/EmissionController.sol/EmissionController.json').abi;
  const emissionController = new ethers.Contract(
    deploymentInfo.emissionController,
    emissionControllerAbi,
    signer
  );

  // Connect to InnovationUnits
  const innovationUnitsAbi = require('../artifacts/contracts/InnovationUnits.sol/InnovationUnits.json').abi;
  const innovationUnits = new ethers.Contract(
    deploymentInfo.innovationUnits,
    innovationUnitsAbi,
    signer
  );

  // Assign the contributor
  const tx = await emissionController.assignContributor(projectId, contributorAddress, allocationBN);
  const receipt = await tx.wait();
  
  // Check contributor's balance
  const contributorBalance = await innovationUnits.balanceOf(contributorAddress, projectId);
  
  return {
    projectId,
    contributorAddress,
    allocation: ethers.utils.formatEther(allocationBN),
    contributorBalance: ethers.utils.formatEther(contributorBalance),
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
      console.log("Contributor assignment result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  assignContributor
}; 