const { getContracts, logTransaction, formatAmount } = require("./utils");

async function main() {
  console.log("=== Unstake CEL Tokens Script ===");

  // Get contract instances
  const { celToken, projectStaking, signer } = await getContracts();
  
  // Parameters
  const projectId = 0; // Change this to your project ID
  
  console.log(`Staker Address: ${signer.address}`);
  console.log(`Project ID: ${projectId}`);
  
  try {
    // Check current stake information
    const stake = await projectStaking.projectStakes(projectId, signer.address);
    console.log(`\nCurrent Stake Information:`);
    console.log(`- Staked Amount: ${formatAmount(stake.amount)} CEL`);
    console.log(`- Staked At: ${new Date(stake.stakedAt.toNumber() * 1000).toLocaleDateString()}`);
    console.log(`- Lock Duration: ${stake.lockDuration} days`);
    console.log(`- Score: ${formatAmount(stake.score)}`);
    
    // Calculate lock end time
    const lockEndTimestamp = stake.stakedAt.toNumber() + (stake.lockDuration * 86400);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const lockEndsAt = new Date(lockEndTimestamp * 1000).toLocaleString();
    
    console.log(`\nLock Status:`);
    console.log(`- Lock Ends At: ${lockEndsAt}`);
    
    if (currentTimestamp < lockEndTimestamp) {
      const timeRemaining = lockEndTimestamp - currentTimestamp;
      const daysRemaining = Math.ceil(timeRemaining / 86400);
      console.log(`- Lock still active. ${daysRemaining} days remaining.`);
      console.log(`- Warning: Early unstaking will result in penalties.`);
    } else {
      console.log(`- Lock period has ended. Can unstake without penalties.`);
    }
    
    // Get CEL balance before unstaking
    const celBalanceBefore = await celToken.balanceOf(signer.address);
    console.log(`\nCEL Balance Before: ${formatAmount(celBalanceBefore)} CEL`);
    
    // Confirm unstaking action
    console.log(`\nAttempting to unstake ${formatAmount(stake.amount)} CEL from project ${projectId}...`);
    
    // Unstake CEL tokens
    const unstakeTx = await projectStaking.unstake(projectId);
    await logTransaction("Unstake CEL Tokens", unstakeTx);
    
    // Get CEL balance after unstaking
    const celBalanceAfter = await celToken.balanceOf(signer.address);
    const amountReceived = celBalanceAfter.sub(celBalanceBefore);
    
    // Check if stake has been removed
    const stakeAfter = await projectStaking.projectStakes(projectId, signer.address);
    
    console.log(`\nTransaction Summary:`);
    console.log(`- CEL Balance Before: ${formatAmount(celBalanceBefore)} CEL`);
    console.log(`- CEL Balance After: ${formatAmount(celBalanceAfter)} CEL`);
    console.log(`- CEL Received: ${formatAmount(amountReceived)} CEL`);
    
    if (stakeAfter.amount.isZero()) {
      console.log(`\nStake has been fully removed from project ${projectId}.`);
    } else {
      console.log(`\nWarning: Stake not fully removed. Remaining: ${formatAmount(stakeAfter.amount)} CEL`);
    }
    
    if (amountReceived.lt(stake.amount)) {
      const penalty = stake.amount.sub(amountReceived);
      console.log(`\nPenalty Applied: ${formatAmount(penalty)} CEL (${(penalty.mul(100).div(stake.amount)).toString()}% of stake)`);
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