// DEPLOYMENT SCRIPT FOR CELYSTIK HUB ON OPTIMISM SEPOLIA TESTNET
// This script deploys all core contracts and initializes them properly
// Run with: npx hardhat run scripts/deploy_optimism_testnet.js --network optimismSepolia

require('dotenv').config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting Celystik Hub deployment on Optimism Sepolia Testnet...");
  
  // Load the private key from the .env file
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("No private key provided in the .env file");
  }

  // Create a new signer with the private key
  const deployer = new ethers.Wallet(privateKey);
  console.log(`📝 Deploying contracts with account: ${deployer.address}`);
  
  
  // For tracking deployment status
  const deploymentData = {
    network: "optimismSepolia",
    chainId: 11155420,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  // Deploy CEL Token
  console.log("\n🔷 Deploying CEL Token...");
  const CELToken = await ethers.getContractFactory("CELToken");
  const initialSupply = process.env.INITIAL_CEL_SUPPLY || "1000000000"; // 1 billion tokens by default
  const celToken = await CELToken.deploy(
    "Celystik Token", 
    "CEL", 
    ethers.utils.parseEther(initialSupply)
  );
  await celToken.deployed();
  console.log(`✅ CEL Token deployed to: ${celToken.address}`);
  
  deploymentData.contracts.CELToken = {
    address: celToken.address,
    constructorArgs: ["Celystik Token", "CEL", ethers.utils.parseEther(initialSupply).toString()]
  };

  // Deploy Protocol Treasury
  console.log("\n🔷 Deploying Protocol Treasury...");
  const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
  const protocolTreasury = await ProtocolTreasury.deploy(celToken.address);
  await protocolTreasury.deployed();
  console.log(`✅ Protocol Treasury deployed to: ${protocolTreasury.address}`);
  
  deploymentData.contracts.ProtocolTreasury = {
    address: protocolTreasury.address,
    constructorArgs: [celToken.address]
  };

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
  
  deploymentData.contracts.InnovationUnits = {
    address: innovationUnits.address,
    constructorArgs: ["https://api.celystikhub.com/metadata/{id}", celToken.address, protocolTreasury.address]
  };

  // Deploy Project Staking
  console.log("\n🔷 Deploying Project Staking...");
  const ProjectStaking = await ethers.getContractFactory("ProjectStaking");
  const projectStaking = await ProjectStaking.deploy(celToken.address, innovationUnits.address);
  await projectStaking.deployed();
  console.log(`✅ Project Staking deployed to: ${projectStaking.address}`);
  
  deploymentData.contracts.ProjectStaking = {
    address: projectStaking.address,
    constructorArgs: [celToken.address, innovationUnits.address]
  };

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
  
  deploymentData.contracts.EmissionController = {
    address: emissionController.address,
    constructorArgs: [celToken.address, projectStaking.address, innovationUnits.address]
  };

  // Grant minter role to Emission Controller
  console.log("\n📝 Setting up permissions...");
  const minterTx = await celToken.setMinter(emissionController.address, true);
  await minterTx.wait();
  console.log("✅ Minter role granted to Emission Controller");
  
  // Set Emission Controller in Project Staking
  const emissionSetTx = await projectStaking.setEmissionController(emissionController.address);
  await emissionSetTx.wait();
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
        const initTx = await innovationUnits.initialize(celToken.address, protocolTreasury.address);
        await initTx.wait();
        console.log("✅ Innovation Units initialized successfully");
      } catch (error) {
        console.error("❌ Failed to initialize Innovation Units:", error.message);
      }
    }
  }

  // Save deployment information to a file
  const deploymentPath = path.join(__dirname, "../deployment-optimism-sepolia.json");
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(deploymentData, null, 2)
  );
  console.log(`\n📄 Deployment information saved to ${deploymentPath}`);

  // Print summary
  console.log("\n=== CELYSTIK HUB DEPLOYMENT SUMMARY (OPTIMISM SEPOLIA) ===");
  console.log(`CEL Token: ${celToken.address}`);
  console.log(`Protocol Treasury: ${protocolTreasury.address}`);
  console.log(`Innovation Units: ${innovationUnits.address}`);
  console.log(`Project Staking: ${projectStaking.address}`);
  console.log(`Emission Controller: ${emissionController.address}`);
  console.log("=======================================");
  console.log("🎉 Deployment completed successfully!");
  
  console.log("\n🔍 Verification commands:");
  console.log(`npx hardhat verify --network optimismSepolia ${celToken.address} "Celystik Token" "CEL" "${ethers.utils.parseEther(initialSupply)}"`);
  console.log(`npx hardhat verify --network optimismSepolia ${protocolTreasury.address} ${celToken.address}`);
  console.log(`npx hardhat verify --network optimismSepolia ${innovationUnits.address} "https://api.celystikhub.com/metadata/{id}" ${celToken.address} ${protocolTreasury.address}`);
  console.log(`npx hardhat verify --network optimismSepolia ${projectStaking.address} ${celToken.address} ${innovationUnits.address}`);
  console.log(`npx hardhat verify --network optimismSepolia ${emissionController.address} ${celToken.address} ${projectStaking.address} ${innovationUnits.address}`);
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }); 