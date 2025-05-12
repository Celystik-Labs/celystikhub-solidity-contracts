// Script to update the frontend contract addresses after redeployment
// Run this script after redeployment to update the frontend contract addresses
// Usage: node update_frontend_addresses.js

const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🔄 Updating frontend contract addresses...');

  // Load the redeployment data
  const redeploymentPath = path.join(__dirname, '../redeployment-optimism-sepolia.json');
  let redeploymentData;
  
  try {
    const data = fs.readFileSync(redeploymentPath, 'utf8');
    redeploymentData = JSON.parse(data);
  } catch (error) {
    console.error('❌ Error reading redeployment data:', error.message);
    process.exit(1);
  }

  // Get contract addresses from redeployment data
  const contracts = redeploymentData.contracts;
  
  // Prepare addresses object
  const addresses = {
    CEL_TOKEN: contracts.CELToken.address,
    PROTOCOL_TREASURY: contracts.ProtocolTreasury.address,
    INNOVATION_UNITS: contracts.InnovationUnits.address,
    PROJECT_STAKING: contracts.ProjectStaking.address,
    EMISSION_CONTROLLER: contracts.EmissionController.address
  };
  
  console.log('📝 New contract addresses:');
  console.log(JSON.stringify(addresses, null, 2));

  // Update frontend constants file
  const frontendContractsPath = path.join(__dirname, '../../celystikhub-frontend/src/constants/contracts.js');
  
  try {
    let contractsFile = fs.readFileSync(frontendContractsPath, 'utf8');
    
    // Update each contract address
    Object.keys(addresses).forEach(key => {
      const regex = new RegExp(`(OPTIMISM_SEPOLIA:\\s*{[^}]*${key}:\\s*["'])([^"']+)(["'][^}]*)`, 's');
      contractsFile = contractsFile.replace(regex, `$1${addresses[key]}$3`);
    });
    
    // Write the updated file
    fs.writeFileSync(frontendContractsPath, contractsFile, 'utf8');
    console.log('✅ Frontend contract addresses updated successfully');
  } catch (error) {
    console.error('❌ Error updating frontend contract addresses:', error.message);
    process.exit(1);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error updating frontend addresses:', error);
    process.exit(1);
  }); 