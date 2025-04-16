// Script to stake CEL tokens for a project
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
Usage: npx hardhat run scripts/stake.js --network <network> <project_id> <amount>

Arguments:
  project_id - ID of the project to stake for
  amount     - Amount of CEL tokens to stake
    `);
    process.exit(1);
  }

  const projectId = parseInt(args[0]);
  const amount = ethers.utils.parseEther(args[1]);

  // Validate inputs
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }

  console.log(`
Staking CEL tokens:
Project ID: ${projectId}
Amount: ${ethers.utils.formatEther(amount)} CEL
  `);

  // Load deployment information
  const deploymentInfo = loadDeploymentInfo();
  console.log(`Using deployment on network: ${deploymentInfo.network}`);

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);

  // Connect to the contracts
  const CELToken = await ethers.getContractFactory("CELToken");
  const celToken = CELToken.attach(deploymentInfo.celToken);
  
  const Staking = await ethers.getContractFactory("Staking");
  const staking = Staking.attach(deploymentInfo.staking);
  
  const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
  const projectFactory = ProjectFactory.attach(deploymentInfo.projectFactory);
  
  // Check if project exists
  const projectExists = await projectFactory.projectExists(projectId);
  if (!projectExists) {
    throw new Error(`Project with ID ${projectId} does not exist`);
  }

  // Check staking pool enabled status
  const stakingPool = await staking.projectPools(projectId);
  if (!stakingPool.enabled) {
    throw new Error(`Staking pool for project ${projectId} is not enabled`);
  }

  // Check if staking limit is enforced and not exceeded
  if (stakingPool.stakeLimit.gt(0)) {
    const totalStaked = await staking.getTotalStaked(projectId);
    const availableStakeLimit = stakingPool.stakeLimit.sub(totalStaked);
    
    if (availableStakeLimit.lt(amount)) {
      throw new Error(`Stake limit exceeded. Available limit: ${ethers.utils.formatEther(availableStakeLimit)} CEL`);
    }
    
    console.log(`Stake limit: ${ethers.utils.formatEther(stakingPool.stakeLimit)} CEL`);
    console.log(`Total staked: ${ethers.utils.formatEther(totalStaked)} CEL`);
    console.log(`Available stake limit: ${ethers.utils.formatEther(availableStakeLimit)} CEL`);
  } else {
    console.log("No stake limit is enforced for this project");
  }

  // Check user's CEL token balance
  const balance = await celToken.balanceOf(signer.address);
  if (balance.lt(amount)) {
    throw new Error(`Insufficient CEL token balance. Available: ${ethers.utils.formatEther(balance)} CEL`);
  }
  console.log(`Your CEL token balance: ${ethers.utils.formatEther(balance)} CEL`);

  // Check allowance
  const allowance = await celToken.allowance(signer.address, staking.address);
  if (allowance.lt(amount)) {
    console.log(`Approving ${ethers.utils.formatEther(amount)} CEL tokens for staking contract...`);
    const approveTx = await celToken.approve(staking.address, amount);
    await approveTx.wait();
    console.log(`Approval transaction: ${approveTx.hash}`);
  } else {
    console.log(`You have already approved ${ethers.utils.formatEther(allowance)} CEL tokens for staking contract`);
  }

  // Stake tokens
  console.log(`Staking ${ethers.utils.formatEther(amount)} CEL tokens...`);
  const tx = await staking.stake(projectId, amount);
  console.log(`Transaction sent: ${tx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log(`Tokens staked successfully in block ${receipt.blockNumber}`);

  // Get staked amount
  const stakedAmount = await staking.getStaked(signer.address, projectId);
  console.log(`Your total staked amount: ${ethers.utils.formatEther(stakedAmount)} CEL`);

  // Get minimum staking period
  const minStakingPeriod = await staking.getMinimumStakingPeriod(projectId);
  const stakingTime = await staking.getStakingTime(signer.address, projectId);
  const unlockTime = stakingTime.add(minStakingPeriod);
  const now = Math.floor(Date.now() / 1000);
  const remainingTime = unlockTime.toNumber() - now;

  console.log(`Minimum staking period: ${minStakingPeriod.toNumber() / 86400} days`);
  console.log(`Tokens will be unlocked on: ${new Date(unlockTime.toNumber() * 1000).toLocaleString()}`);
  if (remainingTime > 0) {
    console.log(`Remaining lock time: ${remainingTime / 86400} days`);
  } else {
    console.log("Tokens are already unlocked");
  }

  console.log(`
Staking completed successfully!
Project ID: ${projectId}
Staked Amount: ${ethers.utils.formatEther(amount)} CEL
Total Staked: ${ethers.utils.formatEther(stakedAmount)} CEL
Transaction: ${tx.hash}
  `);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 