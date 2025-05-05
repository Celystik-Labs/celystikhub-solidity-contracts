const { getContracts, formatAmount } = require("./utils");
const { ethers } = require("hardhat");

async function main() {
  console.log("=== Get Stake Indexes for Unstaking ===");

  // Get contract instances
  const { projectStaking, signer } = await getContracts();
  
  // Parameters
  const projectId = 0; // Change this to your project ID
  
  console.log(`Staker Address: ${signer.address}`);
  console.log(`Project ID: ${projectId}`);
  
  try {
    // Get user's active stakes for the project
    const [indexes, amounts, startTimes, unlockTimes, lockDurations, scores] = 
      await projectStaking.getUserActiveStakes(projectId, signer.address);
    
    if (indexes.length === 0) {
      console.log(`\nNo active stakes found for project ${projectId}`);
      return;
    }
    
    console.log(`\nFound ${indexes.length} active stake(s):`);
    
    for (let i = 0; i < indexes.length; i++) {
      // Convert from seconds to days for display
      const lockDurationDays = Math.floor(lockDurations[i].toNumber() / (24 * 60 * 60));
      
      // Calculate time until unlock
      const currentTime = Math.floor(Date.now() / 1000);
      const unlockTime = unlockTimes[i].toNumber();
      const timeUntilUnlock = unlockTime - currentTime;
      
      console.log(`\nStake #${i + 1}:`);
      console.log(`- Index: ${indexes[i].toString()} (Use this value for unstaking)`);
      console.log(`- Amount: ${formatAmount(amounts[i])} CEL`);
      console.log(`- Start Time: ${new Date(startTimes[i].toNumber() * 1000).toLocaleString()}`);
      console.log(`- Unlock Time: ${new Date(unlockTime * 1000).toLocaleString()}`);
      console.log(`- Lock Duration: ${lockDurationDays} days`);
      console.log(`- Score: ${formatAmount(scores[i])}`);
      
      if (timeUntilUnlock > 0) {
        const daysRemaining = Math.ceil(timeUntilUnlock / (24 * 60 * 60));
        console.log(`- Status: LOCKED (${daysRemaining} days remaining)`);
      } else {
        console.log(`- Status: UNLOCKED (Ready to unstake)`);
      }
      
      // Get unstake availability
      const [canUnstake, _] = await projectStaking.checkUnstakeAvailability(
        projectId, 
        signer.address, 
        indexes[i]
      );
      
      if (canUnstake) {
        console.log(`- Can Unstake: YES`);
        console.log(`\nTo unstake this position, use:`);
        console.log(`npx hardhat run scripts/interactions/unstake.js -- --project-id ${projectId} --stake-index ${indexes[i]}`);
      } else {
        console.log(`- Can Unstake: NO (still locked)`);
      }
    }
    
  } catch (error) {
    console.error("Error getting stake indexes:", error);
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