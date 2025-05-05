const { getContracts, logTransaction, parseAmount, formatAmount } = require("./utils");

async function main() {
  console.log("=== Stake CEL Tokens Script ===");

  // Get contract instances
  const { celToken, projectStaking, signer } = await getContracts();
  
  // Parameters
  const projectId = 0; // Change this to your project ID
  const stakeAmount = parseAmount("1000"); // 1000 CEL tokens
  const lockDurationDays = 30; // 30-day lock duration
  
  console.log(`Staker Address: ${signer.address}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Stake Amount: ${formatAmount(stakeAmount)} CEL`);
  console.log(`Lock Duration: ${lockDurationDays} days`);
  
  try {
    // Check CEL token balance
    const celBalanceBefore = await celToken.balanceOf(signer.address);
    console.log(`\nCEL Balance Before: ${formatAmount(celBalanceBefore)} CEL`);
    
    if (celBalanceBefore.lt(stakeAmount)) {
      console.error("Error: Insufficient CEL tokens for staking");
      console.error(`Required: ${formatAmount(stakeAmount)} CEL, Available: ${formatAmount(celBalanceBefore)} CEL`);
      return;
    }
    
    // Check if already staked on this project
    const existingStake = await projectStaking.projectStakes(projectId, signer.address);
    if (existingStake.amount.gt(0)) {
      console.log(`\nExisting Stake Found:`);
      console.log(`- Amount: ${formatAmount(existingStake.amount)} CEL`);
      console.log(`- Staked At: ${new Date(existingStake.stakedAt.toNumber() * 1000).toLocaleDateString()}`);
      console.log(`- Lock Duration: ${existingStake.lockDuration} days`);
      console.log(`- Score: ${formatAmount(existingStake.score)}`);
    }
    
    // Approve CEL tokens for staking
    console.log("\nApproving CEL tokens for staking...");
    const approveTx = await celToken.approve(projectStaking.address, stakeAmount);
    await logTransaction("CEL Token Approval", approveTx);
    
    // Stake CEL tokens
    console.log("\nStaking CEL tokens...");
    const stakeTx = await projectStaking.stake(projectId, stakeAmount, lockDurationDays);
    await logTransaction("Stake CEL Tokens", stakeTx);
    
    // Get updated stake information
    const newStake = await projectStaking.projectStakes(projectId, signer.address);
    const celBalanceAfter = await celToken.balanceOf(signer.address);
    
    console.log(`\nStake Information:`);
    console.log(`- Staked Amount: ${formatAmount(newStake.amount)} CEL`);
    console.log(`- Staked At: ${new Date(newStake.stakedAt.toNumber() * 1000).toLocaleDateString()}`);
    console.log(`- Lock Duration: ${newStake.lockDuration} days`);
    console.log(`- Score: ${formatAmount(newStake.score)}`);
    console.log(`- Locked Until: ${new Date((newStake.stakedAt.toNumber() + (newStake.lockDuration * 86400)) * 1000).toLocaleDateString()}`);
    
    console.log(`\nTransaction Summary:`);
    console.log(`- CEL Balance Before: ${formatAmount(celBalanceBefore)} CEL`);
    console.log(`- CEL Balance After: ${formatAmount(celBalanceAfter)} CEL`);
    console.log(`- CEL Staked: ${formatAmount(celBalanceBefore.sub(celBalanceAfter))} CEL`);
    
    console.log(`\nSuccessfully staked ${formatAmount(stakeAmount)} CEL on project ${projectId}!`);
    
  } catch (error) {
    console.error("Error staking CEL tokens:", error);
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