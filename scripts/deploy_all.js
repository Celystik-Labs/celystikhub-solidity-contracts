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
  
  // Grant minter role to deployer temporarily to allow setting up EmissionController
  const minterRole = await celToken.isMinter(deployer.address);
  if (!minterRole) {
    console.log("📝 Granting minter role to deployer...");
    await celToken.setMinter(deployer.address, true);
  }
  
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

  // Deploy CelyHubFactory (optional - with direct usage architecture, this is no longer required)
  let factoryAddress = "Not deployed (using direct contract interactions)";
  
  const deployFactory = false; // Set to true if you want to deploy the Factory
  if (deployFactory) {
    console.log("\n🔷 Deploying CelyHub Factory...");
    const CelyHubFactory = await ethers.getContractFactory("CelyHubFactory");
    const factory = await CelyHubFactory.deploy(
      celToken.address,
      innovationUnits.address,
      projectStaking.address,
      emissionController.address,
      protocolTreasury.address
    );
    await factory.deployed();
    factoryAddress = factory.address;
    console.log(`✅ CelyHub Factory deployed to: ${factory.address}`);
    
    // Transfer ownership of InnovationUnits to Factory (if using factory architecture)
    await innovationUnits.transferOwnership(factory.address);
    console.log("✅ Innovation Units ownership transferred to Factory");
  }

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

  // Set up test project for development environments
  if (network.name === "localhost" || network.name === "hardhat") {
    console.log("\n🔷 Setting up test project...");
    
    // Create a test project
    const creators = [deployer.address];
    const creatorShares = [10000]; // 100% to deployer
    const projectId = await innovationUnits.createProject(
      ethers.utils.parseEther("1000000"), // 1M total supply
      ethers.utils.parseEther("0.01"), // 0.01 CEL initial price
      creators,
      creatorShares,
      5000, // 50% to creators
      3000, // 30% to contributors
      2000  // 20% to investors
    );
    
    console.log(`✅ Test project #${(await projectId).toNumber()} created with deployer as creator`);
    console.log("✅ Creator tokens automatically minted during project creation");
    
    // Create another project with multiple creators as an example
    if (network.name === "hardhat") { // Only for hardhat network to avoid complex test setup
      // Get a couple of test accounts
      const [, creator2, creator3] = await ethers.getSigners();
      
      console.log("\n🔷 Creating another test project with multiple creators...");
      const multiCreatorProjectId = await innovationUnits.createProject(
        ethers.utils.parseEther("2000000"), // 2M total supply
        ethers.utils.parseEther("0.02"), // 0.02 CEL initial price
        [deployer.address, creator2.address, creator3.address], 
        [5000, 3000, 2000], // 50%, 30%, 20% distribution
        6000, // 60% to creators
        2000, // 20% to contributors
        2000  // 20% to investors
      );
      
      console.log(`✅ Multi-creator project #${(await multiCreatorProjectId).toNumber()} created`);
      console.log("✅ Tokens automatically minted to all creators based on their shares");
      
      // Example of a creator adding a contributor (for documentation purposes)
      try {
        console.log("\n🔷 Demonstrating contributor token minting...");
        // Mint some contributor tokens - this should succeed because deployer is a creator
        await innovationUnits.mintToContributor(
          await multiCreatorProjectId, 
          ethers.constants.AddressZero.replace('0x00', '0x12'), // Just a random contributor address
          ethers.utils.parseEther("10000") // 10k tokens
        );
        console.log("✅ Creator successfully minted tokens to a contributor");
      } catch (error) {
        console.error("❌ Failed to mint to contributor:", error.message);
      }
    }
    
    // Mint some CEL tokens to the deployer for testing
    if (!minterRole) {
      await celToken.mint(deployer.address, ethers.utils.parseEther("1000000"));
      console.log("✅ CEL tokens minted to deployer for testing");
    }
  }

  // Print summary
  console.log("\n=== CELYSTIK HUB DEPLOYMENT SUMMARY ===");
  console.log(`CEL Token: ${celToken.address}`);
  console.log(`Protocol Treasury: ${protocolTreasury.address}`);
  console.log(`Innovation Units: ${innovationUnits.address}`);
  console.log(`Project Staking: ${projectStaking.address}`);
  console.log(`Emission Controller: ${emissionController.address}`);
  console.log(`CelyHub Factory: ${factoryAddress}`);
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