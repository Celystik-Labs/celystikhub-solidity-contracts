// deploy_emission_controller_only.js
// Script to deploy only a new EmissionController contract
// Run with: npx hardhat run scripts/deploy_emission_controller_only.js --network optimismSepolia

require('dotenv').config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting EmissionController redeployment on Optimism Sepolia Testnet...");
  
  // Load the private key from the .env file
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("No private key provided in the .env file");
  }

  // Create a new wallet with the private key
  const provider = ethers.provider;
  const deployer = new ethers.Wallet(privateKey, provider);
  console.log(`📝 Deploying contract with account: ${deployer.address}`);
  
  // For tracking deployment status
  const deploymentData = {
    network: "optimismSepolia",
    chainId: 11155420,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  // Define existing contract addresses
  const existingAddresses = {
    CELToken: "0xA9D722bcF7728D73790ab1d1dff2Bc681c032ba6",
    ProtocolTreasury: "0x8C0E974e4e9020708a09154e4477116DC776b6fE",
    InnovationUnits: "0x3fD9776fE63fE13C51764BC6a3Ad235846FF6B83",
    ProjectStaking: "0x6b6B242413F865E50Ff9C56d28c67a60B8afDe7B"
  };

  console.log("\n🔷 Using existing contract addresses:");
  console.log(`CEL Token: ${existingAddresses.CELToken}`);
  console.log(`Protocol Treasury: ${existingAddresses.ProtocolTreasury}`);
  console.log(`Innovation Units: ${existingAddresses.InnovationUnits}`);
  console.log(`Project Staking: ${existingAddresses.ProjectStaking}`);

  // Deploy new EmissionController only
  console.log("\n🔷 Deploying new EmissionController...");
  const EmissionController = await ethers.getContractFactory("EmissionController", deployer);
  const emissionController = await EmissionController.deploy(
    existingAddresses.CELToken,
    existingAddresses.ProjectStaking,
    existingAddresses.InnovationUnits
  );
  await emissionController.deployed();
  console.log(`✅ New EmissionController deployed to: ${emissionController.address}`);
  
  deploymentData.contracts.EmissionController = {
    address: emissionController.address,
    constructorArgs: [
      existingAddresses.CELToken,
      existingAddresses.ProjectStaking,
      existingAddresses.InnovationUnits
    ]
  };

  // Grant minter role to the new EmissionController
  console.log("\n📝 Setting up permissions...");
  const celToken = await ethers.getContractAt("ICELToken", existingAddresses.CELToken, deployer);
  
  try {
    console.log("🔑 Setting minter role for new EmissionController...");
    const minterTx = await celToken.setMinter(emissionController.address, true);
    await minterTx.wait();
    console.log("✅ Minter role granted to new EmissionController");
  } catch (error) {
    console.error("❌ Failed to set minter role:", error.message);
    console.log("⚠️ You may need to call setMinter separately if this account doesn't have permission");
  }
  
  // Set EmissionController in ProjectStaking
  try {
    console.log("🔑 Setting EmissionController in ProjectStaking...");
    const projectStaking = await ethers.getContractAt("IProjectStaking", existingAddresses.ProjectStaking, deployer);
    const emissionSetTx = await projectStaking.setEmissionController(emissionController.address);
    await emissionSetTx.wait();
    console.log("✅ New EmissionController set in ProjectStaking");
  } catch (error) {
    console.error("❌ Failed to set EmissionController in ProjectStaking:", error.message);
    console.log("⚠️ You may need to call setEmissionController separately if this account doesn't have permission");
  }

  // Save deployment information to a file
  const deploymentPath = path.join(__dirname, "../emission-controller-redeployment.json");
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(deploymentData, null, 2)
  );
  console.log(`\n📄 Deployment information saved to ${deploymentPath}`);

  // Print summary
  console.log("\n=== EMISSION CONTROLLER REDEPLOYMENT SUMMARY (OPTIMISM SEPOLIA) ===");
  console.log(`New EmissionController: ${emissionController.address}`);
  console.log("=======================================");
  console.log("🎉 Deployment completed successfully!");
  
  console.log("\n🔍 Verification command:");
  console.log(`npx hardhat verify --network optimismSepolia ${emissionController.address} ${existingAddresses.CELToken} ${existingAddresses.ProjectStaking} ${existingAddresses.InnovationUnits}`);
  
  // Print next steps
  console.log("\n🚀 Next steps:");
  console.log("1. Update the EmissionController address in your frontend constants");
  console.log(`2. If setting permissions failed, call setMinter(${emissionController.address}, true) on the CELToken`);
  console.log(`3. If setting permissions failed, call setEmissionController(${emissionController.address}) on the ProjectStaking contract`);
  console.log("4. Verify the contract on Optimism Sepolia Etherscan using the command above");
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });