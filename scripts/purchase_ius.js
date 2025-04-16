// Script to purchase Innovation Units (IUs) from a project
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
Usage: npx hardhat run scripts/purchase_ius.js --network <network> <project_id> <iu_amount>

Arguments:
  project_id     - ID of the project to purchase IUs from
  iu_amount      - Amount of Innovation Units to purchase (e.g., "100")
    `);
    process.exit(1);
  }

  const projectId = parseInt(args[0]);
  const iuAmount = ethers.utils.parseEther(args[1]);

  // Validate inputs
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }

  if (iuAmount.lte(ethers.constants.Zero)) {
    throw new Error("IU amount must be greater than zero");
  }

  console.log(`
Purchasing Innovation Units:
Project ID: ${projectId}
IU Amount: ${ethers.utils.formatEther(iuAmount)}
  `);

  // Load deployment information
  const deploymentInfo = loadDeploymentInfo();
  console.log(`Using deployment on network: ${deploymentInfo.network}`);

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);

  // Connect to contracts
  const CELToken = await ethers.getContractFactory("CELToken");
  const celToken = CELToken.attach(deploymentInfo.celToken);

  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const innovationUnits = InnovationUnits.attach(deploymentInfo.innovationUnits);

  const EmissionController = await ethers.getContractFactory("EmissionController");
  const emissionController = EmissionController.attach(deploymentInfo.emissionController);

  // Check if project exists
  const exists = await emissionController.projectExists(projectId);
  if (!exists) {
    throw new Error(`Project with ID ${projectId} does not exist`);
  }

  // Get project config
  const projectConfig = await innovationUnits.getProjectConfig(projectId);
  console.log(`
Project IU configuration:
Total Supply: ${ethers.utils.formatEther(projectConfig.totalSupply)} IU tokens
Creator Share: ${ethers.utils.formatEther(projectConfig.creatorShare)}
Contributor Reserve: ${ethers.utils.formatEther(projectConfig.contributorReserve)}
Investor Reserve: ${ethers.utils.formatEther(projectConfig.investorReserve)}
Price Per Unit: ${ethers.utils.formatEther(projectConfig.pricePerUnit)} CEL
Is Active: ${projectConfig.isActive}
  `);

  if (!projectConfig.isActive) {
    throw new Error("This project is not active for IU purchases");
  }

  // Check available IUs for investment
  const availableIUs = await innovationUnits.getAvailableInvestorIUs(projectId);
  console.log(`Available IUs for investment: ${ethers.utils.formatEther(availableIUs)} IU tokens`);

  if (iuAmount.gt(availableIUs)) {
    throw new Error(`Requested amount exceeds available IUs. Maximum: ${ethers.utils.formatEther(availableIUs)} IU tokens`);
  }

  // Calculate CEL tokens required
  const celRequired = iuAmount.mul(projectConfig.pricePerUnit).div(ethers.utils.parseEther("1"));
  console.log(`Required CEL tokens: ${ethers.utils.formatEther(celRequired)} CEL`);

  // Check CEL token balance and allowance
  const balance = await celToken.balanceOf(signer.address);
  console.log(`CEL Token balance: ${ethers.utils.formatEther(balance)} CEL`);

  if (balance.lt(celRequired)) {
    throw new Error(`Insufficient CEL token balance. Required: ${ethers.utils.formatEther(celRequired)} CEL, Available: ${ethers.utils.formatEther(balance)} CEL`);
  }

  const allowance = await celToken.allowance(signer.address, innovationUnits.address);
  console.log(`Current allowance to InnovationUnits contract: ${ethers.utils.formatEther(allowance)} CEL`);

  // Approve tokens if necessary
  if (allowance.lt(celRequired)) {
    console.log(`Approving ${ethers.utils.formatEther(celRequired)} CEL tokens to be spent by the InnovationUnits contract...`);
    const approveTx = await celToken.approve(innovationUnits.address, celRequired);
    console.log(`Approval transaction sent: ${approveTx.hash}`);
    await approveTx.wait();
    console.log("Approval transaction confirmed");
  }

  // Purchase IUs
  console.log(`Purchasing ${ethers.utils.formatEther(iuAmount)} IU tokens for ${ethers.utils.formatEther(celRequired)} CEL...`);
  const purchaseTx = await innovationUnits.purchaseIUs(projectId, iuAmount);
  console.log(`Purchase transaction sent: ${purchaseTx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await purchaseTx.wait();
  console.log(`IUs purchased successfully in block ${receipt.blockNumber}`);

  // Get updated IU balance
  const iuBalance = await innovationUnits.balanceOf(signer.address, projectId);
  console.log(`
Purchase completed successfully!
Your IU balance: ${ethers.utils.formatEther(iuBalance)} IU tokens
Transaction: ${purchaseTx.hash}
  `);

  // Get ownership share
  const ownershipShare = await innovationUnits.getOwnershipShare(signer.address, projectId);
  console.log(`Your ownership share in the project: ${ethers.utils.formatEther(ownershipShare)}%`);

  // Return purchase details for potential use in frontend or other scripts
  return {
    projectId,
    purchaserAddress: signer.address,
    iuAmount: ethers.utils.formatEther(iuAmount),
    celAmount: ethers.utils.formatEther(celRequired),
    totalIuBalance: ethers.utils.formatEther(iuBalance),
    ownershipShare: ethers.utils.formatEther(ownershipShare),
    transaction: purchaseTx.hash
  };
}

