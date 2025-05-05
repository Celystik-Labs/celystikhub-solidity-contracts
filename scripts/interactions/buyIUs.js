const { getContracts, logTransaction, parseAmount, formatAmount } = require("./utils");

async function main() {
  console.log("=== Buy Innovation Units Script ===");

  // Get contract instances
  const { celToken, innovationUnits, signer } = await getContracts();
  
  // Parameters
  const projectId = 0; // Change this to your project ID
  const iuAmount = 100; // Number of IUs to buy
  
  console.log(`Buyer Address: ${signer.address}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Amount to buy: ${iuAmount} IUs`);
  
  try {
    // Get project details
    const project = await innovationUnits.projects(projectId);
    console.log(`\nProject Details:`);
    console.log(`- Current Price: ${formatAmount(project.currentPrice)} CEL per IU`);
    
    // Calculate total cost including fees
    const [basePayment, fee, totalCost] = await innovationUnits.calculateBuyingCost(projectId, iuAmount);
    
    console.log(`\nCost Breakdown:`);
    console.log(`- Base Payment: ${formatAmount(basePayment)} CEL`);
    console.log(`- Fee: ${formatAmount(fee)} CEL`);
    console.log(`- Total Cost: ${formatAmount(totalCost)} CEL`);
    
    // Check CEL token balance
    const balanceBefore = await celToken.balanceOf(signer.address);
    console.log(`\nCEL Balance Before: ${formatAmount(balanceBefore)} CEL`);
    
    if (balanceBefore.lt(totalCost)) {
      console.error("Error: Insufficient CEL tokens for purchase");
      console.error(`Required: ${formatAmount(totalCost)} CEL, Available: ${formatAmount(balanceBefore)} CEL`);
      return;
    }
    
    // Approve CEL tokens for spending
    console.log("\nApproving CEL tokens for purchase...");
    const approveTx = await celToken.approve(innovationUnits.address, totalCost);
    await logTransaction("CEL Token Approval", approveTx);
    
    // Buy Innovation Units
    console.log("\nBuying Innovation Units...");
    const buyTx = await innovationUnits.buyIUs(projectId, iuAmount);
    await logTransaction("Buy Innovation Units", buyTx);
    
    // Check balances after purchase
    const celBalanceAfter = await celToken.balanceOf(signer.address);
    const iuBalance = await innovationUnits.balanceOf(signer.address, projectId);
    
    console.log(`\nTransaction Summary:`);
    console.log(`- CEL Balance After: ${formatAmount(celBalanceAfter)} CEL`);
    console.log(`- CEL Spent: ${formatAmount(balanceBefore.sub(celBalanceAfter))} CEL`);
    console.log(`- IU Balance: ${iuBalance} IUs`);
    
    console.log(`\nSuccessfully purchased ${iuAmount} IUs for project ${projectId}!`);
    
  } catch (error) {
    console.error("Error buying Innovation Units:", error);
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