const CELToken = artifacts.require("CELToken");
const InnovationUnits = artifacts.require("InnovationUnits");
const ProjectStaking = artifacts.require("ProjectStaking");
const EmissionController = artifacts.require("EmissionController");
const Treasury = artifacts.require("Treasury");
const CelyHubFactory = artifacts.require("CelyHubFactory");

module.exports = async function(deployer, network, accounts) {
  console.log("Deploying CelyHubFactory contract...");
  console.log("Network:", network);
  
  // Get deployed instances of core contracts
  const celToken = await CELToken.deployed();
  const innovationUnits = await InnovationUnits.deployed();
  const projectStaking = await ProjectStaking.deployed();
  const emissionController = await EmissionController.deployed();
  const treasury = await Treasury.deployed();
  
  console.log("CEL Token deployed at:", celToken.address);
  console.log("InnovationUnits deployed at:", innovationUnits.address);
  console.log("ProjectStaking deployed at:", projectStaking.address);
  console.log("EmissionController deployed at:", emissionController.address);
  console.log("Treasury deployed at:", treasury.address);
  
  // Deploy CelyHubFactory contract
  await deployer.deploy(
    CelyHubFactory,
    celToken.address,
    innovationUnits.address,
    projectStaking.address,
    emissionController.address,
    treasury.address
  );
  
  const factory = await CelyHubFactory.deployed();
  console.log("CelyHubFactory deployed at:", factory.address);
  
  // Set Factory as the owner of InnovationUnits (optional, depending on your architecture)
  try {
    await innovationUnits.transferOwnership(factory.address);
    console.log("InnovationUnits ownership transferred to CelyHubFactory");
  } catch (error) {
    console.error("Failed to transfer InnovationUnits ownership:", error.message);
    console.log("You may need to transfer ownership manually");
  }
  
  // Authorize the Factory in the EmissionController (if needed)
  // This step depends on your specific architecture
  
  // Set up a test creator account for development/testing
  if (network === 'development' || network === 'test') {
    const testCreator = accounts[1];
    await factory.setCreatorAuthorization(testCreator, true);
    console.log("Test creator authorized:", testCreator);
  }
  
  console.log("CelyHubFactory deployment complete!");
}; 