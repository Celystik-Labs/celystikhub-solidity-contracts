const { getContracts, logTransaction } = require("./utils");
const { ethers } = require("hardhat");

async function main() {
  console.log("=== Mint IUs to Contributors Script ===");

  // Get contract instances
  const { innovationUnits, signer } = await getContracts();
  
  // Parameters
  const projectId = 0; // Change this to your project ID
  const contributors = [
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Sample contributor address 1
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"  // Sample contributor address 2
  ];
  const amounts = [
    100, // Amount for contributor 1
    200  // Amount for contributor 2
  ];
  
  console.log(`Project Owner: ${signer.address}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Contributors: ${contributors.join(", ")}`);
  console.log(`Amounts: ${amounts.join(", ")} IUs`);
  
  // Sanity check
  if (contributors.length !== amounts.length) {
    console.error("Error: Contributors array and amounts array must have the same length");
    return;
  }
  
  try {
    // Get project details
    const project = await innovationUnits.projects(projectId);
    console.log(`\nProject Details:`);
    console.log(`- Total Supply: ${ethers.utils.formatEther(project.totalSupply)} IUs`);
    console.log(`- Current Price: ${ethers.utils.formatEther(project.currentPrice)} CEL per IU`);
    console.log(`- Contributor Allocation: ${project.contributorAllocation/100}%`);
    
    // Calculate total contributor allocation
    const contributorAllocationAmount = project.totalSupply.mul(project.contributorAllocation).div(10000);
    console.log(`\nTotal Contributor Allocation: ${ethers.utils.formatEther(contributorAllocationAmount)} IUs`);
    
    // Get already minted contributor IUs
    const contributorMinted = await innovationUnits.contributorMinted(projectId);
    console.log(`Already Minted to Contributors: ${ethers.utils.formatEther(contributorMinted)} IUs`);
    
    // Calculate remaining allocation
    const remainingAllocation = contributorAllocationAmount.sub(contributorMinted);
    console.log(`Remaining Contributor Allocation: ${ethers.utils.formatEther(remainingAllocation)} IUs`);
    
    // Calculate total amount to mint in this transaction
    const totalMintAmount = amounts.reduce((a, b) => a + b, 0);
    console.log(`\nTotal Amount to Mint in This Transaction: ${totalMintAmount} IUs`);
    
    if (ethers.BigNumber.from(totalMintAmount).gt(remainingAllocation)) {
      console.error("Error: Mint amount exceeds remaining contributor allocation");
      console.error(`Required: ${totalMintAmount} IUs, Available: ${ethers.utils.formatEther(remainingAllocation)} IUs`);
      return;
    }
    
    // Mint IUs to contributors
    console.log("\nMinting IUs to contributors...");
    const mintTx = await innovationUnits.mintToContributors(projectId, contributors, amounts);
    await logTransaction("Mint to Contributors", mintTx);
    
    // Verify balances after minting
    console.log("\nVerifying contributor balances after minting:");
    for (let i = 0; i < contributors.length; i++) {
      const balance = await innovationUnits.balanceOf(contributors[i], projectId);
      console.log(`- Contributor ${contributors[i]}: ${balance} IUs`);
    }
    
    // Update total minted to contributors
    const updatedContributorMinted = await innovationUnits.contributorMinted(projectId);
    console.log(`\nUpdated Total Minted to Contributors: ${ethers.utils.formatEther(updatedContributorMinted)} IUs`);
    console.log(`Remaining Contributor Allocation: ${ethers.utils.formatEther(contributorAllocationAmount.sub(updatedContributorMinted))} IUs`);
    
    console.log(`\nSuccessfully minted IUs to contributors for project ${projectId}!`);
    
  } catch (error) {
    console.error("Error minting to contributors:", error);
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