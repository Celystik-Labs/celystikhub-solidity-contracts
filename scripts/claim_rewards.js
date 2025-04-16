// Script to claim rewards from a project
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
  if (args.length < 1) {
    console.error(`
Usage: npx hardhat run scripts/claim_rewards.js --network <network> <project_id>

Arguments:
  project_id     - ID of the project to claim rewards from
    `);
    process.exit(1);
  }

  const projectId = parseInt(args[0]);

  // Validate inputs
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }

  console.log(`
Claiming rewards from project:
Project ID: ${projectId}
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

  const EmissionController = await ethers.getContractFactory("EmissionController");
  const emissionController = EmissionController.attach(deploymentInfo.emissionController);

  const Staking = await ethers.getContractFactory("Staking");
  const staking = Staking.attach(deploymentInfo.staking);

  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const innovationUnits = InnovationUnits.attach(deploymentInfo.innovationUnits);

  // Check if project exists
  const exists = await emissionController.projectExists(projectId);
  if (!exists) {
    throw new Error(`Project with ID ${projectId} does not exist`);
  }

  // Get user's stake and IU balance to check eligibility
  const userStake = await staking.getUserStake(signer.address, projectId);
  const iuBalance = await innovationUnits.balanceOf(signer.address, projectId);

  console.log(`
Your current positions:
Staked CEL: ${ethers.utils.formatEther(userStake.amount)} CEL
IU Balance: ${ethers.utils.formatEther(iuBalance)} IU tokens
  `);

  if (userStake.amount.isZero() && iuBalance.isZero()) {
    throw new Error("You don't have any staked CEL or IU tokens for this project");
  }

  // Check available rewards (if API supports this)
  try {
    const availableRewards = await emissionController.getAvailableRewards(projectId, signer.address);
    console.log(`Available rewards: ${ethers.utils.formatEther(availableRewards)} CEL tokens`);

    if (availableRewards.isZero()) {
      console.log("No rewards available to claim");
      return {
        projectId,
        claimed: false,
        claimedAmount: "0",
        reason: "No rewards available"
      };
    }
  } catch (error) {
    console.log("Could not check available rewards. Proceeding with claim...");
  }

  // Get initial balance for comparison
  const initialBalance = await celToken.balanceOf(signer.address);
  console.log(`Initial CEL balance: ${ethers.utils.formatEther(initialBalance)} CEL`);

  // Claim rewards
  console.log(`Claiming rewards from project ${projectId}...`);
  const claimTx = await emissionController.claimRewards(projectId);
  console.log(`Claim transaction sent: ${claimTx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await claimTx.wait();
  console.log(`Rewards claimed successfully in block ${receipt.blockNumber}`);

  // Calculate claimed amount by checking balance difference
  const newBalance = await celToken.balanceOf(signer.address);
  const claimedAmount = newBalance.sub(initialBalance);

  console.log(`
Reward claim completed successfully!
Claimed amount: ${ethers.utils.formatEther(claimedAmount)} CEL tokens
New CEL balance: ${ethers.utils.formatEther(newBalance)} CEL
Transaction: ${claimTx.hash}
  `);

  // Check if the user's last reward claim timestamp was updated
  const updatedUserStake = await staking.getUserStake(signer.address, projectId);
  if (!userStake.amount.isZero()) {
    console.log(`Last rewards claimed timestamp updated to: ${new Date(updatedUserStake.lastRewardsClaimed.toNumber() * 1000).toLocaleString()}`);
  }

  // Return claim details for potential use in frontend or other scripts
  return {
    projectId,
    userAddress: signer.address,
    claimedAmount: ethers.utils.formatEther(claimedAmount),
    newBalance: ethers.utils.formatEther(newBalance),
    transaction: claimTx.hash,
    claimed: true
  };
}

// Export the claim function for use in other scripts or frontend
async function claimRewards(config) {
  const {
    projectId,
    deploymentInfo,
    signer
  } = config;

  // Connect to contracts
  const celTokenAbi = require('../artifacts/contracts/CELToken.sol/CELToken.json').abi;
  const celToken = new ethers.Contract(
    deploymentInfo.celToken,
    celTokenAbi,
    signer
  );

  const emissionControllerAbi = require('../artifacts/contracts/EmissionController.sol/EmissionController.json').abi;
  const emissionController = new ethers.Contract(
    deploymentInfo.emissionController,
    emissionControllerAbi,
    signer
  );

  // Get initial balance
  const initialBalance = await celToken.balanceOf(signer.address);
  
  // Check available rewards if possible
  let availableRewards = ethers.BigNumber.from(0);
  try {
    availableRewards = await emissionController.getAvailableRewards(projectId, signer.address);
    
    if (availableRewards.isZero()) {
      return {
        projectId,
        userAddress: signer.address,
        claimedAmount: "0",
        newBalance: ethers.utils.formatEther(initialBalance),
        claimed: false,
        reason: "No rewards available"
      };
    }
  } catch (error) {
    // Continue with claim even if we can't check available rewards
  }
  
  // Claim rewards
  const claimTx = await emissionController.claimRewards(projectId);
  const receipt = await claimTx.wait();
  
  // Calculate claimed amount
  const newBalance = await celToken.balanceOf(signer.address);
  const claimedAmount = newBalance.sub(initialBalance);
  
  return {
    projectId,
    userAddress: signer.address,
    claimedAmount: ethers.utils.formatEther(claimedAmount),
    newBalance: ethers.utils.formatEther(newBalance),
    transaction: claimTx.hash,
    blockNumber: receipt.blockNumber,
    claimed: true,
    success: true
  };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  main()
    .then((result) => {
      console.log("Claim result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  claimRewards
}; 