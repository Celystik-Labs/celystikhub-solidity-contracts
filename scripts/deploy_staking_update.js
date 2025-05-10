// DEPLOYMENT SCRIPT FOR UPDATING ONLY THE PROJECT STAKING CONTRACT
// This script deploys only the ProjectStaking contract and connects it to existing contracts
// Run with: npx hardhat run scripts/deploy_staking_update.js --network optimismSepolia

require('dotenv').config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting Celystik Hub ProjectStaking UPDATE on Optimism Sepolia...");
  
  // Load the private key from the .env file
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("No private key provided in the .env file");
  }

  // Create a new signer with the private key
  const deployer = new ethers.Wallet(privateKey);
  console.log(`📝 Deploying contract with account: ${deployer.address}`);
  
  // Existing contract addresses
  const CEL_TOKEN = "0xA9D722bcF7728D73790ab1d1dff2Bc681c032ba6";
  const INNOVATION_UNITS = "0x9Fe7f2E9fed01a1ED17d16c0cC90e3911C0AEF16";
  const EMISSION_CONTROLLER = "0x0FC1660B47b419D4384CfEc6Cf6D2D177C1Dea57";
  
  // For tracking deployment
  const deploymentData = {
    network: "optimismSepolia",
    chainId: 11155420,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      existing: {
        CELToken: CEL_TOKEN,
        InnovationUnits: INNOVATION_UNITS,
        EmissionController: EMISSION_CONTROLLER
      },
      updated: {}
    }
  };

  // Deploy Updated Project Staking
  console.log("\n🔷 Deploying Updated Project Staking...");
  const ProjectStaking = await ethers.getContractFactory("ProjectStaking");
  const projectStaking = await ProjectStaking.deploy(CEL_TOKEN, INNOVATION_UNITS);
  await projectStaking.deployed();
  console.log(`✅ Updated Project Staking deployed to: ${projectStaking.address}`);
  
  deploymentData.contracts.updated.ProjectStaking = {
    address: projectStaking.address,
    constructorArgs: [CEL_TOKEN, INNOVATION_UNITS]
  };

  // Set Emission Controller in Project Staking
  console.log("\n📝 Setting up permissions...");
  const emissionSetTx = await projectStaking.setEmissionController(EMISSION_CONTROLLER);
  await emissionSetTx.wait();
  console.log("✅ Emission Controller set in Project Staking");

  // Save deployment information to a file
  const deploymentPath = path.join(__dirname, "../project-staking-update.json");
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(deploymentData, null, 2)
  );
  console.log(`\n📄 Deployment information saved to ${deploymentPath}`);

  // Print summary
  console.log("\n=== PROJECT STAKING UPDATE SUMMARY (OPTIMISM SEPOLIA) ===");
  console.log(`CEL Token (existing): ${CEL_TOKEN}`);
  console.log(`Innovation Units (existing): ${INNOVATION_UNITS}`);
  console.log(`Emission Controller (existing): ${EMISSION_CONTROLLER}`);
  console.log(`Updated Project Staking: ${projectStaking.address}`);
  console.log("=======================================");
  console.log("🎉 Deployment completed successfully!");
  
  console.log("\n🔍 Verification command:");
  console.log(`npx hardhat verify --network optimismSepolia ${projectStaking.address} ${CEL_TOKEN} ${INNOVATION_UNITS}`);
  
  console.log("\n⚠️ IMPORTANT: You'll need to update the Emission Controller to use the new ProjectStaking address!");
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }); 