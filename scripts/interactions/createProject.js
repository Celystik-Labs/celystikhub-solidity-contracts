const { getContracts, logTransaction, parseAmount } = require("./utils");

async function main() {
  console.log("=== Create Project Script ===");

  // Get contract instances
  const { innovationUnits } = await getContracts();
  
  // Project parameters
  const totalSupply = parseAmount("1000000"); // 1M total supply
  const initialPrice = parseAmount("0.01");   // 0.01 CEL initial price
  
  // Multi-creator setup - example with two creators
  const [deployer, creator2] = await ethers.getSigners();
  const creators = [deployer.address, creator2.address];
  const creatorShares = [7000, 3000]; // 70% to deployer, 30% to creator2
  
  // Allocation percentages (must sum to 100%)
  const creatorAllocation = 5000;    // 50% to creators
  const contributorAllocation = 3000; // 30% to contributors
  const investorAllocation = 2000;    // 20% to investors

  console.log("Creating project with parameters:");
  console.log(`- Total Supply: ${ethers.utils.formatEther(totalSupply)} IUs`);
  console.log(`- Initial Price: ${ethers.utils.formatEther(initialPrice)} CEL per IU`);
  console.log(`- Creators: ${creators.join(", ")}`);
  console.log(`- Creator Shares: ${creatorShares.map(s => `${s/100}%`).join(", ")}`);
  console.log(`- Allocations: Creators ${creatorAllocation/100}%, Contributors ${contributorAllocation/100}%, Investors ${investorAllocation/100}%`);

  try {
    // Create project transaction
    const tx = await innovationUnits.createProject(
      totalSupply,
      initialPrice,
      creators,
      creatorShares,
      creatorAllocation,
      contributorAllocation,
      investorAllocation
    );

    const receipt = await logTransaction("Project Creation", tx);
    
    // Get the project ID from events
    const projectCreatedEvent = receipt.events.find(e => e.event === "ProjectCreated");
    const projectId = projectCreatedEvent.args.projectId;
    
    console.log(`\nProject created successfully!`);
    console.log(`Project ID: ${projectId}`);
    
    // Get and display project details
    const project = await innovationUnits.projects(projectId);
    console.log("\nProject Details:");
    console.log(`- Total Supply: ${ethers.utils.formatEther(project.totalSupply)} IUs`);
    console.log(`- Current Price: ${ethers.utils.formatEther(project.currentPrice)} CEL per IU`);
    console.log(`- Creator Allocation: ${project.creatorAllocation/100}%`);
    console.log(`- Contributor Allocation: ${project.contributorAllocation/100}%`);
    console.log(`- Investor Allocation: ${project.investorAllocation/100}%`);
    
  } catch (error) {
    console.error("Error creating project:", error);
    // If it's a contract revert, show a clearer error message
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