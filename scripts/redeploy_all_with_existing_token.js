// REDEPLOYMENT SCRIPT FOR CELYSTIK HUB ON OPTIMISM SEPOLIA TESTNET
// This script redeploys core contracts (except CEL Token) and initializes them properly
// Run with: npx hardhat run scripts/redeploy_contracts.js --network optimismSepolia

require('dotenv').config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting Celystik Hub redeployment on Optimism Sepolia Testnet...");
  
  // Load the private key from the .env file
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("No private key provided in the .env file");
  }

  // Create a new signer with the private key
  const deployer = new ethers.Wallet(privateKey, ethers.provider);
  console.log(`📝 Redeploying contracts with account: ${deployer.address}`);
  
  // For tracking deployment status
  const deploymentData = {
    network: "optimismSepolia",
    chainId: 11155420,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  // Use existing CEL Token
  const existingCELTokenAddress = process.env.EXISTING_CEL_TOKEN || "0xA9D722bcF7728D73790ab1d1dff2Bc681c032ba6";
  console.log(`\n🔷 Using existing CEL Token at: ${existingCELTokenAddress}`);
  const CELToken = await ethers.getContractFactory("CELToken");
  const celToken = CELToken.attach(existingCELTokenAddress);
  
  // Verify the CEL token is valid
  try {
    const tokenName = await celToken.name();
    const tokenSymbol = await celToken.symbol();
    const totalSupply = await celToken.totalSupply();
    console.log(`✅ Verified CEL Token: Name=${tokenName}, Symbol=${tokenSymbol}, TotalSupply=${ethers.utils.formatEther(totalSupply)}`);
  } catch (error) {
    console.error("❌ Failed to verify CEL Token. Make sure the address is correct:", error.message);
    process.exit(1);
  }
  
  // Add CEL Token to deployment data
  deploymentData.contracts.CELToken = {
    address: existingCELTokenAddress,
    reused: true
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
  try {
    const minterTx = await celToken.setMinter(emissionController.address, true);
    await minterTx.wait();
    console.log("✅ Minter role granted to Emission Controller");
  } catch (error) {
    console.error("⚠️ Failed to grant minter role to Emission Controller. Make sure deployer has admin rights on the CEL token contract:", error.message);
  }
  
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
  const deploymentPath = path.join(__dirname, "../redeployment-optimism-sepolia.json");
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(deploymentData, null, 2)
  );
  console.log(`\n📄 Redeployment information saved to ${deploymentPath}`);

  // Print summary
  console.log("\n=== CELYSTIK HUB REDEPLOYMENT SUMMARY (OPTIMISM SEPOLIA) ===");
  console.log(`CEL Token (existing): ${celToken.address}`);
  console.log(`Protocol Treasury: ${protocolTreasury.address}`);
  console.log(`Innovation Units: ${innovationUnits.address}`);
  console.log(`Project Staking: ${projectStaking.address}`);
  console.log(`Emission Controller: ${emissionController.address}`);
  console.log("=======================================");
  console.log("🎉 Redeployment completed successfully!");
  
  console.log("\n🔍 Verification commands:");
  console.log(`npx hardhat verify --network optimismSepolia ${protocolTreasury.address} ${celToken.address}`);
  console.log(`npx hardhat verify --network optimismSepolia ${innovationUnits.address} "https://api.celystikhub.com/metadata/{id}" ${celToken.address} ${protocolTreasury.address}`);
  console.log(`npx hardhat verify --network optimismSepolia ${projectStaking.address} ${celToken.address} ${innovationUnits.address}`);
  console.log(`npx hardhat verify --network optimismSepolia ${emissionController.address} ${celToken.address} ${projectStaking.address} ${innovationUnits.address}`);
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Redeployment failed:", error);
    process.exit(1);
  }); 