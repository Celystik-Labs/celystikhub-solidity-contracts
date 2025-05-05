const { getContracts, logTransaction, parseAmount, formatAmount } = require("./utils");
const { ethers, network } = require("hardhat");

async function main() {
  console.log("=== Stake and Unstake Example Script ===");

  // Get contract instances
  const { celToken, projectStaking, signer } = await getContracts();
  
  // Parameters
  const projectId = 0; // Change this to your project ID
  const stakeAmount = parseAmount("100"); // 100 CEL tokens
  const lockDurationDays = 7; // 7-day lock duration
  
  console.log(`Staker Address: ${signer.address}`);
  console.log(`Project ID: ${projectId}`);
  
  try {
    // Part 1: Stake tokens
    console.log(`\n1. Staking ${formatAmount(stakeAmount)} CEL for ${lockDurationDays} days...`);
    
    // Check CEL token balance
    const celBalanceBefore = await celToken.balanceOf(signer.address);
    console.log(`\nCEL Balance Before: ${formatAmount(celBalanceBefore)} CEL`);
    
    if (celBalanceBefore.lt(stakeAmount)) {
      console.error("Error: Insufficient CEL tokens for staking");
      console.error(`Required: ${formatAmount(stakeAmount)} CEL, Available: ${formatAmount(celBalanceBefore)} CEL`);
      return;
    }
    
    // Approve CEL tokens for staking
    console.log("\nApproving CEL tokens for staking...");
    const approveTx = await celToken.approve(projectStaking.address, stakeAmount);
    await logTransaction("CEL Token Approval", approveTx);
    
    // Stake CEL tokens
    console.log("\nStaking CEL tokens...");
    const stakeTx = await projectStaking.stake(projectId, stakeAmount, lockDurationDays);
    const receipt = await logTransaction("Stake CEL Tokens", stakeTx);
    
    // Extract stake index from the Staked event
    const stakedEvent = receipt.events.find(e => e.event === "Staked");
    const stakeIndex = stakedEvent.args.stakeIndex;
    console.log(`\nStake created with index: ${stakeIndex}`);
    
    // Get the stake info
    const [indexes, amounts, startTimes, unlockTimes, lockDurations, scores] = 
      await projectStaking.getUserActiveStakes(projectId, signer.address);
    
    // Find our stake
    const stakePosition = indexes.findIndex(idx => idx.eq(stakeIndex));
    
    if (stakePosition === -1) {
      console.error(`Stake with index ${stakeIndex} not found`);
      return;
    }
    
    const amount = amounts[stakePosition];
    const unlockTime = unlockTimes[stakePosition];
    
    console.log(`\nStake Information:`);
    console.log(`- Index: ${stakeIndex}`);
    console.log(`- Amount: ${formatAmount(amount)} CEL`);
    console.log(`- Unlock Time: ${new Date(unlockTime.toNumber() * 1000).toLocaleString()}`);
    
    // Part 2: Fast forward time (for testing only, this only works in local hardhat network)
    console.log(`\n2. Fast forwarding time to unlock the stake...`);
    try {
      await network.provider.send("evm_increaseTime", [lockDurationDays * 24 * 60 * 60]);
      await network.provider.send("evm_mine");
      console.log(`Time fast-forwarded ${lockDurationDays} days`);
    } catch (error) {
      console.log(`Fast forwarding time not supported on this network. In a real scenario, you would need to wait for the lock period to end.`);
    }
    
    // Part 3: Unstake tokens
    console.log(`\n3. Unstaking tokens with index ${stakeIndex}...`);
    
    // Check if stake can be unstaked
    const [canUnstake, remainingLockTime] = await projectStaking.checkUnstakeAvailability(
      projectId,
      signer.address,
      stakeIndex
    );
    
    console.log(`Can unstake: ${canUnstake}`);
    if (!canUnstake) {
      console.log(`Remaining lock time: ${remainingLockTime} seconds`);
      console.log(`\nSkipping unstake since the tokens are still locked.`);
      console.log(`In a real scenario, you would need to wait for the lock period to end.`);
      return;
    }
    
    // Get CEL balance before unstaking
    const celBalanceBeforeUnstake = await celToken.balanceOf(signer.address);
    
    // Unstake CEL tokens
    const unstakeTx = await projectStaking.unstake(projectId, stakeIndex);
    await logTransaction("Unstake CEL Tokens", unstakeTx);
    
    // Get CEL balance after unstaking
    const celBalanceAfterUnstake = await celToken.balanceOf(signer.address);
    const amountReceived = celBalanceAfterUnstake.sub(celBalanceBeforeUnstake);
    
    console.log(`\nUnstake Summary:`);
    console.log(`- CEL Balance Before: ${formatAmount(celBalanceBeforeUnstake)} CEL`);
    console.log(`- CEL Balance After: ${formatAmount(celBalanceAfterUnstake)} CEL`);
    console.log(`- CEL Received: ${formatAmount(amountReceived)} CEL`);
    
    // Check if stake has been removed
    const [newIndexes] = await projectStaking.getUserActiveStakes(projectId, signer.address);
    const stakeStillExists = newIndexes.some(idx => idx.eq(stakeIndex));
    
    if (!stakeStillExists) {
      console.log(`\nStake has been successfully removed from project ${projectId}.`);
    } else {
      console.log(`\nWarning: Stake may not have been fully removed. Please check again.`);
    }
    
    console.log(`\nStake and unstake process completed successfully!`);
    
  } catch (error) {
    console.error("Error in stake/unstake process:", error);
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