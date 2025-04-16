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
Usage: npx hardhat run scripts/unstake.js --network <network> <project_id> <amount>

Arguments:
  project_id - ID of the project to unstake from
  amount     - Amount of CEL tokens to unstake (use "all" to unstake everything)
    `);
    process.exit(1);
  }

  const projectId = parseInt(args[0]);
  const amountArg = args[1];

  // Validate inputs
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }

  // Load deployment information
  const deploymentInfo = loadDeploymentInfo();
  console.log(`Using deployment on network: ${deploymentInfo.network}`);

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);

  // Connect to the contracts
  const Staking = await ethers.getContractFactory("Staking");
  const staking = Staking.attach(deploymentInfo.staking);
  
  const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
  const projectFactory = ProjectFactory.attach(deploymentInfo.projectFactory);
  
  // Check if project exists
  const projectExists = await projectFactory.projectExists(projectId);
  if (!projectExists) {
    throw new Error(`Project with ID ${projectId} does not exist`);
  }

  // Get user's staked amount
  const stakedAmount = await staking.getStaked(signer.address, projectId);
  if (stakedAmount.eq(0)) {
    throw new Error(`You have no staked CEL tokens for project ${projectId}`);
  }
  console.log(`Your staked amount: ${ethers.utils.formatEther(stakedAmount)} CEL`);

  // Check if staking period has passed
  const minStakingPeriod = await staking.getMinimumStakingPeriod(projectId);
  const stakingTime = await staking.getStakingTime(signer.address, projectId);
  const unlockTime = stakingTime.add(minStakingPeriod);
  const now = Math.floor(Date.now() / 1000);
  const remainingTime = unlockTime.toNumber() - now;

  if (remainingTime > 0) {
    console.log(`
Warning: Minimum staking period has not passed yet!
Minimum staking period: ${minStakingPeriod.toNumber() / 86400} days
Tokens will be unlocked on: ${new Date(unlockTime.toNumber() * 1000).toLocaleString()}
Remaining lock time: ${remainingTime / 86400} days

Unstaking before the minimum period may result in penalties or transaction failure.
    `);
    
    // In a real-world script, you might want to ask for confirmation here
  } else {
    console.log("Minimum staking period has passed. You can unstake your tokens without penalties.");
  }

  // Determine amount to unstake
  let amount;
  if (amountArg.toLowerCase() === "all") {
    amount = stakedAmount;
    console.log(`Unstaking all your staked tokens (${ethers.utils.formatEther(amount)} CEL)`);
  } else {
    amount = ethers.utils.parseEther(amountArg);
    if (amount.gt(stakedAmount)) {
      throw new Error(`Unstake amount exceeds your staked amount. Available: ${ethers.utils.formatEther(stakedAmount)} CEL`);
    }
    console.log(`Unstaking ${ethers.utils.formatEther(amount)} CEL tokens`);
  }

  // Unstake tokens
  console.log("Unstaking tokens...");
  const tx = await staking.unstake(projectId, amount);
  console.log(`Transaction sent: ${tx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log(`Tokens unstaked successfully in block ${receipt.blockNumber}`);

  // Get remaining staked amount
  const remainingStaked = await staking.getStaked(signer.address, projectId);
  console.log(`Remaining staked amount: ${ethers.utils.formatEther(remainingStaked)} CEL`);

  console.log(`
Unstaking completed successfully!
Project ID: ${projectId}
Unstaked Amount: ${ethers.utils.formatEther(amount)} CEL
Remaining Staked: ${ethers.utils.formatEther(remainingStaked)} CEL
Transaction: ${tx.hash}
  `);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 