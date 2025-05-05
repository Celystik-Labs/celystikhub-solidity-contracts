const { getContracts, logTransaction, formatAmount } = require("./utils");

async function main() {
  console.log("=== Sell Innovation Units Script ===");

  // Get contract instances
  const { celToken, innovationUnits, signer } = await getContracts();
  
  // Parameters
  const projectId = 0; // Change this to your project ID
  const iuAmount = 50; // Number of IUs to sell
  
  console.log(`Seller Address: ${signer.address}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Amount to sell: ${iuAmount} IUs`);
  
  try {
    // Get project details
    const project = await innovationUnits.projects(projectId);
    console.log(`\nProject Details:`);
    console.log(`- Current Price: ${formatAmount(project.currentPrice)} CEL per IU`);
    
    // Check IU balance
    const iuBalanceBefore = await innovationUnits.balanceOf(signer.address, projectId);
    console.log(`\nIU Balance Before: ${iuBalanceBefore} IUs`);
    
    if (iuBalanceBefore.lt(iuAmount)) {
      console.error("Error: Insufficient IUs for sale");
      console.error(`Required: ${iuAmount} IUs, Available: ${iuBalanceBefore} IUs`);
      return;
    }
    
    // Calculate return including fees
    const [baseReturn, fee, netReturn] = await innovationUnits.calculateSellingReturn(projectId, iuAmount);
    
    console.log(`\nReturn Breakdown:`);
    console.log(`- Base Return: ${formatAmount(baseReturn)} CEL`);
    console.log(`- Fee: ${formatAmount(fee)} CEL`);
    console.log(`- Net Return: ${formatAmount(netReturn)} CEL`);
    
    // Get CEL balance before selling
    const celBalanceBefore = await celToken.balanceOf(signer.address);
    console.log(`\nCEL Balance Before: ${formatAmount(celBalanceBefore)} CEL`);
    
    // Sell Innovation Units
    console.log("\nSelling Innovation Units...");
    const sellTx = await innovationUnits.sellIUs(projectId, iuAmount);
    await logTransaction("Sell Innovation Units", sellTx);
    
    // Check balances after sale
    const celBalanceAfter = await celToken.balanceOf(signer.address);
    const iuBalanceAfter = await innovationUnits.balanceOf(signer.address, projectId);
    
    console.log(`\nTransaction Summary:`);
    console.log(`- CEL Balance After: ${formatAmount(celBalanceAfter)} CEL`);
    console.log(`- CEL Received: ${formatAmount(celBalanceAfter.sub(celBalanceBefore))} CEL`);
    console.log(`- IU Balance Before: ${iuBalanceBefore} IUs`);
    console.log(`- IU Balance After: ${iuBalanceAfter} IUs`);
    console.log(`- IUs Sold: ${iuBalanceBefore.sub(iuBalanceAfter)} IUs`);
    
    console.log(`\nSuccessfully sold ${iuAmount} IUs for project ${projectId}!`);
    
  } catch (error) {
    console.error("Error selling Innovation Units:", error);
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