// DEPLOYMENT SCRIPT FOR CELYSTIK HUB
// This script deploys all core contracts and initializes them properly
// Run with: npx hardhat run scripts/deploy_all.js --network <network_name>

const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Starting Celystik Hub deployment...");
  
  // Get signers
  const [deployer] = await ethers.getSigners();
  console.log(`📝 Deploying contracts with account: ${deployer.address}`);
  console.log(`💰 Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH`);
  
  // Deploy CEL Token
  console.log("\n🔷 Deploying CEL Token...");
  const CELToken = await ethers.getContractFactory("CELToken");
  const celToken = await CELToken.deploy(
    "Celystik Token", 
    "CEL", 
    ethers.utils.parseEther("1000000000") // 1 billion initial supply
  );
  await celToken.deployed();
  console.log(`✅ CEL Token deployed to: ${celToken.address}`);

  // Deploy Protocol Treasury
  console.log("\n🔷 Deploying Protocol Treasury...");
  const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
  const protocolTreasury = await ProtocolTreasury.deploy(celToken.address);
  await protocolTreasury.deployed();
  console.log(`✅ Protocol Treasury deployed to: ${protocolTreasury.address}`);

  // Deploy InnovationUnits
  console.log("\n🔷 Deploying Innovation Units...");
  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const innovationUnits = await InnovationUnits.deploy(
    "https://api.celystikhub.com/metadata/{id}", // Base URI for token metadata
    celToken.address,
    protocolTreasury.address
  );
  await innovationUnits.deployed();
  console.log(`✅ Innovation Units deployed to: ${innovationUnits.address}`);

  // Deploy Project Staking
  console.log("\n🔷 Deploying Project Staking...");
  const ProjectStaking = await ethers.getContractFactory("ProjectStaking");
  const projectStaking = await ProjectStaking.deploy(celToken.address, innovationUnits.address);
  await projectStaking.deployed();
  console.log(`✅ Project Staking deployed to: ${projectStaking.address}`);

  // Deploy Emission Controller
  console.log("\n🔷 Deploying Emission Controller...");
  const EmissionController = await ethers.getContractFactory("EmissionController");
  
  
  const emissionController = await EmissionController.deploy(
    celToken.address,
    projectStaking.address,
    innovationUnits.address
  );
  await emissionController.deployed();
  console.log(`✅ Emission Controller deployed to: ${emissionController.address}`);

  // Grant minter role to Emission Controller
  console.log("\n📝 Setting up permissions...");
  await celToken.setMinter(emissionController.address, true);
  console.log("✅ Minter role granted to Emission Controller");
  
  // Set Emission Controller in Project Staking
  await projectStaking.setEmissionController(emissionController.address);
  console.log("✅ Emission Controller set in Project Staking");

  
  // Verify InnovationUnits is fully initialized
  const readyStatus = await innovationUnits.isReadyForDirectUse();
  if (readyStatus[0]) {
    console.log("✅ Innovation Units is fully initialized and ready for direct use");
  } else {
    console.log(`⚠️ Innovation Units not fully initialized: ${readyStatus[1]}`);
    
    // Try to initialize if needed
    if (!readyStatus[0]) {
      try {
        console.log("🔧 Initializing Innovation Units...");
        await innovationUnits.initialize(celToken.address, protocolTreasury.address);
        console.log("✅ Innovation Units initialized successfully");
      } catch (error) {
        console.error("❌ Failed to initialize Innovation Units:", error.message);
      }
    }
  }

  

  // Print summary
  console.log("\n=== CELYSTIK HUB DEPLOYMENT SUMMARY ===");
  console.log(`CEL Token: ${celToken.address}`);
  console.log(`Protocol Treasury: ${protocolTreasury.address}`);
  console.log(`Innovation Units: ${innovationUnits.address}`);
  console.log(`Project Staking: ${projectStaking.address}`);
  console.log(`Emission Controller: ${emissionController.address}`);
  console.log("=======================================");
  console.log("🎉 Deployment completed successfully!");
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }); 