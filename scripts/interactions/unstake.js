const { getContracts, logTransaction, formatAmount } = require("./utils");
const { ethers } = require("hardhat");

async function main() {
  console.log("=== Unstake CEL Tokens Script ===");

  // Parse command line arguments
  let projectId = 0; // Default to project ID 0
  let stakeIndex = null; // No default, must be provided
  
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--project-id' && i + 1 < process.argv.length) {
      projectId = parseInt(process.argv[i + 1]);
    }
    if (process.argv[i] === '--stake-index' && i + 1 < process.argv.length) {
      stakeIndex = parseInt(process.argv[i + 1]);
    }
  }
  
  // Validate stake index was provided
  if (stakeIndex === null) {
    console.error("Error: Missing required parameter --stake-index");
    console.error("Usage: npx hardhat run scripts/interactions/unstake.js -- --project-id <project-id> --stake-index <stake-index>");
    console.error("To get your stake indexes, run: npx hardhat run scripts/interactions/getStakeIndexes.js");
    process.exit(1);
  }

  // Get contract instances
  const { celToken, projectStaking, signer } = await getContracts();
  
  console.log(`Staker Address: ${signer.address}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Stake Index: ${stakeIndex}`);
  
  try {
    // Get all active stakes for the user on this project
    const [indexes, amounts, startTimes, unlockTimes, lockDurations, scores] = 
      await projectStaking.getUserActiveStakes(projectId, signer.address);
    
    // Find the specific stake by index
    const stakePosition = indexes.findIndex(idx => idx.eq(stakeIndex));
    
    if (stakePosition === -1) {
      console.error(`\nError: No active stake found with index ${stakeIndex} for project ${projectId}`);
      console.error("Run 'npx hardhat run scripts/interactions/getStakeIndexes.js' to see valid stake indexes");
      return;
    }
    
    // Extract the stake info
    const amount = amounts[stakePosition];
    const startTime = startTimes[stakePosition];
    const unlockTime = unlockTimes[stakePosition];
    const lockDuration = lockDurations[stakePosition];
    const score = scores[stakePosition];
    
    // Convert from seconds to days for display
    const lockDurationDays = Math.floor(lockDuration.toNumber() / (24 * 60 * 60));
    
    console.log(`\nStake Information:`);
    console.log(`- Amount: ${formatAmount(amount)} CEL`);
    console.log(`- Start Time: ${new Date(startTime.toNumber() * 1000).toLocaleString()}`);
    console.log(`- Unlock Time: ${new Date(unlockTime.toNumber() * 1000).toLocaleString()}`);
    console.log(`- Lock Duration: ${lockDurationDays} days`);
    console.log(`- Score: ${formatAmount(score)}`);
    
    // Calculate lock end time
    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    console.log(`\nLock Status:`);
    console.log(`- Lock Ends At: ${new Date(unlockTime.toNumber() * 1000).toLocaleString()}`);
    
    if (currentTimestamp < unlockTime.toNumber()) {
      const timeRemaining = unlockTime.toNumber() - currentTimestamp;
      const daysRemaining = Math.ceil(timeRemaining / 86400);
      console.log(`- Lock still active. ${daysRemaining} days remaining.`);
      console.log(`- Warning: Early unstaking may result in penalties.`);
    } else {
      console.log(`- Lock period has ended. Can unstake without penalties.`);
    }
    
    // Check unstake availability
    const [canUnstake, _] = await projectStaking.checkUnstakeAvailability(
      projectId,
      signer.address,
      stakeIndex
    );
    
    if (!canUnstake) {
      console.error("\nError: This stake is not available for unstaking yet");
      return;
    }
    
    // Get CEL balance before unstaking
    const celBalanceBefore = await celToken.balanceOf(signer.address);
    console.log(`\nCEL Balance Before: ${formatAmount(celBalanceBefore)} CEL`);
    
    // Confirm unstaking action
    console.log(`\nAttempting to unstake ${formatAmount(amount)} CEL from project ${projectId}...`);
    
    // Unstake CEL tokens
    const unstakeTx = await projectStaking.unstake(projectId, stakeIndex);
    await logTransaction("Unstake CEL Tokens", unstakeTx);
    
    // Get CEL balance after unstaking
    const celBalanceAfter = await celToken.balanceOf(signer.address);
    const amountReceived = celBalanceAfter.sub(celBalanceBefore);
    
    console.log(`\nTransaction Summary:`);
    console.log(`- CEL Balance Before: ${formatAmount(celBalanceBefore)} CEL`);
    console.log(`- CEL Balance After: ${formatAmount(celBalanceAfter)} CEL`);
    console.log(`- CEL Received: ${formatAmount(amountReceived)} CEL`);
    
    // Check if the stake was successfully removed
    const [newIndexes] = await projectStaking.getUserActiveStakes(projectId, signer.address);
    const stakeStillExists = newIndexes.some(idx => idx.eq(stakeIndex));
    
    if (!stakeStillExists) {
      console.log(`\nStake has been successfully removed from project ${projectId}.`);
    } else {
      console.log(`\nWarning: Stake may not have been fully removed. Please check again.`);
    }
    
    if (amountReceived.lt(amount)) {
      const penalty = amount.sub(amountReceived);
      console.log(`\nPenalty Applied: ${formatAmount(penalty)} CEL (${(penalty.mul(100).div(amount)).toString()}% of stake)`);
    }
    
    console.log(`\nSuccessfully unstaked from project ${projectId}!`);
    
  } catch (error) {
    console.error("Error unstaking CEL tokens:", error);
    if (error.reason) {
      console.error(`Contract reverted with reason: ${error.reason}`);
    }
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  }); 