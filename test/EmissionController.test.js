const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EmissionController", function () {
  let CELToken;
  let celToken;
  let InnovationUnits;
  let innovationUnits;
  let Staking;
  let staking;
  let EmissionController;
  let emissionController;
  let owner;
  let creator;
  let contributor;
  let investor;
  let staker1;
  let staker2;
  let addrs;

  // Constants for testing
  const PROJECT_ID = 1;
  const PROJECT_NAME = "Test Project";
  const PROJECT_DESCRIPTION = "Test Project Description";
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 1 million tokens
  const CAP = ethers.utils.parseEther("10000000"); // 10 million tokens
  const PERIOD_EMISSION_CAP = ethers.utils.parseEther("20000"); // 20,000 tokens per period
  const EMISSION_DECAY_RATE = ethers.utils.parseEther("0.05"); // 5% decay rate
  const TOTAL_SUPPLY = ethers.utils.parseEther("100000"); // 100,000 IU tokens
  const CREATOR_SHARE = ethers.utils.parseEther("20"); // 20% scaled by PRECISION (1e18)
  const CONTRIBUTOR_RESERVE = ethers.utils.parseEther("30"); // 30% scaled by PRECISION
  const INVESTOR_RESERVE = ethers.utils.parseEther("50"); // 50% scaled by PRECISION
  const PRICE_PER_UNIT = ethers.utils.parseEther("0.01"); // 0.01 CEL per IU
  const STAKE_AMOUNT = ethers.utils.parseEther("1000");
  const STAKE_LIMIT = ethers.utils.parseEther("10000");
  
  beforeEach(async function () {
    // Get the ContractFactory and Signers here
    CELToken = await ethers.getContractFactory("CELToken");
    InnovationUnits = await ethers.getContractFactory("InnovationUnits");
    Staking = await ethers.getContractFactory("Staking");
    EmissionController = await ethers.getContractFactory("EmissionController");
    [owner, creator, contributor, investor, staker1, staker2, ...addrs] = await ethers.getSigners();

    // Deploy CEL Token
    celToken = await CELToken.deploy(
      "Celystik Hub Token", // name
      "CEL",              // symbol
      INITIAL_SUPPLY,     // Initial supply
      CAP                 // Cap
    );
    await celToken.deployed();

    // Deploy InnovationUnits
    innovationUnits = await InnovationUnits.deploy(celToken.address);
    await innovationUnits.deployed();

    // Deploy Staking
    staking = await Staking.deploy(celToken.address);
    await staking.deployed();

    // Deploy EmissionController
    emissionController = await EmissionController.deploy(
      celToken.address,
      PERIOD_EMISSION_CAP,
      EMISSION_DECAY_RATE
    );
    await emissionController.deployed();

    // Setup permissions
    await celToken.setMinter(emissionController.address, true);

    // Transfer contracts to EmissionController AFTER setup
    // Set contract addresses in EmissionController first
    await emissionController.setInnovationUnitsAddress(innovationUnits.address);
    await emissionController.setStakingAddress(staking.address);

    // Distribute a large amount of tokens for testing to make sure balances are sufficient
    await celToken.transfer(investor.address, ethers.utils.parseEther("100000"));
    await celToken.transfer(staker1.address, ethers.utils.parseEther("100000"));
    await celToken.transfer(staker2.address, ethers.utils.parseEther("100000"));
    await celToken.transfer(creator.address, ethers.utils.parseEther("100000"));
    await celToken.transfer(contributor.address, ethers.utils.parseEther("100000"));

    // Now transfer ownership after setup is complete
    await innovationUnits.transferOwnership(emissionController.address);
    await staking.transferOwnership(emissionController.address);
  });

  describe("Deployment and Setup", function () {
    it("Should deploy with correct parameters", async function () {
      expect(await emissionController.celToken()).to.equal(celToken.address);
      expect(await emissionController.periodEmissionCap()).to.equal(PERIOD_EMISSION_CAP);
      expect(await emissionController.emissionDecayRate()).to.equal(EMISSION_DECAY_RATE);
      expect(await emissionController.innovationUnits()).to.equal(innovationUnits.address);
      expect(await emissionController.staking()).to.equal(staking.address);
      expect(await celToken.isMinter(emissionController.address)).to.equal(true);
      expect(await innovationUnits.owner()).to.equal(emissionController.address);
      expect(await staking.owner()).to.equal(emissionController.address);
    });
  });

  describe("Project Creation and Management", function () {
    it("Should create a project with InitializeProject", async function () {
      // Create a new project using the updated function name
      await emissionController.InitializeProject(
        PROJECT_ID,
        PROJECT_NAME,
        PROJECT_DESCRIPTION,
        TOTAL_SUPPLY,
        CREATOR_SHARE,
        CONTRIBUTOR_RESERVE,
        INVESTOR_RESERVE,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );

      // Check project registry
      expect(await emissionController.projectRegistry(PROJECT_ID)).to.equal(true);
      expect(await emissionController.projectCount()).to.equal(1);

      // Check project in InnovationUnits
      const config = await innovationUnits.getProjectConfig(PROJECT_ID);
      expect(config.isActive).to.equal(true);
      expect(config.totalSupply).to.equal(TOTAL_SUPPLY);
      expect(config.creatorShare).to.equal(CREATOR_SHARE);
      expect(config.contributorReserve).to.equal(CONTRIBUTOR_RESERVE);
      expect(config.investorReserve).to.equal(INVESTOR_RESERVE);
      expect(config.pricePerUnit).to.equal(PRICE_PER_UNIT);
    });

    it("Should not allow creating a duplicate project", async function () {
      // Create the first project
      await emissionController.InitializeProject(
        PROJECT_ID,
        PROJECT_NAME,
        PROJECT_DESCRIPTION,
        TOTAL_SUPPLY,
        CREATOR_SHARE,
        CONTRIBUTOR_RESERVE,
        INVESTOR_RESERVE,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );

      // Try to create a duplicate
      await expect(
        emissionController.InitializeProject(
          PROJECT_ID,
          PROJECT_NAME,
          PROJECT_DESCRIPTION,
          TOTAL_SUPPLY,
          CREATOR_SHARE,
          CONTRIBUTOR_RESERVE,
          INVESTOR_RESERVE,
          PRICE_PER_UNIT,
          STAKE_LIMIT
        )
      ).to.be.revertedWith("EmissionController: project already exists");
    });

    it("Should update an existing project", async function () {
      // Create the project first
      await emissionController.InitializeProject(
        PROJECT_ID,
        PROJECT_NAME,
        PROJECT_DESCRIPTION,
        TOTAL_SUPPLY,
        CREATOR_SHARE,
        CONTRIBUTOR_RESERVE,
        INVESTOR_RESERVE,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );

      // Update the project with new parameters
      const newStakeLimit = ethers.utils.parseEther("20000");
      await emissionController.updateProject(PROJECT_ID, newStakeLimit, true);

      // Verify update in staking contract
      const stakingPool = await staking.getProjectStakingPool(PROJECT_ID);
      expect(stakingPool.stakeLimit).to.equal(newStakeLimit);
      expect(stakingPool.enabled).to.equal(true);
    });

    it("Should deactivate a project", async function () {
      // Create the project first
      await emissionController.InitializeProject(
        PROJECT_ID,
        PROJECT_NAME,
        PROJECT_DESCRIPTION,
        TOTAL_SUPPLY,
        CREATOR_SHARE,
        CONTRIBUTOR_RESERVE,
        INVESTOR_RESERVE,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );

      // Deactivate the project
      await emissionController.updateProject(PROJECT_ID, STAKE_LIMIT, false);

      // Verify project is deactivated in staking contract
      const stakingPool = await staking.getProjectStakingPool(PROJECT_ID);
      expect(stakingPool.enabled).to.equal(false);

      // Verify project is deactivated in InnovationUnits (price set to 0)
      const config = await innovationUnits.getProjectConfig(PROJECT_ID);
      expect(config.pricePerUnit).to.equal(0);
    });
  });

  describe("Role Assignments", function () {
    beforeEach(async function () {
      // Create the project first
      await emissionController.InitializeProject(
        PROJECT_ID,
        PROJECT_NAME,
        PROJECT_DESCRIPTION,
        TOTAL_SUPPLY,
        CREATOR_SHARE,
        CONTRIBUTOR_RESERVE,
        INVESTOR_RESERVE,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );
    });

    it("Should assign creator role", async function () {
      await emissionController.assignCreator(PROJECT_ID, creator.address);

      // Check creator IUs in InnovationUnits
      const creatorBalance = await innovationUnits.balanceOf(creator.address, PROJECT_ID);
      expect(creatorBalance).to.be.gt(0);
    });

    it("Should assign contributor role", async function () {
      const contributionAmount = ethers.utils.parseEther("100");
      await emissionController.assignContributor(PROJECT_ID, contributor.address, contributionAmount);

      // Check contributor IUs in InnovationUnits
      const contributorBalance = await innovationUnits.balanceOf(contributor.address, PROJECT_ID);
      expect(contributorBalance).to.equal(contributionAmount);
    });
  });

  describe("Emission Parameters", function () {
    it("Should update emission parameters", async function () {
      const newEmissionCap = ethers.utils.parseEther("30000");
      const newDecayRate = ethers.utils.parseEther("0.1"); // 10% decay

      await emissionController.updateEmissionParameters(newEmissionCap, newDecayRate);

      expect(await emissionController.periodEmissionCap()).to.equal(newEmissionCap);
      expect(await emissionController.emissionDecayRate()).to.equal(newDecayRate);
    });

    it("Should update weight parameters", async function () {
      const newAlpha = ethers.utils.parseEther("1.5"); // 1.5 weight for staking
      const newBeta = ethers.utils.parseEther("0.8"); // 0.8 weight for IU holdings

      await emissionController.updateWeightParameters(newAlpha, newBeta);

      expect(await emissionController.alpha()).to.equal(newAlpha);
      expect(await emissionController.beta()).to.equal(newBeta);
    });
  });

  describe("Emission Period", function () {
    it("Should update emission period", async function () {
      // Check initial period
      expect(await emissionController.currentPeriod()).to.equal(0);

      // Advance time by one emission period (7 days)
      const EMISSION_PERIOD_SECONDS = 7 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [EMISSION_PERIOD_SECONDS]);
      await ethers.provider.send("evm_mine");

      // Update emission period
      await emissionController.updateEmissionPeriod();

      // Check period updated
      expect(await emissionController.currentPeriod()).to.equal(1);
    });

    it("Should decay emission cap after period update", async function () {
      // Get initial emission cap
      const initialCap = await emissionController.periodEmissionCap();

      // Advance time by one emission period (7 days)
      const EMISSION_PERIOD_SECONDS = 7 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [EMISSION_PERIOD_SECONDS]);
      await ethers.provider.send("evm_mine");

      // Update emission period
      await emissionController.updateEmissionPeriod();

      // Check cap was reduced by decay rate
      const newCap = await emissionController.periodEmissionCap();
      const PRECISION = ethers.utils.parseEther("1");
      const expectedCap = initialCap.mul(PRECISION.sub(EMISSION_DECAY_RATE)).div(PRECISION);
      
      expect(newCap).to.be.closeTo(expectedCap, 100); // Allow small precision differences
    });
  });

  describe("Token Emissions", function () {
    beforeEach(async function () {
      // Create a project first
      await emissionController.InitializeProject(
        PROJECT_ID,
        PROJECT_NAME,
        PROJECT_DESCRIPTION,
        TOTAL_SUPPLY,
        CREATOR_SHARE,
        CONTRIBUTOR_RESERVE,
        INVESTOR_RESERVE,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );

      // Assign roles
      await emissionController.assignCreator(PROJECT_ID, creator.address);
      await emissionController.assignContributor(PROJECT_ID, contributor.address, ethers.utils.parseEther("100"));

      // Set up project weights
      await emissionController.updateStakingWeight(PROJECT_ID, ethers.utils.parseEther("100"));
      await emissionController.updateIUWeight(PROJECT_ID, ethers.utils.parseEther("100"));

      // Set up user shares
      await emissionController.updateUserStakingShare(PROJECT_ID, staker1.address, ethers.utils.parseEther("0.5"));
      await emissionController.updateUserIUShare(PROJECT_ID, creator.address, ethers.utils.parseEther("0.7"));
    });

    it("Should emit tokens to an account", async function () {
      const emissionAmount = ethers.utils.parseEther("1000");
      const initialBalance = await celToken.balanceOf(staker1.address);
      
      await emissionController.emitTokens(staker1.address, emissionAmount);
      
      const newBalance = await celToken.balanceOf(staker1.address);
      expect(newBalance.sub(initialBalance)).to.equal(emissionAmount);
      
      // Check emission tracking
      expect(await emissionController.currentPeriodEmitted()).to.equal(emissionAmount);
      expect(await emissionController.totalEmitted()).to.equal(emissionAmount);
    });

    it("Should distribute emissions to projects", async function () {
      // Distribute emissions
      await emissionController.distributeEmissions();
      
      // Check project emissions
      const projectEmissions = await emissionController.getProjectEmissions(PROJECT_ID);
      expect(projectEmissions).to.be.gt(0);
    });

    it("Should allow claiming rewards", async function () {
      // Distribute emissions first
      await emissionController.distributeEmissions();
      
      // Get initial balance
      const initialBalance = await celToken.balanceOf(staker1.address);
      
      // Claim rewards
      await emissionController.connect(staker1).claimRewards(PROJECT_ID);
      
      // Check new balance
      const newBalance = await celToken.balanceOf(staker1.address);
      expect(newBalance).to.be.gt(initialBalance);
    });
  });
}); 