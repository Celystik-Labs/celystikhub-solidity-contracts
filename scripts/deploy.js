// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  console.log("Deploying contracts...");

  // Get the deployer's account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Deploy CEL Token
  const CELToken = await hre.ethers.getContractFactory("CELToken");
  const celToken = await CELToken.deploy(
    "Celystik Hub Token", // name
    "CEL",               // symbol
    hre.ethers.utils.parseEther("10000000"),  // Initial supply: 10 million tokens
    hre.ethers.utils.parseEther("100000000") // Cap: 100 million tokens
  );
  await celToken.deployed();
  console.log("CELToken deployed to:", celToken.address);

  // Deploy EmissionController
  const EmissionController = await hre.ethers.getContractFactory("EmissionController");
  const emissionController = await EmissionController.deploy(
    celToken.address,                      // CEL token address
    hre.ethers.utils.parseEther("100000"), // Initial emission cap per period: 100k tokens
    hre.ethers.utils.parseEther("0.05")    // Emission decay rate: 5%
  );
  await emissionController.deployed();
  console.log("EmissionController deployed to:", emissionController.address);

  // Deploy InnovationUnits
  const InnovationUnits = await hre.ethers.getContractFactory("InnovationUnits");
  const innovationUnits = await InnovationUnits.deploy(
    celToken.address // CEL token address
  );
  await innovationUnits.deployed();
  console.log("InnovationUnits deployed to:", innovationUnits.address);

  // Deploy Staking
  const Staking = await hre.ethers.getContractFactory("Staking");
  const staking = await Staking.deploy(
    celToken.address // CEL token address
  );
  await staking.deployed();
  console.log("Staking deployed to:", staking.address);

  // Set up permissions
  console.log("Setting up permissions...");
  
  // Give mint permission to EmissionController
  await celToken.setMinter(emissionController.address, true);
  console.log("Granted mint permission to EmissionController");

  // Transfer ownership of InnovationUnits to EmissionController
  await innovationUnits.transferOwnership(emissionController.address);
  console.log("Transferred ownership of InnovationUnits to EmissionController");

  // Transfer ownership of Staking to EmissionController
  await staking.transferOwnership(emissionController.address);
  console.log("Transferred ownership of Staking to EmissionController");

  console.log("Deployment completed successfully!");
  
  // Return the deployed contract addresses
  return {
    celToken: celToken.address,
    emissionController: emissionController.address,
    innovationUnits: innovationUnits.address,
    staking: staking.address
  };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then((deployedContracts) => {
    console.log("Deployed contract addresses:", deployedContracts);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 