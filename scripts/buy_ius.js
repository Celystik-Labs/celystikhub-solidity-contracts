// Script to purchase Innovation Units (IUs) for a project
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
Usage: npx hardhat run scripts/buy_ius.js --network <network> <project_id> <amount>

Arguments:
  project_id - ID of the project to purchase IUs for
  amount     - Amount of IUs to purchase
    `);
    process.exit(1);
  }

  const projectId = parseInt(args[0]);
  const amount = parseInt(args[1]);

  // Validate inputs
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }

  if (isNaN(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer");
  }

  // Load deployment information
  const deploymentInfo = loadDeploymentInfo();
  console.log(`Using deployment on network: ${deploymentInfo.network}`);

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);

  // Connect to the contracts
  const CELToken = await ethers.getContractFactory("CELToken");
  const celToken = CELToken.attach(deploymentInfo.celToken);
  
  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const innovationUnits = InnovationUnits.attach(deploymentInfo.innovationUnits);
  
  const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
  const projectFactory = ProjectFactory.attach(deploymentInfo.projectFactory);
  
  // Check if project exists
  const projectExists = await projectFactory.projectExists(projectId);
  if (!projectExists) {
    throw new Error(`Project with ID ${projectId} does not exist`);
  }

  // Get project details
  const projectConfig = await innovationUnits.getProjectConfig(projectId);
  if (!projectConfig.isActive) {
    throw new Error(`Project ${projectId} is not active`);
  }

  const pricePerUnit = projectConfig.pricePerUnit;
  const totalPrice = pricePerUnit.mul(amount);
  
  console.log(`
Purchasing Innovation Units:
Project ID: ${projectId}
Amount: ${amount} IUs
Price per IU: ${ethers.utils.formatEther(pricePerUnit)} CEL
Total price: ${ethers.utils.formatEther(totalPrice)} CEL
  `);

  // Check available IUs for investors
  const availableIUs = await innovationUnits.getAvailableInvestorIUs(projectId);
  if (availableIUs.lt(amount)) {
    throw new Error(`Not enough IUs available for purchase. Available: ${ethers.utils.formatUnits(availableIUs, 0)} IUs`);
  }
  console.log(`Available IUs for investors: ${ethers.utils.formatUnits(availableIUs, 0)} IUs`);

  // Check user's CEL token balance
  const balance = await celToken.balanceOf(signer.address);
  if (balance.lt(totalPrice)) {
    throw new Error(`Insufficient CEL token balance. Required: ${ethers.utils.formatEther(totalPrice)} CEL, Available: ${ethers.utils.formatEther(balance)} CEL`);
  }
  console.log(`Your CEL token balance: ${ethers.utils.formatEther(balance)} CEL`);

  // Check allowance
  const allowance = await celToken.allowance(signer.address, innovationUnits.address);
  if (allowance.lt(totalPrice)) {
    console.log(`Approving ${ethers.utils.formatEther(totalPrice)} CEL tokens for Innovation Units contract...`);
    const approveTx = await celToken.approve(innovationUnits.address, totalPrice);
    await approveTx.wait();
    console.log(`Approval transaction: ${approveTx.hash}`);
  } else {
    console.log(`You have already approved ${ethers.utils.formatEther(allowance)} CEL tokens for Innovation Units contract`);
  }

  // Purchase IUs
  console.log(`Purchasing ${amount} IUs...`);
  const tx = await innovationUnits.purchaseIUs(projectId, amount);
  console.log(`Transaction sent: ${tx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log(`IUs purchased successfully in block ${receipt.blockNumber}`);

  // Get IU balance
  const iuBalance = await innovationUnits.getInnovationUnits(signer.address, projectId);
  console.log(`Your total IU balance for project ${projectId}: ${ethers.utils.formatUnits(iuBalance, 0)} IUs`);

  // Get ownership share
  const ownershipShare = await innovationUnits.getOwnershipShare(signer.address, projectId);
  console.log(`Your ownership share in project ${projectId}: ${ethers.utils.formatEther(ownershipShare)} (${ethers.utils.formatEther(ownershipShare.mul(100))}%)`);

  console.log(`
Purchase completed successfully!
Project ID: ${projectId}
Purchased: ${amount} IUs
Total price: ${ethers.utils.formatEther(totalPrice)} CEL
Your IU balance: ${ethers.utils.formatUnits(iuBalance, 0)} IUs
Transaction: ${tx.hash}
  `);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 