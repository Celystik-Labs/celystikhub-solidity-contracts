// Script to stake CEL tokens to a project
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
Usage: npx hardhat run scripts/stake_tokens.js --network <network> <project_id> <amount>

Arguments:
  project_id     - ID of the project to stake on
  amount         - Amount of CEL tokens to stake (e.g., "1000")
    `);
    process.exit(1);
  }

  const projectId = parseInt(args[0]);
  const amount = ethers.utils.parseEther(args[1]);

  // Validate inputs
  if (isNaN(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive integer");
  }

  if (amount.lte(ethers.constants.Zero)) {
    throw new Error("Stake amount must be greater than zero");
  }

  console.log(`
Staking tokens:
Project ID: ${projectId}
Amount: ${ethers.utils.formatEther(amount)} CEL tokens
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

  const Staking = await ethers.getContractFactory("Staking");
  const staking = Staking.attach(deploymentInfo.staking);

  const EmissionController = await ethers.getContractFactory("EmissionController");
  const emissionController = EmissionController.attach(deploymentInfo.emissionController);

  // Check if project exists
  const exists = await emissionController.projectExists(projectId);
  if (!exists) {
    throw new Error(`Project with ID ${projectId} does not exist`);
  }

  // Get staking pool info
  const stakingPool = await staking.getProjectStakingPool(projectId);
  console.log(`
Staking pool information:
Total Staked: ${ethers.utils.formatEther(stakingPool.totalStaked)} CEL
Stake Limit: ${stakingPool.stakeLimit.isZero() ? "No limit" : ethers.utils.formatEther(stakingPool.stakeLimit) + " CEL"}
Enabled: ${stakingPool.enabled}
Min Staking Period: ${stakingPool.minStakingPeriod.toString() / 86400} days
  `);

  if (!stakingPool.enabled) {
    throw new Error("Staking is not enabled for this project");
  }

  if (!stakingPool.stakeLimit.isZero() && stakingPool.totalStaked.add(amount).gt(stakingPool.stakeLimit)) {
    throw new Error(`Stake would exceed the project's stake limit. Maximum additional stake allowed: ${ethers.utils.formatEther(stakingPool.stakeLimit.sub(stakingPool.totalStaked))} CEL`);
  }

  // Check CEL token balance and allowance
  const balance = await celToken.balanceOf(signer.address);
  console.log(`CEL Token balance: ${ethers.utils.formatEther(balance)} CEL`);

  if (balance.lt(amount)) {
    throw new Error(`Insufficient CEL token balance. Required: ${ethers.utils.formatEther(amount)} CEL, Available: ${ethers.utils.formatEther(balance)} CEL`);
  }

  const allowance = await celToken.allowance(signer.address, staking.address);
  console.log(`Current allowance to Staking contract: ${ethers.utils.formatEther(allowance)} CEL`);

  // Approve tokens if necessary
  if (allowance.lt(amount)) {
    console.log(`Approving ${ethers.utils.formatEther(amount)} CEL tokens to be spent by the Staking contract...`);
    const approveTx = await celToken.approve(staking.address, amount);
    console.log(`Approval transaction sent: ${approveTx.hash}`);
    await approveTx.wait();
    console.log("Approval transaction confirmed");
  }

  // Stake tokens
  console.log(`Staking ${ethers.utils.formatEther(amount)} CEL tokens to project ${projectId}...`);
  const stakeTx = await staking.stake(projectId, amount);
  console.log(`Stake transaction sent: ${stakeTx.hash}`);
  console.log("Waiting for confirmation...");
  
  const receipt = await stakeTx.wait();
  console.log(`Tokens staked successfully in block ${receipt.blockNumber}`);

  // Get updated stake information
  const userStake = await staking.getUserStake(signer.address, projectId);
  const userStakeShare = await staking.getUserStakeShare(signer.address, projectId);
  const updatedStakingPool = await staking.getProjectStakingPool(projectId);

  console.log(`
Staking completed successfully!
Your stake: ${ethers.utils.formatEther(userStake.amount)} CEL
Your stake share: ${ethers.utils.formatEther(userStakeShare)}%
Staking since: ${new Date(userStake.since.toNumber() * 1000).toLocaleString()}
Total project stake: ${ethers.utils.formatEther(updatedStakingPool.totalStaked)} CEL
Transaction: ${stakeTx.hash}
  `);

  // Return staking details for potential use in frontend or other scripts
  return {
    projectId,
    stakerAddress: signer.address,
    amount: ethers.utils.formatEther(amount),
    totalStaked: ethers.utils.formatEther(userStake.amount),
    stakeShare: ethers.utils.formatEther(userStakeShare),
    stakeSince: new Date(userStake.since.toNumber() * 1000).toISOString(),
    projectTotalStaked: ethers.utils.formatEther(updatedStakingPool.totalStaked),
    transaction: stakeTx.hash
  };
}

// Export the staking function for use in other scripts or frontend
async function stakeTokens(config) {
  const {
    projectId,
    amount,
    deploymentInfo,
    signer
  } = config;

  // Ensure amount is a BigNumber
  const amountBN = typeof amount === 'string' 
    ? ethers.utils.parseEther(amount)
    : amount;

  // Connect to CEL Token
  const celTokenAbi = require('../artifacts/contracts/CELToken.sol/CELToken.json').abi;
  const celToken = new ethers.Contract(
    deploymentInfo.celToken,
    celTokenAbi,
    signer
  );

  // Connect to Staking
  const stakingAbi = require('../artifacts/contracts/Staking.sol/Staking.json').abi;
  const staking = new ethers.Contract(
    deploymentInfo.staking,
    stakingAbi,
    signer
  );

  // Check and set allowance if needed
  const allowance = await celToken.allowance(signer.address, staking.address);
  if (allowance.lt(amountBN)) {
    const approveTx = await celToken.approve(staking.address, amountBN);
    await approveTx.wait();
  }

  // Stake tokens
  const stakeTx = await staking.stake(projectId, amountBN);
  const receipt = await stakeTx.wait();
  
  // Get updated stake information
  const userStake = await staking.getUserStake(signer.address, projectId);
  const userStakeShare = await staking.getUserStakeShare(signer.address, projectId);
  const updatedStakingPool = await staking.getProjectStakingPool(projectId);
  
  return {
    projectId,
    stakerAddress: signer.address,
    amount: ethers.utils.formatEther(amountBN),
    totalStaked: ethers.utils.formatEther(userStake.amount),
    stakeShare: ethers.utils.formatEther(userStakeShare),
    stakeSince: new Date(userStake.since.toNumber() * 1000).toISOString(),
    projectTotalStaked: ethers.utils.formatEther(updatedStakingPool.totalStaked),
    transaction: stakeTx.hash,
    blockNumber: receipt.blockNumber,
    success: true
  };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  main()
    .then((result) => {
      console.log("Staking result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  stakeTokens
}; 