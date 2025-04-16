// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  console.log("Starting deployment of Celystik Hub contracts...");

  // Get the signer accounts
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH`);

  // Constants for deployment
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 1 million tokens
  const TOKEN_CAP = ethers.utils.parseEther("10000000"); // 10 million tokens
  const EMISSION_CAP = ethers.utils.parseEther("20000"); // 20,000 tokens per period
  const DECAY_RATE = ethers.utils.parseEther("0.05"); // 5% decay

  // Deploy CEL Token
  console.log("\nDeploying CEL Token...");
  const CELToken = await ethers.getContractFactory("CELToken");
  const celToken = await CELToken.deploy(
    "Celystik Hub Token",  // Name
    "CEL",                 // Symbol
    INITIAL_SUPPLY,        // Initial supply
    TOKEN_CAP              // Cap
  );
  await celToken.deployed();
  console.log(`CEL Token deployed to: ${celToken.address}`);

  // Deploy InnovationUnits
  console.log("\nDeploying InnovationUnits...");
  const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
  const innovationUnits = await InnovationUnits.deploy(celToken.address);
  await innovationUnits.deployed();
  console.log(`InnovationUnits deployed to: ${innovationUnits.address}`);

  // Deploy Staking
  console.log("\nDeploying Staking...");
  const Staking = await ethers.getContractFactory("Staking");
  const staking = await Staking.deploy(celToken.address);
  await staking.deployed();
  console.log(`Staking deployed to: ${staking.address}`);

  // Deploy EmissionController
  console.log("\nDeploying EmissionController...");
  const EmissionController = await ethers.getContractFactory("EmissionController");
  const emissionController = await EmissionController.deploy(
    celToken.address,
    EMISSION_CAP,
    DECAY_RATE
  );
  await emissionController.deployed();
  console.log(`EmissionController deployed to: ${emissionController.address}`);

  // Deploy ProjectFactory
  console.log("\nDeploying ProjectFactory...");
  const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
  const projectFactory = await ProjectFactory.deploy(
    innovationUnits.address,
    staking.address
  );
  await projectFactory.deployed();
  console.log(`ProjectFactory deployed to: ${projectFactory.address}`);

  // Set up contract relationships
  console.log("\nSetting up contract relationships...");

  // 1. Set EmissionController as a minter for CEL tokens
  console.log("Setting EmissionController as a minter for CEL tokens...");
  const minterTx = await celToken.setMinter(emissionController.address, true);
  await minterTx.wait();

  // 2. Set contract addresses in EmissionController
  console.log("Setting contract addresses in EmissionController...");
  let tx = await emissionController.setInnovationUnitsAddress(innovationUnits.address);
  await tx.wait();
  tx = await emissionController.setStakingAddress(staking.address);
  await tx.wait();
  tx = await emissionController.setProjectFactoryAddress(projectFactory.address);
  await tx.wait();

  // 3. Transfer ownership of contracts
  console.log("Transferring ownership of contracts...");
  tx = await innovationUnits.transferOwnership(emissionController.address);
  await tx.wait();
  tx = await staking.transferOwnership(emissionController.address);
  await tx.wait();
  tx = await emissionController.transferOwnership(projectFactory.address);
  await tx.wait();

  // Save contract addresses to a file
  console.log("\nSaving contract addresses to file...");
  const deploymentInfo = {
    network: network.name,
    celToken: celToken.address,
    innovationUnits: innovationUnits.address,
    staking: staking.address,
    emissionController: emissionController.address,
    projectFactory: projectFactory.address,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  const deploymentDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir);
  }

  const filePath = path.join(deploymentDir, `${network.name}-deployment.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment information saved to ${filePath}`);

  console.log("\nDeployment completed successfully!");
  console.log("Summary:");
  console.log(`CEL Token: ${celToken.address}`);
  console.log(`InnovationUnits: ${innovationUnits.address}`);
  console.log(`Staking: ${staking.address}`);
  console.log(`EmissionController: ${emissionController.address}`);
  console.log(`ProjectFactory: ${projectFactory.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 