// SCRIPT TO HELP MIGRATE STAKING DATA FROM OLD CONTRACT TO NEW
// This script doesn't perform the migration automatically (which would require custom contract functionality)
// Instead, it scans the old contract and provides a report of all staked data to help plan migration
// Run with: npx hardhat run scripts/migrate_staking_data.js --network optimismSepolia

require('dotenv').config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("📊 Scanning old ProjectStaking contract data to help with migration...");
  
  // Load the private key from the .env file
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("No private key provided in the .env file");
  }

  // Create a signer with the private key
  const deployer = new ethers.Wallet(privateKey);
  console.log(`📝 Connected with account: ${deployer.address}`);
  
  // Read deployment data
  const deploymentPath = path.join(__dirname, "../project-staking-update.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Deployment file not found. Please run the deploy_staking_update.js script first.");
  }
  
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const NEW_PROJECT_STAKING = deploymentData.contracts.updated.ProjectStaking.address;
  
  // You need to manually enter the old ProjectStaking address if it's not in your deployment file
  const OLD_PROJECT_STAKING = process.env.OLD_PROJECT_STAKING;
  if (!OLD_PROJECT_STAKING) {
    throw new Error("Old ProjectStaking address not provided. Set it in the .env file as OLD_PROJECT_STAKING=0x...");
  }
  
  console.log(`Old ProjectStaking address: ${OLD_PROJECT_STAKING}`);
  console.log(`New ProjectStaking address: ${NEW_PROJECT_STAKING}`);
  
  // ABI for both old and new ProjectStaking contracts
  // This is simplified - in a real scenario, you would load the full ABI
  const stakingABI = [
    // Events to query for stake information
    "event Staked(address indexed user, uint256 indexed projectId, uint256 amount, uint256 lockDuration, uint256 unlockTime, uint256 score, uint256 stakeIndex)",
    "event Unstaked(address indexed user, uint256 indexed projectId, uint256 amount, uint256 score, uint256 stakeIndex)",
    
    // Read functions
    "function totalStaked() external view returns (uint256)",
    "function projectTotalStaked(uint256 projectId) external view returns (uint256)",
    "function getUserStakedProjects(address user) external view returns (uint256[] memory)",
    "function getAllUserStakes(address user) external view returns (uint256[] memory projectIds, uint256[] memory stakeIndexes, uint256[] memory amounts, uint256[] memory unlockTimes)"
  ];
  
  // Connect to the old contract
  const oldStaking = new ethers.Contract(
    OLD_PROJECT_STAKING,
    stakingABI,
    deployer
  );
  
  // Connect to the new contract
  const newStaking = new ethers.Contract(
    NEW_PROJECT_STAKING,
    stakingABI,
    deployer
  );
  
  // Get basic stats
  const oldTotalStaked = await oldStaking.totalStaked();
  console.log(`\nOld contract total staked: ${ethers.utils.formatEther(oldTotalStaked)} CEL`);
  
  try {
    const newTotalStaked = await newStaking.totalStaked();
    console.log(`New contract total staked: ${ethers.utils.formatEther(newTotalStaked)} CEL`);
  } catch (error) {
    console.log("New contract total stakes: 0 CEL (or contract not accessible)");
  }
  
  // Query staking events to find all users who have staked
  console.log("\n🔍 Scanning for staking events (this may take some time)...");
  
  // Get the block number when the contract was deployed
  // For a real migration, you might need to specify this or use a broader range
  const provider = ethers.provider;
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 100000); // Look back ~2 weeks worth of blocks
  
  console.log(`Scanning from block ${fromBlock} to ${currentBlock}`);
  
  // Query staking events
  const stakeFilter = oldStaking.filters.Staked();
  const unstakeFilter = oldStaking.filters.Unstaked();
  
  const stakeEvents = await oldStaking.queryFilter(stakeFilter, fromBlock, currentBlock);
  const unstakeEvents = await oldStaking.queryFilter(unstakeFilter, fromBlock, currentBlock);
  
  console.log(`Found ${stakeEvents.length} stake events and ${unstakeEvents.length} unstake events`);
  
  // Track all unique users and their stakes
  const uniqueUsers = new Set();
  const userProjects = new Map();
  
  // Process stake events
  for (const event of stakeEvents) {
    const user = event.args.user;
    const projectId = event.args.projectId.toString();
    
    uniqueUsers.add(user);
    
    if (!userProjects.has(user)) {
      userProjects.set(user, new Set());
    }
    userProjects.get(user).add(projectId);
  }
  
  // Process unstake events to potentially remove projects if fully unstaked
  // This is a simplified approach, a real implementation would need more detailed tracking
  for (const event of unstakeEvents) {
    // We're not removing users or projects here as we don't have enough information
    // to determine if they're fully unstaked without querying active stakes
  }
  
  console.log(`\n📊 Found ${uniqueUsers.size} unique users who have staked`);
  
  // Collect detailed staking information for each user
  const migrationData = {
    oldContract: OLD_PROJECT_STAKING,
    newContract: NEW_PROJECT_STAKING,
    totalStaked: oldTotalStaked.toString(),
    timestamp: new Date().toISOString(),
    users: []
  };
  
  // Limit the number of users we analyze in detail to avoid script timeouts
  const MAX_USERS_TO_ANALYZE = 10;
  let analyzedCount = 0;
  
  console.log(`\n📋 Analyzing stake details for up to ${MAX_USERS_TO_ANALYZE} users...`);
  
  for (const user of uniqueUsers) {
    if (analyzedCount >= MAX_USERS_TO_ANALYZE) {
      console.log(`Reached analysis limit of ${MAX_USERS_TO_ANALYZE} users. Skipping remaining users.`);
      break;
    }
    
    try {
      // Get projects for this user
      const projects = await oldStaking.getUserStakedProjects(user);
      
      if (projects.length === 0) {
        console.log(`User ${user} has no active stakes`);
        continue;
      }
      
      console.log(`User ${user} has active stakes in ${projects.length} projects`);
      
      // Get all stakes for this user
      const stakes = await oldStaking.getAllUserStakes(user);
      
      const userStakes = [];
      for (let i = 0; i < stakes.projectIds.length; i++) {
        userStakes.push({
          projectId: stakes.projectIds[i].toString(),
          stakeIndex: stakes.stakeIndexes[i].toString(),
          amount: stakes.amounts[i].toString(),
          unlockTime: stakes.unlockTimes[i].toString()
        });
      }
      
      migrationData.users.push({
        address: user,
        projects: projects.map(p => p.toString()),
        stakes: userStakes
      });
      
      analyzedCount++;
    } catch (error) {
      console.error(`Error analyzing user ${user}:`, error.message);
    }
  }
  
  // Save the migration data
  const migrationPath = path.join(__dirname, "../staking-migration-data.json");
  fs.writeFileSync(
    migrationPath,
    JSON.stringify(migrationData, null, 2)
  );
  console.log(`\n📄 Migration data saved to ${migrationPath}`);
  
  console.log("\n⚠️ IMPORTANT MIGRATION NOTES:");
  console.log("1. This script only scans for data and doesn't perform the actual migration");
  console.log("2. To migrate stakes, you'll need to:");
  console.log("   - Consider adding migration functionality to the new contract");
  console.log("   - Create a custom migration script using the data in staking-migration-data.json");
  console.log("   - Or use emergency unstakes from old contract + restaking incentives for users");
  console.log("3. Ensure the EmissionController is updated to point to the new contract");
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Migration data scan failed:", error);
    process.exit(1);
  }); 