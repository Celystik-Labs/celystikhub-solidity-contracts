// Script to unstake CEL tokens from a project
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
Usage: npx hardhat run scripts/unstake_tokens.js --network <network> <project_id> <amount>

Arguments:
  project_id     - ID of the project to unstake from
  amount         - Amount of CEL tokens to unstake (e.g., "1000" or "all" to unstake everything)
    `);
    process.exit(1);
  }

  const projectId = parseInt(args[0]);
  const amountInput = args[1];

  // Validate project ID
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }

  // Load deployment information
  const deploymentInfo = loadDeploymentInfo();
  console.log(`Using deployment on network: ${deploymentInfo.network}`);

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);

  // Connect to contracts
  const Staking = await ethers.getContractFactory("Staking");
  const staking = Staking.attach(deploymentInfo.staking);

  const EmissionController = await ethers.getContractFactory("EmissionController");
  const emissionController = EmissionController.attach(deploymentInfo.emissionController);

  // Check if project exists
  const exists = await emissionController.projectExists(projectId);
  if (!exists) {
    throw new Error(`Project with ID ${projectId} does not exist`);
  }

  // Get user's stake
  const userStake = await staking.getUserStake(signer.address, projectId);
  console.log(`
Your current stake:
Staked amount: ${ethers.utils.formatEther(userStake.amount)} CEL
Staking since: ${new Date(userStake.since.toNumber() * 1000).toLocaleString()}
Last rewards claimed: ${new Date(userStake.lastRewardsClaimed.toNumber() * 1000).toLocaleString()}
  `);

  if (userStake.amount.isZero()) {
    throw new Error("You don't have any CEL tokens staked on this project");
  }

  // Determine unstake amount
  let amount;
  if (amountInput.toLowerCase() === "all") {
    amount = userStake.amount;
    console.log(`Unstaking all ${ethers.utils.formatEther(amount)} CEL tokens`);
  } else {
    amount = ethers.utils.parseEther(amountInput);
    if (amount.gt(userStake.amount)) {
      throw new Error(`Amount exceeds your staked amount. Maximum: ${ethers.utils.formatEther(userStake.amount)} CEL`);
    }
    console.log(`Unstaking ${ethers.utils.formatEther(amount)} CEL tokens out of ${ethers.utils.formatEther(userStake.amount)} CEL`);
  }

  // Check if user can unstake (minimum staking period)
  const canUnstake = await staking.canUnstake(signer.address, projectId);
  if (!canUnstake) {
    const remainingLockTime = await staking.getRemainingLockTime(signer.address, projectId);
    const remainingDays = remainingLockTime.toNumber() / 86400; // Convert seconds to days
    throw new Error(`You cannot unstake yet. You need to wait ${remainingDays.toFixed(2)} more days`);
  }

  // Unstake tokens
  console.log(`Unstaking ${ethers.utils.formatEther(amount)} CEL tokens from project ${projectId}...`);
  const unstakeTx = await staking.unstake(projectId, amount);
  console.log(`Unstake transaction sent: ${unstakeTx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await unstakeTx.wait();
  console.log(`Tokens unstaked successfully in block ${receipt.blockNumber}`);

  // Get updated stake information
  const updatedUserStake = await staking.getUserStake(signer.address, projectId);
  const updatedStakingPool = await staking.getProjectStakingPool(projectId);

  console.log(`
Unstaking completed successfully!
Your remaining stake: ${ethers.utils.formatEther(updatedUserStake.amount)} CEL
Total project stake: ${ethers.utils.formatEther(updatedStakingPool.totalStaked)} CEL
Transaction: ${unstakeTx.hash}
  `);

  // Return unstaking details for potential use in frontend or other scripts
  return {
    projectId,
    userAddress: signer.address,
    amountUnstaked: ethers.utils.formatEther(amount),
    remainingStake: ethers.utils.formatEther(updatedUserStake.amount),
    projectTotalStaked: ethers.utils.formatEther(updatedStakingPool.totalStaked),
    transaction: unstakeTx.hash
  };
}

// Export the unstaking function for use in other scripts or frontend
async function unstakeTokens(config) {
  const {
    projectId,
    amount,
    unstakeAll = false,
    deploymentInfo,
    signer
  } = config;

  // Connect to Staking
  const stakingAbi = require('../artifacts/contracts/Staking.sol/Staking.json').abi;
  const staking = new ethers.Contract(
    deploymentInfo.staking,
    stakingAbi,
    signer
  );

  // Get user's current stake
  const userStake = await staking.getUserStake(signer.address, projectId);
  
  // Determine unstake amount
  let unstakeAmount;
  if (unstakeAll) {
    unstakeAmount = userStake.amount;
  } else {
    unstakeAmount = typeof amount === 'string' 
      ? ethers.utils.parseEther(amount)
      : amount;
  }

  // Unstake tokens
  const unstakeTx = await staking.unstake(projectId, unstakeAmount);
  const receipt = await unstakeTx.wait();
  
  // Get updated stake information
  const updatedUserStake = await staking.getUserStake(signer.address, projectId);
  const updatedStakingPool = await staking.getProjectStakingPool(projectId);
  
  return {
    projectId,
    userAddress: signer.address,
    amountUnstaked: ethers.utils.formatEther(unstakeAmount),
    remainingStake: ethers.utils.formatEther(updatedUserStake.amount),
    projectTotalStaked: ethers.utils.formatEther(updatedStakingPool.totalStaked),
    transaction: unstakeTx.hash,
    blockNumber: receipt.blockNumber,
    success: true
  };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  main()
    .then((result) => {
      console.log("Unstaking result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  unstakeTokens
}; 