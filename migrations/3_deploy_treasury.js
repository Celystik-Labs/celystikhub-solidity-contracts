const CELToken = artifacts.require("CELToken");
const ProtocolTreasury = artifacts.require("ProtocolTreasury");

module.exports = async function(deployer, network, accounts) {
  console.log("Deploying Protocol Treasury contract...");
  console.log("Network:", network);
  
  // Get deployed instance of CEL token
  const celToken = await CELToken.deployed();
  console.log("CEL Token deployed at:", celToken.address);
  
  // Deploy Protocol Treasury contract
  await deployer.deploy(ProtocolTreasury, celToken.address);
  const protocolTreasury = await ProtocolTreasury.deployed();
  console.log("Protocol Treasury deployed at:", protocolTreasury.address);
  
  console.log("Protocol Treasury contract deployment complete!");
}; 