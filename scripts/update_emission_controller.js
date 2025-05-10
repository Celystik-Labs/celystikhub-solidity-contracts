// SCRIPT TO UPDATE EMISSION CONTROLLER WITH NEW PROJECT STAKING ADDRESS
// Run with: npx hardhat run scripts/update_emission_controller.js --network optimismSepolia

require('dotenv').config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔄 Updating Emission Controller to use new ProjectStaking...");
  
  // Load the private key from the .env file
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("No private key provided in the .env file");
  }

  // Create a signer with the private key
  const deployer = new ethers.Wallet(privateKey);
  console.log(`📝 Updating with account: ${deployer.address}`);
  
  // Existing contract addresses
  const EMISSION_CONTROLLER = "0x0FC1660B47b419D4384CfEc6Cf6D2D177C1Dea57";
  
  // Read the new ProjectStaking address from deployment file
  const deploymentPath = path.join(__dirname, "../project-staking-update.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Deployment file not found. Please run the deploy_staking_update.js script first.");
  }
  
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const NEW_PROJECT_STAKING = deploymentData.contracts.updated.ProjectStaking.address;
  
  if (!NEW_PROJECT_STAKING) {
    throw new Error("New ProjectStaking address not found in deployment file.");
  }
  
  console.log(`Using new ProjectStaking address: ${NEW_PROJECT_STAKING}`);
  
  // Get the EmissionController contract instance
  console.log("Connecting to EmissionController contract...");
  
  // You'll need the ABI of the EmissionController contract
  // This is simplified - in a real scenario, you would load the full ABI
  const emissionControllerABI = [
    "function setProjectStaking(address _projectStaking) external",
    "function projectStaking() external view returns (address)"
  ];
  
  const emissionController = new ethers.Contract(
    EMISSION_CONTROLLER,
    emissionControllerABI,
    deployer
  );
  
  // Get current ProjectStaking address
  const currentProjectStaking = await emissionController.projectStaking();
  console.log(`Current ProjectStaking address: ${currentProjectStaking}`);
  
  // Update the ProjectStaking address
  console.log("Updating ProjectStaking address...");
  const tx = await emissionController.setProjectStaking(NEW_PROJECT_STAKING);
  
  console.log(`Transaction sent: ${tx.hash}`);
  console.log("Waiting for confirmation...");
  
  await tx.wait();
  
  // Verify the update
  const updatedProjectStaking = await emissionController.projectStaking();
  console.log(`Updated ProjectStaking address: ${updatedProjectStaking}`);
  
  if (updatedProjectStaking.toLowerCase() === NEW_PROJECT_STAKING.toLowerCase()) {
    console.log("✅ EmissionController successfully updated!");
  } else {
    console.error("❌ Update verification failed. Addresses don't match.");
  }
  
  // Update the deployment data
  deploymentData.emissionControllerUpdate = {
    timestamp: new Date().toISOString(),
    previousProjectStaking: currentProjectStaking,
    newProjectStaking: NEW_PROJECT_STAKING,
    transactionHash: tx.hash
  };
  
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(deploymentData, null, 2)
  );
  console.log(`📄 Deployment information updated in ${deploymentPath}`);
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Update failed:", error);
    process.exit(1);
  }); 