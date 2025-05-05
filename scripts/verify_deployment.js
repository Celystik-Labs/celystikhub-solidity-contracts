// VERIFICATION SCRIPT FOR CELYSTIK HUB
// This script checks that all contracts are properly deployed and initialized
// Run with: npx hardhat run scripts/verify_deployment.js --network <network_name>

const { ethers } = require("hardhat");
const chalk = require('chalk'); // Optional: npm install chalk for colored console output

// Contract addresses - replace with actual addresses from your deployment
// You can replace these with a configuration file or environment variables
const CONTRACT_ADDRESSES = {
  celToken: "",
  protocolTreasury: "",
  innovationUnits: "",
  projectStaking: "",
  emissionController: "",
  celyHubFactory: "", // Optional
};

async function main() {
  console.log(chalk?.blue("🔍 Starting Celystik Hub deployment verification...") || "🔍 Starting Celystik Hub deployment verification...");
  
  // Get command line arguments - contract addresses
  const args = process.argv.slice(2);
  
  if (args.length < 5) {
    console.error("Usage: npx hardhat run scripts/verify_deployment.js --network <network_name> <cel_token> <protocol_treasury> <innovation_units> <project_staking> <emission_controller> [cely_hub_factory]");
    process.exit(1);
  }
  
  const [deployer] = await ethers.getSigners();
  console.log(`Verifying deployment with account: ${deployer.address}`);
  
  const celTokenAddress = args[0];
  const protocolTreasuryAddress = args[1];
  const innovationUnitsAddress = args[2];
  const projectStakingAddress = args[3];
  const emissionControllerAddress = args[4];
  const celyHubFactoryAddress = args.length > 5 ? args[5] : null;
  
  // Load contract instances
  const CELToken = await ethers.getContractFactory("CELToken");
  const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const ProjectStaking = await ethers.getContractFactory("ProjectStaking");
  const EmissionController = await ethers.getContractFactory("EmissionController");
  
  const celToken = await CELToken.attach(celTokenAddress);
  const protocolTreasury = await ProtocolTreasury.attach(protocolTreasuryAddress);
  const innovationUnits = await InnovationUnits.attach(innovationUnitsAddress);
  const projectStaking = await ProjectStaking.attach(projectStakingAddress);
  const emissionController = await EmissionController.attach(emissionControllerAddress);
  
  let celyHubFactory = null;
  if (celyHubFactoryAddress) {
    const CelyHubFactory = await ethers.getContractFactory("CelyHubFactory");
    celyHubFactory = await CelyHubFactory.attach(celyHubFactoryAddress);
  }
  
  // Verify connections
  console.log("\n--------- Verifying Contract Connections ---------");
  
  // 1. Verify Protocol Treasury
  try {
    const treasuryCelToken = await protocolTreasury.celToken();
    console.log(`✓ Protocol Treasury's CEL Token: ${treasuryCelToken}`);
    console.log(`  Expected: ${celTokenAddress}`);
    if (treasuryCelToken.toLowerCase() !== celTokenAddress.toLowerCase()) {
      console.error(`  ERROR: Protocol Treasury has incorrect CEL Token address!`);
    }
  } catch (error) {
    console.error(`✗ Failed to verify Protocol Treasury: ${error.message}`);
  }
  
  // 2. Verify Innovation Units
  try {
    const iuCelToken = await innovationUnits.celToken();
    console.log(`✓ Innovation Units' CEL Token: ${iuCelToken}`);
    console.log(`  Expected: ${celTokenAddress}`);
    
    const iuTreasury = await innovationUnits.protocolTreasury();
    console.log(`✓ Innovation Units' Protocol Treasury: ${iuTreasury}`);
    console.log(`  Expected: ${protocolTreasuryAddress}`);
    
    if (iuCelToken.toLowerCase() !== celTokenAddress.toLowerCase()) {
      console.error(`  ERROR: Innovation Units has incorrect CEL Token address!`);
    }
    
    if (iuTreasury.toLowerCase() !== protocolTreasuryAddress.toLowerCase()) {
      console.error(`  ERROR: Innovation Units has incorrect Protocol Treasury address!`);
    }
    
    // Check if ready for direct use
    const readyForDirectUse = await innovationUnits.isReadyForDirectUse();
    console.log(`✓ Innovation Units ready for direct use: ${readyForDirectUse[0]}`);
    if (!readyForDirectUse[0]) {
      console.error(`  WARNING: Innovation Units not ready for direct use. Missing: ${readyForDirectUse[1]}`);
    }
  } catch (error) {
    console.error(`✗ Failed to verify Innovation Units: ${error.message}`);
  }
  
  // 3. Verify Project Staking
  try {
    const stakingIU = await projectStaking.innovationUnits();
    console.log(`✓ Project Staking's Innovation Units: ${stakingIU}`);
    console.log(`  Expected: ${innovationUnitsAddress}`);
    
    const stakingEmissionController = await projectStaking.emissionController();
    console.log(`✓ Project Staking's Emission Controller: ${stakingEmissionController}`);
    
    if (stakingIU.toLowerCase() !== innovationUnitsAddress.toLowerCase()) {
      console.error(`  ERROR: Project Staking has incorrect Innovation Units address!`);
    }
    
    if (stakingEmissionController.toLowerCase() !== emissionControllerAddress.toLowerCase() && 
        stakingEmissionController !== ethers.constants.AddressZero) {
      console.error(`  ERROR: Project Staking has incorrect Emission Controller address!`);
    }
  } catch (error) {
    console.error(`✗ Failed to verify Project Staking: ${error.message}`);
  }
  
  // 4. Verify Emission Controller
  try {
    const ecCelToken = await emissionController.celToken();
    console.log(`✓ Emission Controller's CEL Token: ${ecCelToken}`);
    console.log(`  Expected: ${celTokenAddress}`);
    
    const ecProjectStaking = await emissionController.projectStaking();
    console.log(`✓ Emission Controller's Project Staking: ${ecProjectStaking}`);
    console.log(`  Expected: ${projectStakingAddress}`);
    
    if (ecCelToken.toLowerCase() !== celTokenAddress.toLowerCase()) {
      console.error(`  ERROR: Emission Controller has incorrect CEL Token address!`);
    }
    
    if (ecProjectStaking.toLowerCase() !== projectStakingAddress.toLowerCase()) {
      console.error(`  ERROR: Emission Controller has incorrect Project Staking address!`);
    }
    
    // Check minter role in CEL Token
    const MINTER_ROLE = await celToken.MINTER_ROLE();
    const hasMinterRole = await celToken.hasRole(MINTER_ROLE, emissionControllerAddress);
    console.log(`✓ Emission Controller has MINTER_ROLE in CEL Token: ${hasMinterRole}`);
    if (!hasMinterRole) {
      console.error(`  WARNING: Emission Controller does not have MINTER_ROLE!`);
    }
  } catch (error) {
    console.error(`✗ Failed to verify Emission Controller: ${error.message}`);
  }
  
  // 5. Verify Factory (if provided)
  if (celyHubFactory) {
    try {
      const factoryCelToken = await celyHubFactory.celToken();
      console.log(`✓ CelyHub Factory's CEL Token: ${factoryCelToken}`);
      console.log(`  Expected: ${celTokenAddress}`);
      
      const factoryInnovationUnits = await celyHubFactory.innovationUnits();
      console.log(`✓ CelyHub Factory's Innovation Units: ${factoryInnovationUnits}`);
      console.log(`  Expected: ${innovationUnitsAddress}`);
      
      const factoryProjectStaking = await celyHubFactory.projectStaking();
      console.log(`✓ CelyHub Factory's Project Staking: ${factoryProjectStaking}`);
      console.log(`  Expected: ${projectStakingAddress}`);
      
      const factoryEmissionController = await celyHubFactory.emissionController();
      console.log(`✓ CelyHub Factory's Emission Controller: ${factoryEmissionController}`);
      console.log(`  Expected: ${emissionControllerAddress}`);
      
      const factoryTreasury = await celyHubFactory.protocolTreasury();
      console.log(`✓ CelyHub Factory's Protocol Treasury: ${factoryTreasury}`);
      console.log(`  Expected: ${protocolTreasuryAddress}`);
      
      if (factoryCelToken.toLowerCase() !== celTokenAddress.toLowerCase()) {
        console.error(`  ERROR: CelyHub Factory has incorrect CEL Token address!`);
      }
      
      if (factoryInnovationUnits.toLowerCase() !== innovationUnitsAddress.toLowerCase()) {
        console.error(`  ERROR: CelyHub Factory has incorrect Innovation Units address!`);
      }
      
      if (factoryProjectStaking.toLowerCase() !== projectStakingAddress.toLowerCase()) {
        console.error(`  ERROR: CelyHub Factory has incorrect Project Staking address!`);
      }
      
      if (factoryEmissionController.toLowerCase() !== emissionControllerAddress.toLowerCase()) {
        console.error(`  ERROR: CelyHub Factory has incorrect Emission Controller address!`);
      }
      
      if (factoryTreasury.toLowerCase() !== protocolTreasuryAddress.toLowerCase()) {
        console.error(`  ERROR: CelyHub Factory has incorrect Protocol Treasury address!`);
      }
    } catch (error) {
      console.error(`✗ Failed to verify CelyHub Factory: ${error.message}`);
    }
  }
  
  // 6. Verify Permissions and Roles
  console.log("\n--------- Verifying Permissions and Roles ---------");
  
  try {
    const MINTER_ROLE = await celToken.MINTER_ROLE();
    const DEFAULT_ADMIN_ROLE = await celToken.DEFAULT_ADMIN_ROLE();
    
    const deployer_is_admin = await celToken.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    console.log(`✓ Deployer has DEFAULT_ADMIN_ROLE in CEL Token: ${deployer_is_admin}`);
    
    const emissionController_is_minter = await celToken.hasRole(MINTER_ROLE, emissionControllerAddress);
    console.log(`✓ Emission Controller has MINTER_ROLE in CEL Token: ${emissionController_is_minter}`);
    
    const innovationUnits_owner = await innovationUnits.owner();
    console.log(`✓ Innovation Units owner: ${innovationUnits_owner}`);
    
    const projectStaking_owner = await projectStaking.owner();
    console.log(`✓ Project Staking owner: ${projectStaking_owner}`);
    
    const emissionController_owner = await emissionController.owner();
    console.log(`✓ Emission Controller owner: ${emissionController_owner}`);
    
    const protocolTreasury_owner = await protocolTreasury.owner();
    console.log(`✓ Protocol Treasury owner: ${protocolTreasury_owner}`);
    
    if (celyHubFactory) {
      const factory_owner = await celyHubFactory.owner();
      console.log(`✓ CelyHub Factory owner: ${factory_owner}`);
    }
  } catch (error) {
    console.error(`✗ Failed to verify permissions: ${error.message}`);
  }
  
  // 7. Check project creation permission
  console.log("\n--------- Testing Project Creation Permissions ---------");
  try {
    // This won't actually create a project, just simulate the call
    const testResult = await innovationUnits.callStatic.createProject(
      ethers.utils.parseEther("1000000"),
      ethers.utils.parseEther("0.01"),
      [deployer.address],
      [10000],
      6000,
      2000,
      2000
    );
    console.log(`✓ Project creation is allowed for normal users (anyone can create projects)`);
  } catch (error) {
    if (error.message.includes("revert")) {
      console.error(`✗ Failed project creation test: ${error.message}`);
    } else {
      console.log(`? Could not determine project creation permissions: ${error.message}`);
    }
  }
  
  console.log("\n--------- Deployment Verification Complete ---------");
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk?.red(`❌ Verification failed: ${error}`) || `❌ Verification failed: ${error}`);
    process.exit(1);
  }); 