const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EmissionController with ProjectFactory Pattern", function () {
  let celToken;
  let innovationUnits;
  let staking;
  let emissionController;
  let projectFactory;
  let owner;
  let creator;
  let contributor;
  let investor;
  let staker;

  // Constants for testing
  const PROJECT_ID = 1;
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 1 million tokens
  const CAP = ethers.utils.parseEther("10000000"); // 10 million tokens
  const EMISSION_CAP = ethers.utils.parseEther("20000"); // 20,000 tokens per period
  const DECAY_RATE = ethers.utils.parseEther("0.05"); // 5% decay
  const STAKE_AMOUNT = ethers.utils.parseEther("1000"); // 1,000 CEL
  const STAKE_LIMIT = ethers.utils.parseEther("100000"); // 100,000 CEL
  const CREATOR_SHARE = 2000; // 20% in basis points
  const CONTRIBUTOR_SHARE = 3000; // 30% in basis points
  const INVESTOR_SHARE = 5000; // 50% in basis points
  const TOTAL_SUPPLY = 1000000; // 1 million IUs
  const PRICE_PER_UNIT = 1; // 1 CEL per IU
  const SECONDS_IN_DAY = 86400;
  const DAYS_IN_PERIOD = 7;
  const EMISSION_PERIOD_SECONDS = SECONDS_IN_DAY * DAYS_IN_PERIOD;

  beforeEach(async function () {
    // Get signers
    [owner, creator, contributor, investor, staker] = await ethers.getSigners();

    // Deploy CEL Token
    const CELToken = await ethers.getContractFactory("CELToken");
    celToken = await CELToken.deploy(
      "Celystik Hub Token",
      "CEL",
      INITIAL_SUPPLY,
      CAP
    );
    await celToken.deployed();

    // Deploy InnovationUnits
    const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
    innovationUnits = await InnovationUnits.deploy(celToken.address);
    await innovationUnits.deployed();

    // Deploy Staking
    const Staking = await ethers.getContractFactory("Staking");
    staking = await Staking.deploy(celToken.address);
    await staking.deployed();

    // Deploy EmissionController
    const EmissionController = await ethers.getContractFactory("EmissionController");
    emissionController = await EmissionController.deploy(
      celToken.address,
      EMISSION_CAP,
      DECAY_RATE
    );
    await emissionController.deployed();

    // Deploy ProjectFactory with only innovation units and staking addresses
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    projectFactory = await ProjectFactory.deploy(
      innovationUnits.address,
      staking.address
    );
    await projectFactory.deployed();

    // Set up contract relationships - order matters!
    // 1. CEL Token: Add EmissionController as minter
    await celToken.setMinter(emissionController.address, true);
    
    // 2. Set InnovationUnits and Staking ownership to EmissionController
    await innovationUnits.transferOwnership(emissionController.address);
    await staking.transferOwnership(emissionController.address);
    
    // 3. Set EmissionController contract addresses before transferring ownership
    await emissionController.setInnovationUnitsAddress(innovationUnits.address);
    await emissionController.setStakingAddress(staking.address);
    await emissionController.setProjectFactoryAddress(projectFactory.address);
    
    // 4. Transfer EmissionController ownership to ProjectFactory
    await emissionController.transferOwnership(projectFactory.address);

    // Distribute initial CEL tokens for testing
    await celToken.transfer(investor.address, ethers.utils.parseEther("50000"));
    await celToken.transfer(contributor.address, ethers.utils.parseEther("50000"));
    await celToken.transfer(staker.address, ethers.utils.parseEther("50000"));

    // Create a project using ProjectFactory directly
    await projectFactory.createProject(
      PROJECT_ID,
      CREATOR_SHARE,
      CONTRIBUTOR_SHARE,
      INVESTOR_SHARE,
      TOTAL_SUPPLY,
      PRICE_PER_UNIT,
      STAKE_LIMIT
    );

    // Assign creator using ProjectFactory directly
    await projectFactory.assignCreator(PROJECT_ID, creator.address);
  });

  describe("Initialization and Settings", function () {
    it("Should initialize with correct parameters", async function () {
      expect(await emissionController.celToken()).to.equal(celToken.address);
      expect(await emissionController.innovationUnits()).to.equal(innovationUnits.address);
      expect(await emissionController.staking()).to.equal(staking.address);
      expect(await emissionController.projectFactory()).to.equal(projectFactory.address);
      expect(await emissionController.periodEmissionCap()).to.equal(EMISSION_CAP);
      expect(await emissionController.emissionDecayRate()).to.equal(DECAY_RATE);
    });

    it("Should allow updating emission parameters", async function () {
      const newEmissionCap = ethers.utils.parseEther("30000");
      const newDecayRate = ethers.utils.parseEther("0.1");

      await emissionController.updateEmissionParameters(newEmissionCap, newDecayRate);

      expect(await emissionController.periodEmissionCap()).to.equal(newEmissionCap);
      expect(await emissionController.emissionDecayRate()).to.equal(newDecayRate);
    });

    it("Should allow updating alpha and beta parameters", async function () {
      const newAlpha = ethers.utils.parseEther("0.7");
      const newBeta = ethers.utils.parseEther("1.3");

      await emissionController.updateWeightParameters(newAlpha, newBeta);

      expect(await emissionController.alpha()).to.equal(newAlpha);
      expect(await emissionController.beta()).to.equal(newBeta);
    });
  });

  describe("PoI and Weight Management", function () {
    it("Should update PoI score for a project", async function () {
      const poiScore = ethers.utils.parseEther("85.5");
      await emissionController.updatePoI(PROJECT_ID, poiScore);

      const projectData = await emissionController.projects(PROJECT_ID);
      expect(projectData.poiScore).to.equal(poiScore);
    });

    it("Should update staking weight for a project", async function () {
      const stakingWeight = ethers.utils.parseEther("10000");
      await emissionController.updateStakingWeight(PROJECT_ID, stakingWeight);

      const projectData = await emissionController.projects(PROJECT_ID);
      expect(projectData.stakingWeight).to.equal(stakingWeight);
    });

    it("Should update IU weight for a project", async function () {
      const iuWeight = ethers.utils.parseEther("50000");
      await emissionController.updateIUWeight(PROJECT_ID, iuWeight);

      const projectData = await emissionController.projects(PROJECT_ID);
      expect(projectData.iuWeight).to.equal(iuWeight);
    });

    it("Should update user staking share", async function () {
      const stakingShare = ethers.utils.parseEther("0.25"); // 25%
      await emissionController.updateUserStakingShare(PROJECT_ID, staker.address, stakingShare);

      const userData = await emissionController.userProjects(PROJECT_ID, staker.address);
      expect(userData.stakingShare).to.equal(stakingShare);
    });

    it("Should update user IU share", async function () {
      const iuShare = ethers.utils.parseEther("0.15"); // 15%
      await emissionController.updateUserIUShare(PROJECT_ID, investor.address, iuShare);

      const userData = await emissionController.userProjects(PROJECT_ID, investor.address);
      expect(userData.iuShare).to.equal(iuShare);
    });

    it("Should fail to update PoI for non-existent project", async function () {
      await expect(
        emissionController.updatePoI(999, ethers.utils.parseEther("100"))
      ).to.be.revertedWith("EmissionController: project does not exist");
    });
  });

  describe("Emission Management", function () {
    it("Should distribute emissions based on weights", async function () {
      // Setup project weights
      await emissionController.updatePoI(PROJECT_ID, ethers.utils.parseEther("100"));
      await emissionController.updateStakingWeight(PROJECT_ID, ethers.utils.parseEther("10000"));
      await emissionController.updateIUWeight(PROJECT_ID, ethers.utils.parseEther("25000"));

      // Distribute emissions
      await emissionController.distributeEmissions();

      // Check emissions are allocated
      const projectEmission = await emissionController.projectEmissionsPerPeriod(PROJECT_ID);
      expect(projectEmission).to.equal(EMISSION_CAP); // All emissions go to one project
    });

    it("Should emit tokens to a user", async function () {
      const emitAmount = ethers.utils.parseEther("1000");
      await emissionController.emitTokens(investor.address, emitAmount);

      // Check investor received tokens
      const investorBalance = await celToken.balanceOf(investor.address);
      expect(investorBalance).to.equal(ethers.utils.parseEther("51000")); // 50,000 + 1,000

      // Check emission tracking
      expect(await emissionController.currentPeriodEmitted()).to.equal(emitAmount);
      expect(await emissionController.totalEmitted()).to.equal(emitAmount);
    });

    it("Should limit emissions to the period cap", async function () {
      const emitAmount = EMISSION_CAP.add(1); // Exceeds cap by 1 wei

      await expect(
        emissionController.emitTokens(investor.address, emitAmount)
      ).to.be.revertedWith("EmissionController: exceeds available emission");
    });

    it("Should update emission period after time passes", async function () {
      // Advance time by one emission period
      await time.increase(EMISSION_PERIOD_SECONDS);

      // Update the emission period
      await emissionController.updateEmissionPeriod();

      // Check period was updated
      expect(await emissionController.currentPeriod()).to.equal(1);

      // Check decay was applied
      const expectedNewCap = EMISSION_CAP.mul(ethers.BigNumber.from("95000000000000000")).div(ethers.BigNumber.from("100000000000000000"));
      expect(await emissionController.periodEmissionCap()).to.be.closeTo(expectedNewCap, 1000);
    });
  });

  describe("Reward Claiming", function () {
    beforeEach(async function () {
      // Setup for claiming - assign shares and distribute emissions
      await emissionController.updatePoI(PROJECT_ID, ethers.utils.parseEther("100"));
      await emissionController.updateStakingWeight(PROJECT_ID, ethers.utils.parseEther("10000"));
      await emissionController.updateIUWeight(PROJECT_ID, ethers.utils.parseEther("25000"));
      
      // Set investor and staker shares
      await emissionController.updateUserStakingShare(PROJECT_ID, staker.address, ethers.utils.parseEther("0.25")); // 25%
      await emissionController.updateUserIUShare(PROJECT_ID, investor.address, ethers.utils.parseEther("0.4")); // 40%
      
      // Distribute emissions
      await emissionController.distributeEmissions();
    });

    it("Should allow user to claim rewards", async function () {
      // Expected rewards: 25% of 50% of emissions for staking + 0% of 50% for IUs
      const stakerReward = EMISSION_CAP.mul(25).div(100).div(2);
      
      // Staker claims rewards
      await emissionController.connect(staker).claimRewards(PROJECT_ID);
      
      // Check staker received tokens
      const stakerBalance = await celToken.balanceOf(staker.address);
      expect(stakerBalance).to.be.closeTo(
        ethers.utils.parseEther("50000").add(stakerReward),
        1000 // Allow small rounding error
      );
    });

    it("Should allow investor to claim rewards", async function () {
      // Expected rewards: 0% of 50% of emissions for staking + 40% of 50% for IUs
      const investorReward = EMISSION_CAP.mul(40).div(100).div(2);
      
      // Investor claims rewards
      await emissionController.connect(investor).claimRewards(PROJECT_ID);
      
      // Check investor received tokens
      const investorBalance = await celToken.balanceOf(investor.address);
      expect(investorBalance).to.be.closeTo(
        ethers.utils.parseEther("50000").add(investorReward),
        1000 // Allow small rounding error
      );
    });

    it("Should revert if user has no rewards to claim", async function () {
      await expect(
        emissionController.connect(contributor).claimRewards(PROJECT_ID)
      ).to.be.revertedWith("EmissionController: no rewards to claim");
    });

    it("Should fail to claim rewards for non-existent project", async function () {
      await expect(
        emissionController.connect(staker).claimRewards(999)
      ).to.be.revertedWith("EmissionController: project does not exist");
    });
  });

  describe("Integration with InnovationUnits and Staking", function () {
    it("Should work with InnovationUnits for emission calculations", async function () {
      // Investor buys IUs
      const purchaseAmount = 10000; // 10,000 IUs
      const celRequired = purchaseAmount * PRICE_PER_UNIT; 
      
      await celToken.connect(investor).approve(innovationUnits.address, celRequired);
      await innovationUnits.connect(investor).purchaseIUs(PROJECT_ID, purchaseAmount);
      
      // Update IU weight in emission controller
      const totalIUs = await innovationUnits.getTotalMinted(PROJECT_ID);
      await emissionController.updateIUWeight(PROJECT_ID, totalIUs);
      
      // Update investor's IU share
      const investorIUs = await innovationUnits.balanceOf(investor.address, PROJECT_ID);
      const investorShare = ethers.utils.parseEther(investorIUs.toString()).div(ethers.utils.parseEther(totalIUs.toString()));
      await emissionController.updateUserIUShare(PROJECT_ID, investor.address, investorShare);
      
      // Distribute and verify emissions
      await emissionController.distributeEmissions();
      
      // Project should receive emissions
      const projectEmission = await emissionController.projectEmissionsPerPeriod(PROJECT_ID);
      expect(projectEmission).to.be.gt(0);
    });

    it("Should work with Staking for emission calculations", async function () {
      // Staker stakes CEL tokens
      await celToken.connect(staker).approve(staking.address, STAKE_AMOUNT);
      await staking.connect(staker).stake(PROJECT_ID, STAKE_AMOUNT);
      
      // Update staking weight in emission controller
      const totalStaked = await staking.getTotalStaked(PROJECT_ID);
      await emissionController.updateStakingWeight(PROJECT_ID, totalStaked);
      
      // Update staker's staking share
      const stakerStake = await staking.getStaked(staker.address, PROJECT_ID);
      const stakerShare = ethers.utils.parseEther(stakerStake.toString()).div(STAKE_AMOUNT);
      await emissionController.updateUserStakingShare(PROJECT_ID, staker.address, stakerShare);
      
      // Distribute and verify emissions
      await emissionController.distributeEmissions();
      
      // Project should receive emissions
      const projectEmission = await emissionController.projectEmissionsPerPeriod(PROJECT_ID);
      expect(projectEmission).to.be.gt(0);
    });
  });
}); 