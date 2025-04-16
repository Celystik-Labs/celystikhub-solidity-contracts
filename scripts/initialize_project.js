// Script to initialize a new project
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
  if (args.length < 6) {
    console.error(`
Usage: npx hardhat run scripts/initialize_project.js --network <network> <project_id> <name> <description> <total_supply> <creator_share> <contributor_reserve> <investor_reserve> <price_per_unit> <stake_limit>

Arguments:
  project_id         - ID of the project to create (uint256)
  name               - Name of the project (string)
  description        - Description of the project (string)
  total_supply       - Total supply of IUs for the project (in tokens, e.g., "100000")
  creator_share      - Percentage allocated to creator (in percentage scaled by PRECISION, e.g., "20" for 20%)
  contributor_reserve - Percentage reserved for contributors (in percentage scaled by PRECISION, e.g., "30" for 30%)
  investor_reserve   - Percentage reserved for investors (in percentage scaled by PRECISION, e.g., "50" for 50%)
  price_per_unit     - Price per IU in CEL tokens (in tokens, e.g., "0.01")
  stake_limit        - Maximum stake limit for the project (in tokens, "10000" or "0" for no limit)
    `);
    process.exit(1);
  }

  // Parse arguments
  const projectId = parseInt(args[0]);
  const name = args[1];
  const description = args[2];
  const totalSupply = ethers.utils.parseEther(args[3]);
  const creatorShare = ethers.utils.parseEther(args[4]);
  const contributorReserve = ethers.utils.parseEther(args[5]);
  const investorReserve = ethers.utils.parseEther(args[6]);
  const pricePerUnit = ethers.utils.parseEther(args[7]);
  const stakeLimit = ethers.utils.parseEther(args[8]);

  // Validate inputs
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }

  const totalPercentage = parseFloat(args[4]) + parseFloat(args[5]) + parseFloat(args[6]);
  if (Math.abs(totalPercentage - 100) > 0.001) {
    throw new Error("Creator share, contributor reserve, and investor reserve must sum to 100%");
  }

  console.log(`
Initializing new project:
Project ID: ${projectId}
Name: ${name}
Description: ${description}
Total Supply: ${ethers.utils.formatEther(totalSupply)} IU tokens
Creator Share: ${args[4]}%
Contributor Reserve: ${args[5]}%
Investor Reserve: ${args[6]}%
Price Per Unit: ${ethers.utils.formatEther(pricePerUnit)} CEL
Stake Limit: ${args[8] === "0" ? "No limit" : ethers.utils.formatEther(stakeLimit) + " CEL"}
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

  // Check if project already exists
  const exists = await emissionController.projectExists(projectId);
  if (exists) {
    throw new Error(`Project with ID ${projectId} already exists`);
  }

  // Initialize the project
  console.log("Initializing project...");
  const tx = await emissionController.InitializeProject(
    projectId,
    name,
    description,
    totalSupply,
    creatorShare,
    contributorReserve,
    investorReserve,
    pricePerUnit,
    stakeLimit
  );
  console.log(`Transaction sent: ${tx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log(`Project initialized successfully in block ${receipt.blockNumber}`);

  // Verify project was created
  const projectExists = await emissionController.projectExists(projectId);
  const projectCount = await emissionController.projectCount();
  
  console.log(`Project exists: ${projectExists}`);
  console.log(`Total project count: ${projectCount.toString()}`);

  // Connect to InnovationUnits to verify project creation
  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const innovationUnits = InnovationUnits.attach(deploymentInfo.innovationUnits);
  
  const projectConfig = await innovationUnits.getProjectConfig(projectId);
  console.log(`
Project configuration in InnovationUnits:
Total Supply: ${ethers.utils.formatEther(projectConfig.totalSupply)} IU tokens
Creator Share: ${ethers.utils.formatEther(projectConfig.creatorShare)}
Contributor Reserve: ${ethers.utils.formatEther(projectConfig.contributorReserve)}
Investor Reserve: ${ethers.utils.formatEther(projectConfig.investorReserve)}
Price Per Unit: ${ethers.utils.formatEther(projectConfig.pricePerUnit)} CEL
Is Active: ${projectConfig.isActive}
  `);

  // Connect to Staking to verify staking pool creation
  const Staking = await ethers.getContractFactory("Staking");
  const staking = Staking.attach(deploymentInfo.staking);
  
  const stakingPool = await staking.getProjectStakingPool(projectId);
  console.log(`
Staking pool configuration:
Total Staked: ${ethers.utils.formatEther(stakingPool.totalStaked)} CEL
Stake Limit: ${stakingPool.stakeLimit.isZero() ? "No limit" : ethers.utils.formatEther(stakingPool.stakeLimit) + " CEL"}
Enabled: ${stakingPool.enabled}
Min Staking Period: ${stakingPool.minStakingPeriod.toString() / 86400} days
  `);

  console.log(`
Project initialization completed successfully!
Project ID: ${projectId}
Transaction: ${tx.hash}
  `);

  // Return project details for potential use in frontend or other scripts
  return {
    projectId,
    name,
    description,
    totalSupply: ethers.utils.formatEther(totalSupply),
    creatorShare: args[4],
    contributorReserve: args[5],
    investorReserve: args[6],
    pricePerUnit: ethers.utils.formatEther(pricePerUnit),
    stakeLimit: args[8] === "0" ? "No limit" : ethers.utils.formatEther(stakeLimit),
    transaction: tx.hash
  };
}

// Export the initialization function for use in other scripts or frontend
async function initializeProject(config, provider) {
  const {
    projectId,
    name,
    description,
    totalSupply,
    creatorShare,
    contributorReserve,
    investorReserve,
    pricePerUnit,
    stakeLimit,
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

  // Initialize the project
  const tx = await emissionController.InitializeProject(
    projectId,
    name,
    description,
    ethers.utils.parseEther(totalSupply),
    ethers.utils.parseEther(creatorShare),
    ethers.utils.parseEther(contributorReserve),
    ethers.utils.parseEther(investorReserve),
    ethers.utils.parseEther(pricePerUnit),
    ethers.utils.parseEther(stakeLimit)
  );
  
  const receipt = await tx.wait();
  
  return {
    projectId,
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
      console.log("Project initialization result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  initializeProject
}; 