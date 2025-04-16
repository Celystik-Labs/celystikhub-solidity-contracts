// Script to create a new project using the ProjectFactory contract
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
Usage: npx hardhat run scripts/create_project.js --network <network> <project_id> <creator_share> <contributor_share> <investor_share> <total_supply> <price_per_unit> <stake_limit>

Arguments:
  project_id        - Unique ID for the project (integer > 0)
  creator_share     - Percentage of IUs allocated to creator in basis points (e.g., 2000 for 20%)
  contributor_share - Percentage of IUs reserved for contributors in basis points
  investor_share    - Percentage of IUs reserved for investors in basis points
  total_supply      - Total supply of IUs for the project
  price_per_unit    - Price per IU in CEL tokens
  stake_limit       - Maximum stake limit for the project (0 for no limit)

Note: creator_share + contributor_share + investor_share must equal 10000 (100%)
    `);
    process.exit(1);
  }

  const projectId = parseInt(args[0]);
  const creatorShare = parseInt(args[1]);
  const contributorShare = parseInt(args[2]);
  const investorShare = parseInt(args[3]);
  const totalSupply = parseInt(args[4]);
  const pricePerUnit = parseInt(args[5]);
  const stakeLimit = args[6] ? ethers.utils.parseEther(args[6]) : ethers.utils.parseEther("0");

  // Validate inputs
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }
  
  if (creatorShare + contributorShare + investorShare !== 10000) {
    throw new Error("Shares must add up to 10000 basis points (100%)");
  }

  if (isNaN(totalSupply) || totalSupply <= 0) {
    throw new Error("Total supply must be a positive integer");
  }

  if (isNaN(pricePerUnit) || pricePerUnit <= 0) {
    throw new Error("Price per unit must be a positive integer");
  }

  console.log(`
Creating new project with the following parameters:
Project ID: ${projectId}
Creator Share: ${creatorShare / 100}%
Contributor Share: ${contributorShare / 100}%
Investor Share: ${investorShare / 100}%
Total Supply: ${totalSupply} IUs
Price Per Unit: ${pricePerUnit} CEL
Stake Limit: ${ethers.utils.formatEther(stakeLimit)} CEL
  `);

  // Load deployment information
  const deploymentInfo = loadDeploymentInfo();
  console.log(`Using deployment on network: ${deploymentInfo.network}`);

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);

  // Connect to the ProjectFactory contract
  const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
  const projectFactory = ProjectFactory.attach(deploymentInfo.projectFactory);
  
  // Check if project already exists
  const projectExists = await projectFactory.projectExists(projectId);
  if (projectExists) {
    throw new Error(`Project with ID ${projectId} already exists`);
  }

  // Create the project
  console.log("Creating project...");
  const tx = await projectFactory.createProject(
    projectId,
    creatorShare,
    contributorShare,
    investorShare,
    totalSupply,
    pricePerUnit,
    stakeLimit
  );

  console.log(`Transaction sent: ${tx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log(`Project created successfully in block ${receipt.blockNumber}`);

  // Get project count
  const projectCount = await projectFactory.getProjectCount();
  console.log(`Total projects count: ${projectCount}`);

  console.log(`
Project created successfully!
Project ID: ${projectId}
Transaction: ${tx.hash}
  `);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 