// Export the purchase function for use in other scripts or frontend
async function purchaseInnovationUnits(config) {
  const {
    projectId,
    iuAmount,
    deploymentInfo,
    signer
  } = config;

  // Ensure amount is a BigNumber
  const iuAmountBN = typeof iuAmount === 'string' 
    ? ethers.utils.parseEther(iuAmount)
    : iuAmount;

  // Connect to contracts
  const celTokenAbi = require('../artifacts/contracts/CELToken.sol/CELToken.json').abi;
  const celToken = new ethers.Contract(
    deploymentInfo.celToken,
    celTokenAbi,
    signer
  );

  const innovationUnitsAbi = require('../artifacts/contracts/InnovationUnits.sol/InnovationUnits.json').abi;
  const innovationUnits = new ethers.Contract(
    deploymentInfo.innovationUnits,
    innovationUnitsAbi,
    signer
  );

  // Get project config for price calculation
  const projectConfig = await innovationUnits.getProjectConfig(projectId);
  
  // Calculate CEL tokens required
  const celRequired = iuAmountBN.mul(projectConfig.pricePerUnit).div(ethers.utils.parseEther("1"));

  // Check and set allowance if needed
  const allowance = await celToken.allowance(signer.address, innovationUnits.address);
  if (allowance.lt(celRequired)) {
    const approveTx = await celToken.approve(innovationUnits.address, celRequired);
    await approveTx.wait();
  }

  // Purchase IUs
  const purchaseTx = await innovationUnits.purchaseIUs(projectId, iuAmountBN);
  const receipt = await purchaseTx.wait();
  
  // Get updated IU balance and ownership share
  const iuBalance = await innovationUnits.balanceOf(signer.address, projectId);
  const ownershipShare = await innovationUnits.getOwnershipShare(signer.address, projectId);
  
  return {
    projectId,
    purchaserAddress: signer.address,
    iuAmount: ethers.utils.formatEther(iuAmountBN),
    celAmount: ethers.utils.formatEther(celRequired),
    totalIuBalance: ethers.utils.formatEther(iuBalance),
    ownershipShare: ethers.utils.formatEther(ownershipShare),
    transaction: purchaseTx.hash,
    blockNumber: receipt.blockNumber,
    success: true
  };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  main()
    .then((result) => {
      console.log("Purchase result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  purchaseInnovationUnits
}; 