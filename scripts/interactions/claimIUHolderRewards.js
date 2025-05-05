const { getContracts, logTransaction, formatAmount } = require("./utils");

async function main() {
  console.log("=== Claim IU Holder Rewards Script ===");

  // Get contract instances
  const { celToken, emissionController, innovationUnits, signer } = await getContracts();
  
  // Parameters
  const projectId = 0; // Change this to your project ID
  
  console.log(`IU Holder Address: ${signer.address}`);
  console.log(`Project ID: ${projectId}`);
  
  try {
    // Get current epoch information
    const currentEpoch = await emissionController.getCurrentEpoch();
    console.log(`\nCurrent Epoch Information:`);
    console.log(`- Epoch Number: ${currentEpoch.epochNumber}`);
    console.log(`- Epoch Start: ${new Date(currentEpoch.startTimestamp.toNumber() * 1000).toLocaleString()}`);
    console.log(`- Epoch End: ${new Date(currentEpoch.endTimestamp.toNumber() * 1000).toLocaleString()}`);
    
    // Check IU balance
    const iuBalance = await innovationUnits.balanceOf(signer.address, projectId);
    console.log(`\nIU Balance: ${iuBalance} IUs`);
    
    if (iuBalance.isZero()) {
      console.error("Error: No IUs held for this project. Cannot claim rewards.");
      return;
    }
    
    // Check unclaimed emissions
    const unclaimedEmissions = await emissionController.getUnclaimedIUHolderEmissions(signer.address, projectId);
    console.log(`\nUnclaimed IU Holder Emissions: ${formatAmount(unclaimedEmissions)} CEL`);
    
    if (unclaimedEmissions.isZero()) {
      console.log("No rewards to claim. Try again when emissions are available.");
      return;
    }
    
    // Get CEL balance before claiming
    const celBalanceBefore = await celToken.balanceOf(signer.address);
    console.log(`\nCEL Balance Before: ${formatAmount(celBalanceBefore)} CEL`);
    
    // Claim IU holder rewards
    console.log("\nClaiming IU holder rewards...");
    const claimTx = await emissionController.claimIUHolderEmissions(projectId);
    await logTransaction("Claim IU Holder Emissions", claimTx);
    
    // Get CEL balance after claiming
    const celBalanceAfter = await celToken.balanceOf(signer.address);
    const rewardsClaimed = celBalanceAfter.sub(celBalanceBefore);
    
    console.log(`\nTransaction Summary:`);
    console.log(`- CEL Balance Before: ${formatAmount(celBalanceBefore)} CEL`);
    console.log(`- CEL Balance After: ${formatAmount(celBalanceAfter)} CEL`);
    console.log(`- Rewards Claimed: ${formatAmount(rewardsClaimed)} CEL`);
    
    // Check if all emissions were claimed
    if (rewardsClaimed.eq(unclaimedEmissions)) {
      console.log(`\nAll unclaimed emissions have been successfully claimed!`);
    } else {
      console.log(`\nWarning: Not all emissions were claimed. Expected: ${formatAmount(unclaimedEmissions)}, Actual: ${formatAmount(rewardsClaimed)}`);
    }
    
    // Check if any emissions remain
    const remainingEmissions = await emissionController.getUnclaimedIUHolderEmissions(signer.address, projectId);
    if (!remainingEmissions.isZero()) {
      console.log(`\nThere are still ${formatAmount(remainingEmissions)} CEL of unclaimed emissions remaining.`);
    }
    
    console.log(`\nSuccessfully claimed IU holder rewards for project ${projectId}!`);
    
  } catch (error) {
    console.error("Error claiming IU holder rewards:", error);
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