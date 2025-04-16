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
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 1 million tokens
  const CAP = ethers.utils.parseEther("10000000"); // 10 million tokens
  const EMISSION_CAP = ethers.utils.parseEther("20000"); // 20,000 tokens
  const DECAY_RATE = 950; // 95.0% (in basis points)
  const STAKE_AMOUNT = ethers.utils.parseEther("1000");
  const STAKE_LIMIT = ethers.utils.parseEther("10000");
  const MIN_STAKING_PERIOD = 60 * 60 * 24 * 7; // 1 week in seconds
  const CREATOR_SHARE = 2000; // 20% in basis points
  const CONTRIBUTOR_SHARE = 3000; // 30% in basis points
  const INVESTOR_SHARE = 5000; // 50% in basis points

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
      EMISSION_CAP,
      DECAY_RATE
    );
    await emissionController.deployed();

    // Setup permissions
    await celToken.setMinter(emissionController.address, true);
    await innovationUnits.transferOwnership(emissionController.address);
    await staking.transferOwnership(emissionController.address);

    // Set contract addresses in EmissionController
    await emissionController.setInnovationUnitsAddress(innovationUnits.address);
    await emissionController.setStakingAddress(staking.address);

    // Create project in InnovationUnits
    await innovationUnits.createProject(
      PROJECT_ID,
      TOTAL_SUPPLY,
      CREATOR_SHARE,
      CONTRIBUTOR_SHARE,
      INVESTOR_SHARE,
      PRICE_PER_UNIT
    );

    // Distribute some tokens for testing
    await celToken.transfer(investor.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(staker1.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(staker2.address, ethers.utils.parseEther("10000"));
  });

  describe("Deployment and Setup", function () {
    it("Should deploy with correct parameters", async function () {
      expect(await emissionController.celToken()).to.equal(celToken.address);
      expect(await emissionController.emissionCap()).to.equal(EMISSION_CAP);
      expect(await emissionController.decayRate()).to.equal(DECAY_RATE);
    });

    it("Should set contract addresses correctly", async function () {
      expect(await emissionController.innovationUnits()).to.equal(innovationUnits.address);
      expect(await emissionController.staking()).to.equal(staking.address);
    });

    it("Should have correct permissions", async function () {
      expect(await celToken.isMinter(emissionController.address)).to.equal(true);
      expect(await innovationUnits.owner()).to.equal(emissionController.address);
      expect(await staking.owner()).to.equal(emissionController.address);
    });
  });

  describe("Project Creation and Management", function () {
    it("Should create a project with correct parameters", async function () {
      // Check project in InnovationUnits
      const project = await innovationUnits.getProject(PROJECT_ID);
      expect(project.active).to.equal(true);
      expect(project.creatorShare).to.equal(CREATOR_SHARE);
      expect(project.contributorShare).to.equal(CONTRIBUTOR_SHARE);
      expect(project.investorShare).to.equal(INVESTOR_SHARE);

      // Check staking pool
      const stakingPool = await staking.getProjectStakingPool(PROJECT_ID);
      expect(stakingPool.enabled).to.equal(true);
      expect(stakingPool.stakeLimit).to.equal(STAKE_LIMIT);
      expect(stakingPool.minStakingPeriod).to.equal(MIN_STAKING_PERIOD);
    });

    it("Should not allow creating a project with ID 0", async function () {
      await expect(
        emissionController.createProject(0, CREATOR_SHARE, CONTRIBUTOR_SHARE, INVESTOR_SHARE, STAKE_LIMIT)
      ).to.be.revertedWith("EmissionController: project ID must be greater than zero");
    });

    it("Should not allow creating a project with invalid shares total", async function () {
      // Total greater than 10000 (100%)
      await expect(
        emissionController.createProject(2, 3000, 3000, 5000, STAKE_LIMIT)
      ).to.be.revertedWith("EmissionController: shares must sum to 10000 basis points");

      // Total less than 10000 (100%)
      await expect(
        emissionController.createProject(2, 2000, 2000, 5000, STAKE_LIMIT)
      ).to.be.revertedWith("EmissionController: shares must sum to 10000 basis points");
    });

    it("Should update an existing project", async function () {
      const newCreatorShare = 1500; // 15%
      const newContributorShare = 2500; // 25%
      const newInvestorShare = 6000; // 60%
      const newStakeLimit = ethers.utils.parseEther("20000");

      await emissionController.updateProject(
        PROJECT_ID,
        newCreatorShare,
        newContributorShare,
        newInvestorShare,
        newStakeLimit,
        true
      );

      // Check project in InnovationUnits
      const project = await innovationUnits.getProject(PROJECT_ID);
      expect(project.active).to.equal(true);
      expect(project.creatorShare).to.equal(newCreatorShare);
      expect(project.contributorShare).to.equal(newContributorShare);
      expect(project.investorShare).to.equal(newInvestorShare);

      // Check staking pool
      const stakingPool = await staking.getProjectStakingPool(PROJECT_ID);
      expect(stakingPool.enabled).to.equal(true);
      expect(stakingPool.stakeLimit).to.equal(newStakeLimit);
    });

    it("Should deactivate a project", async function () {
      await emissionController.updateProject(
        PROJECT_ID,
        CREATOR_SHARE,
        CONTRIBUTOR_SHARE,
        INVESTOR_SHARE,
        STAKE_LIMIT,
        false
      );

      // Check project in InnovationUnits
      const project = await innovationUnits.getProject(PROJECT_ID);
      expect(project.active).to.equal(false);

      // Check staking pool
      const stakingPool = await staking.getProjectStakingPool(PROJECT_ID);
      expect(stakingPool.enabled).to.equal(false);
    });
  });

  describe("Role Assignments", function () {
    it("Should assign creator role", async function () {
      await emissionController.assignCreator(PROJECT_ID, creator.address);

      // Check creator in InnovationUnits
      const creatorIUs = await innovationUnits.getInnovationUnits(creator.address, PROJECT_ID);
      expect(creatorIUs).to.be.gt(0);

      // Check creator role
      const isCreator = await innovationUnits.isCreator(creator.address, PROJECT_ID);
      expect(isCreator).to.equal(true);
    });

    it("Should assign contributor role", async function () {
      await emissionController.assignContributor(PROJECT_ID, contributor.address, ethers.utils.parseEther("100"));

      // Check contributor in InnovationUnits
      const contributorIUs = await innovationUnits.getInnovationUnits(contributor.address, PROJECT_ID);
      expect(contributorIUs).to.be.gt(0);

      // Check contributor role
      const isContributor = await innovationUnits.isContributor(contributor.address, PROJECT_ID);
      expect(isContributor).to.equal(true);
    });

    it("Should not allow assigning multiple creators", async function () {
      await emissionController.assignCreator(PROJECT_ID, creator.address);
      
      await expect(
        emissionController.assignCreator(PROJECT_ID, addrs[0].address)
      ).to.be.revertedWith("InnovationUnits: creator already assigned");
    });
  });

  describe("Staking and Investing", function () {
    beforeEach(async function () {
      // Approve tokens for staking and investing
      await celToken.connect(staker1).approve(staking.address, STAKE_AMOUNT);
      await celToken.connect(staker2).approve(staking.address, STAKE_AMOUNT);
      await celToken.connect(investor).approve(innovationUnits.address, STAKE_AMOUNT);
    });

    it("Should allow staking tokens", async function () {
      await emissionController.connect(staker1).stakeTokens(PROJECT_ID, STAKE_AMOUNT);

      // Check staker1 stake
      const staker1Stake = await staking.getStaked(staker1.address, PROJECT_ID);
      expect(staker1Stake).to.equal(STAKE_AMOUNT);
    });

    it("Should allow purchasing Innovation Units", async function () {
      await emissionController.connect(investor).purchaseInnovationUnits(PROJECT_ID, STAKE_AMOUNT);

      // Check investor IUs
      const investorIUs = await innovationUnits.getInnovationUnits(investor.address, PROJECT_ID);
      expect(investorIUs).to.be.gt(0);

      // Check investor role
      const isInvestor = await innovationUnits.isInvestor(investor.address, PROJECT_ID);
      expect(isInvestor).to.equal(true);
    });
  });

  describe("Emissions", function () {
    beforeEach(async function () {
      // Assign roles
      await emissionController.assignCreator(PROJECT_ID, creator.address);
      await emissionController.assignContributor(PROJECT_ID, contributor.address, ethers.utils.parseEther("100"));

      // Stake and invest
      await celToken.connect(staker1).approve(staking.address, STAKE_AMOUNT);
      await celToken.connect(staker2).approve(staking.address, STAKE_AMOUNT);
      await celToken.connect(investor).approve(innovationUnits.address, STAKE_AMOUNT);

      await emissionController.connect(staker1).stakeTokens(PROJECT_ID, STAKE_AMOUNT.div(2));
      await emissionController.connect(staker2).stakeTokens(PROJECT_ID, STAKE_AMOUNT.div(2));
      await emissionController.connect(investor).purchaseInnovationUnits(PROJECT_ID, STAKE_AMOUNT);

      // Set last emission time
      const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await emissionController.setLastEmissionTime(blockTimestamp);
    });

    it("Should not emit rewards before emission period", async function () {
      // Try to emit rewards
      await expect(
        emissionController.emitRewards()
      ).to.be.revertedWith("EmissionController: emission period not reached");
    });

    it("Should emit rewards after emission period", async function () {
      // Advance time
      await ethers.provider.send("evm_increaseTime", [MIN_STAKING_PERIOD]);
      await ethers.provider.send("evm_mine");

      // Get initial balances
      const initialCreatorBalance = await celToken.balanceOf(creator.address);
      const initialContributorBalance = await celToken.balanceOf(contributor.address);
      const initialInvestorBalance = await celToken.balanceOf(investor.address);
      const initialStaker1Balance = await celToken.balanceOf(staker1.address);
      const initialStaker2Balance = await celToken.balanceOf(staker2.address);

      // Emit rewards
      await emissionController.emitRewards();

      // Check that tokens were distributed
      const creatorRewards = (await celToken.balanceOf(creator.address)).sub(initialCreatorBalance);
      const contributorRewards = (await celToken.balanceOf(contributor.address)).sub(initialContributorBalance);
      const investorRewards = (await celToken.balanceOf(investor.address)).sub(initialInvestorBalance);
      const staker1Rewards = (await celToken.balanceOf(staker1.address)).sub(initialStaker1Balance);
      const staker2Rewards = (await celToken.balanceOf(staker2.address)).sub(initialStaker2Balance);

      // Verify rewards were distributed
      expect(creatorRewards).to.be.gt(0);
      expect(contributorRewards).to.be.gt(0);
      expect(investorRewards).to.be.gt(0);
      expect(staker1Rewards).to.be.gt(0);
      expect(staker2Rewards).to.be.gt(0);

      // Verify proportional distribution
      expect(investorRewards).to.be.gt(creatorRewards); // Investor should get more (50% vs 20%)
      expect(staker1Rewards).to.be.approximately(staker2Rewards, ethers.utils.parseEther("0.1")); // Stakers should get about equal
    });

    it("Should update last emission time after emitting rewards", async function () {
      // Advance time
      await ethers.provider.send("evm_increaseTime", [MIN_STAKING_PERIOD]);
      await ethers.provider.send("evm_mine");

      // Emit rewards
      await emissionController.emitRewards();

      // Check last emission time
      const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const lastEmissionTime = await emissionController.lastEmissionTime();
      expect(lastEmissionTime).to.be.closeTo(blockTimestamp, 10); // Allow small deviation
    });

    it("Should apply decay rate to emission cap", async function () {
      // Advance time
      await ethers.provider.send("evm_increaseTime", [MIN_STAKING_PERIOD]);
      await ethers.provider.send("evm_mine");

      // Get initial emission cap
      const initialEmissionCap = await emissionController.emissionCap();

      // Emit rewards
      await emissionController.emitRewards();

      // Check new emission cap
      const newEmissionCap = await emissionController.emissionCap();
      const expectedEmissionCap = initialEmissionCap.mul(DECAY_RATE).div(10000);
      expect(newEmissionCap).to.equal(expectedEmissionCap);
    });

    it("Should allow multiple emission cycles", async function () {
      // First cycle
      await ethers.provider.send("evm_increaseTime", [MIN_STAKING_PERIOD]);
      await ethers.provider.send("evm_mine");
      await emissionController.emitRewards();

      // Second cycle
      await ethers.provider.send("evm_increaseTime", [MIN_STAKING_PERIOD]);
      await ethers.provider.send("evm_mine");

      // Get balances before second emission
      const initialCreatorBalance = await celToken.balanceOf(creator.address);
      const initialContributorBalance = await celToken.balanceOf(contributor.address);

      // Emit rewards again
      await emissionController.emitRewards();

      // Check that tokens were distributed again
      const creatorRewards = (await celToken.balanceOf(creator.address)).sub(initialCreatorBalance);
      const contributorRewards = (await celToken.balanceOf(contributor.address)).sub(initialContributorBalance);

      expect(creatorRewards).to.be.gt(0);
      expect(contributorRewards).to.be.gt(0);
    });
  });

  describe("Administrative Functions", function () {
    it("Should allow owner to update emission parameters", async function () {
      const newEmissionCap = ethers.utils.parseEther("30000");
      const newDecayRate = 980; // 98%

      await emissionController.setEmissionParameters(newEmissionCap, newDecayRate);

      expect(await emissionController.emissionCap()).to.equal(newEmissionCap);
      expect(await emissionController.decayRate()).to.equal(newDecayRate);
    });

    it("Should not allow non-owners to update emission parameters", async function () {
      await expect(
        emissionController.connect(creator).setEmissionParameters(
          ethers.utils.parseEther("30000"),
          980
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow owner to update contract addresses", async function () {
      // Deploy new contracts
      const newStaking = await Staking.deploy(celToken.address);
      await newStaking.deployed();
      
      const newInnovationUnits = await InnovationUnits.deploy(celToken.address);
      await newInnovationUnits.deployed();
      
      // Update addresses
      await emissionController.setInnovationUnitsAddress(newInnovationUnits.address);
      await emissionController.setStakingAddress(newStaking.address);
      
      // Check addresses updated
      expect(await emissionController.innovationUnits()).to.equal(newInnovationUnits.address);
      expect(await emissionController.staking()).to.equal(newStaking.address);
    });

    it("Should not allow setting invalid addresses", async function () {
      await expect(
        emissionController.setInnovationUnitsAddress(ethers.constants.AddressZero)
      ).to.be.revertedWith("EmissionController: invalid address");
      
      await expect(
        emissionController.setStakingAddress(ethers.constants.AddressZero)
      ).to.be.revertedWith("EmissionController: invalid address");
    });
  });
}); 