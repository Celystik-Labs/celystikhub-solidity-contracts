const CELToken = artifacts.require("CELToken");
const InnovationUnits = artifacts.require("InnovationUnits");
const ProtocolTreasury = artifacts.require("ProtocolTreasury");

module.exports = async function(deployer, network, accounts) {
  console.log("Initializing InnovationUnits contract...");
  console.log("Network:", network);
  
  // Get deployed instances
  const celToken = await CELToken.deployed();
  const innovationUnits = await InnovationUnits.deployed();
  const protocolTreasury = await ProtocolTreasury.deployed();
  
  console.log("CEL Token deployed at:", celToken.address);
  console.log("InnovationUnits deployed at:", innovationUnits.address);
  console.log("Protocol Treasury deployed at:", protocolTreasury.address);
  
  // Initialize InnovationUnits with CEL token and Protocol Treasury
  try {
    await innovationUnits.initialize(celToken.address, protocolTreasury.address);
    console.log("InnovationUnits successfully initialized with CEL token and Protocol Treasury");
  } catch (error) {
    console.error("Failed to initialize InnovationUnits:", error.message);
    console.log("The contract may already be initialized, or there might be a permission issue");
  }
  
  console.log("InnovationUnits initialization complete!");
}; 