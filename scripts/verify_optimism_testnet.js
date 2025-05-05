// VERIFICATION SCRIPT FOR CELYSTIK HUB CONTRACTS ON OPTIMISM SEPOLIA
// This script verifies all deployed contracts on Optimism Sepolia
// Run with: npx hardhat run scripts/verify_optimism_testnet.js --network optimismSepolia

const { run } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔍 Starting Celystik Hub contract verification on Optimism Sepolia...");
  
  // Load deployment data
  const deploymentPath = path.join(__dirname, "../deployment-optimism-sepolia.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error(`❌ Deployment data not found at ${deploymentPath}`);
    console.error("Please deploy contracts first using scripts/deploy_optimism_testnet.js");
    process.exit(1);
  }
  
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  console.log(`📄 Loaded deployment data from ${deploymentPath}`);
  
  // Extract contract addresses and constructor arguments
  const { CELToken, ProtocolTreasury, InnovationUnits, ProjectStaking, EmissionController } = deploymentData.contracts;
  
  // Verify CEL Token
  console.log("\n🔷 Verifying CEL Token...");
  try {
    await run("verify:verify", {
      address: CELToken.address,
      constructorArguments: CELToken.constructorArgs,
    });
    console.log("✅ CEL Token verified successfully");
  } catch (error) {
    console.error(`❌ CEL Token verification failed: ${error.message}`);
  }
  
  // Verify Protocol Treasury
  console.log("\n🔷 Verifying Protocol Treasury...");
  try {
    await run("verify:verify", {
      address: ProtocolTreasury.address,
      constructorArguments: ProtocolTreasury.constructorArgs,
    });
    console.log("✅ Protocol Treasury verified successfully");
  } catch (error) {
    console.error(`❌ Protocol Treasury verification failed: ${error.message}`);
  }
  
  // Verify Innovation Units
  console.log("\n🔷 Verifying Innovation Units...");
  try {
    await run("verify:verify", {
      address: InnovationUnits.address,
      constructorArguments: InnovationUnits.constructorArgs,
    });
    console.log("✅ Innovation Units verified successfully");
  } catch (error) {
    console.error(`❌ Innovation Units verification failed: ${error.message}`);
  }
  
  // Verify Project Staking
  console.log("\n🔷 Verifying Project Staking...");
  try {
    await run("verify:verify", {
      address: ProjectStaking.address,
      constructorArguments: ProjectStaking.constructorArgs,
    });
    console.log("✅ Project Staking verified successfully");
  } catch (error) {
    console.error(`❌ Project Staking verification failed: ${error.message}`);
  }
  
  // Verify Emission Controller
  console.log("\n🔷 Verifying Emission Controller...");
  try {
    await run("verify:verify", {
      address: EmissionController.address,
      constructorArguments: EmissionController.constructorArgs,
    });
    console.log("✅ Emission Controller verified successfully");
  } catch (error) {
    console.error(`❌ Emission Controller verification failed: ${error.message}`);
  }
  
  console.log("\n=== VERIFICATION SUMMARY ===");
  console.log("All contracts have been submitted for verification on Optimism Sepolia Explorer");
  console.log("Check the logs above for individual verification status");
  console.log("=======================================");
  console.log("🎉 Verification process completed!");
  
  // Manual verification commands as fallback
  console.log("\n📝 Manual verification commands if needed:");
  console.log(`npx hardhat verify --network optimismSepolia ${CELToken.address} ${CELToken.constructorArgs.join(' ')}`);
  console.log(`npx hardhat verify --network optimismSepolia ${ProtocolTreasury.address} ${ProtocolTreasury.constructorArgs.join(' ')}`);
  console.log(`npx hardhat verify --network optimismSepolia ${InnovationUnits.address} ${InnovationUnits.constructorArgs.join(' ').replace(/,/g, ' ')}`);
  console.log(`npx hardhat verify --network optimismSepolia ${ProjectStaking.address} ${ProjectStaking.constructorArgs.join(' ')}`);
  console.log(`npx hardhat verify --network optimismSepolia ${EmissionController.address} ${EmissionController.constructorArgs.join(' ')}`);
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  }); 