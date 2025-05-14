// UPGRADE SCRIPT FOR INNOVATION UNITS CONTRACT
// This script deploys only the InnovationUnits contract while keeping other contracts the same
// Run with: npx hardhat run scripts/upgrade_innovation_units.js --network optimismSepolia

require('dotenv').config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting InnovationUnits contract upgrade on Optimism Sepolia...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`📝 Upgrading contract with account: ${deployer.address}`);
  
  // Use hardcoded addresses from your existing deployment
  const celTokenAddress = "0xA9D722bcF7728D73790ab1d1dff2Bc681c032ba6";
  const protocolTreasuryAddress = "0x6041c54BeB1Df6d66E835Bc9e5096fe37EdbBCf5";
  const oldInnovationUnitsAddress = "0x2dA7e3a7F21cCE79efeb66f3b082196EA0A8B9Af"; // Replace with your current address

  console.log(`\nExisting contract addresses:`);
  console.log(`CEL Token: ${celTokenAddress}`);
  console.log(`Protocol Treasury: ${protocolTreasuryAddress}`);
  console.log(`Old Innovation Units: ${oldInnovationUnitsAddress}`);
  
  // Deploy new InnovationUnits
  console.log("\n🔷 Deploying updated Innovation Units contract...");
  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const innovationUnits = await InnovationUnits.deploy(
    "https://api.celystikhub.com/metadata/{id}", // Base URI for token metadata
    celTokenAddress,
    protocolTreasuryAddress
  );
  await innovationUnits.deployed();
  console.log(`✅ New Innovation Units deployed to: ${innovationUnits.address}`);
  
  // Verify InnovationUnits is fully initialized
  try {
    const readyStatus = await innovationUnits.isReadyForDirectUse();
    if (readyStatus[0]) {
      console.log("✅ Innovation Units is fully initialized and ready for direct use");
    } else {
      console.log(`⚠️ Innovation Units not fully initialized: ${readyStatus[1]}`);
      
      // Try to initialize if needed
      if (!readyStatus[0]) {
        try {
          console.log("🔧 Initializing Innovation Units...");
          const initTx = await innovationUnits.initialize(celTokenAddress, protocolTreasuryAddress);
          await initTx.wait();
          console.log("✅ Innovation Units initialized successfully");
        } catch (error) {
          console.error("❌ Failed to initialize Innovation Units:", error.message);
        }
      }
    }
  } catch (error) {
    console.error("Error checking if contract is ready:", error.message);
  }

  // Save deployment information to a simple file
  const deploymentInfo = {
    network: "optimismSepolia",
    timestamp: new Date().toISOString(),
    oldAddress: oldInnovationUnitsAddress,
    newAddress: innovationUnits.address,
    celToken: celTokenAddress,
    protocolTreasury: protocolTreasuryAddress
  };
  
  const deploymentPath = path.join(__dirname, "../innovation-units-upgrade.json");
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\n📄 Deployment information saved to ${deploymentPath}`);

  // Print summary
  console.log("\n=== INNOVATION UNITS UPGRADE SUMMARY (OPTIMISM SEPOLIA) ===");
  console.log(`Old Innovation Units: ${oldInnovationUnitsAddress}`);
  console.log(`New Innovation Units: ${innovationUnits.address}`);
  console.log("=======================================");
  console.log("🎉 Upgrade completed successfully!");
  
  console.log("\n⚠️ IMPORTANT: Update your frontend contract addresses to point to the new contract!");
  console.log("Also, update any other contracts that interact with InnovationUnits to use the new address.");
  
  console.log("\n🔍 Verification command:");
  console.log(`npx hardhat verify --network optimismSepolia ${innovationUnits.address} "https://api.celystikhub.com/metadata/{id}" ${celTokenAddress} ${protocolTreasuryAddress}`);
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Upgrade failed:", error);
    process.exit(1);
  }); 