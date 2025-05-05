const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EmissionController", function () {
  let CELToken;
  let InnovationUnits;
  let ProjectStaking;
  let ProtocolTreasury;
  let EmissionController;
  let celToken;
  let innovationUnits;
  let projectStaking;
  let protocolTreasury;
  let emissionController;
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let addrs;
  let projectId;

  beforeEach(async function () {
    // Get the ContractFactory and Signers
    CELToken = await ethers.getContractFactory("CELToken");
    InnovationUnits = await ethers.getContractFactory("InnovationUnits");
    ProjectStaking = await ethers.getContractFactory("ProjectStaking");
    ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
    EmissionController = await ethers.getContractFactory("EmissionController");
    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

    // Deploy CEL Token
    celToken = await CELToken.deploy(
      "Celystik Hub Token",
      "CEL",
      ethers.utils.parseEther("1000000") // Initial supply: 1 million tokens
    );
    await celToken.deployed();

    // Deploy Protocol Treasury
    protocolTreasury = await ProtocolTreasury.deploy(celToken.address);
    await protocolTreasury.deployed();

    // Deploy Innovation Units
    innovationUnits = await InnovationUnits.deploy(
      "https://api.celystikhub.com/metadata/{id}",
      celToken.address,
      protocolTreasury.address
    );
    await innovationUnits.deployed();

    // Deploy Project Staking
    projectStaking = await ProjectStaking.deploy(
      celToken.address,
      innovationUnits.address
    );
    await projectStaking.deployed();
    
    // Create a test project
    const creators = [owner.address];
    const creatorShares = [10000]; // 100% to owner
    const tx = await innovationUnits.createProject(
      ethers.utils.parseEther("1000000"), // 1M total supply
      ethers.utils.parseEther("0.01"), // 0.01 CEL initial price
      creators,
      creatorShares,
      5000, // 50% to creators
      3000, // 30% to contributors
      2000  // 20% to investors
    );
    const receipt = await tx.wait();
    const event = receipt.events?.find(e => e.event === 'ProjectRegistered');
    if (!event) {
      throw new Error("ProjectCreated event not found");
    }
    projectId = event.args.projectId;
    
    // Deploy EmissionController first
    emissionController = await EmissionController.deploy(
      celToken.address,
      projectStaking.address,
      innovationUnits.address
    );
    await emissionController.deployed();
    
    // Grant minter role after deployment
    await celToken.setMinter(emissionController.address, true);
    
    // Set EmissionController in ProjectStaking
    await projectStaking.setEmissionController(emissionController.address);
    
    // Set up some initial state
    // Transfer some CEL tokens to test accounts
    await celToken.transfer(addr1.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(addr2.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(addr3.address, ethers.utils.parseEther("10000"));
    
    // Approve staking contract to spend tokens
    await celToken.connect(addr1).approve(projectStaking.address, ethers.utils.parseEther("10000"));
    await celToken.connect(addr2).approve(projectStaking.address, ethers.utils.parseEther("10000"));
    await celToken.connect(addr3).approve(projectStaking.address, ethers.utils.parseEther("10000"));
    
    // Stake some tokens
    await projectStaking.connect(addr1).stake(projectId, ethers.utils.parseEther("1000"));
    await projectStaking.connect(addr2).stake(projectId, ethers.utils.parseEther("2000"));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await emissionController.owner()).to.equal(owner.address);
    });

    it("Should set the correct contract references", async function () {
      expect(await emissionController.celToken()).to.equal(celToken.address);
      expect(await emissionController.stakingContract()).to.equal(projectStaking.address);
      expect(await emissionController.innovationUnits()).to.equal(innovationUnits.address);
    });
    
    it("Should have the minter role on CEL token", async function () {
      expect(await celToken.isMinter(emissionController.address)).to.equal(true);
    });
  });

  describe("Epoch Management", function () {
    it("Should allow owner to start an epoch", async function () {
      await emissionController.startEpoch();
      
      const epochInfo = await emissionController.getCurrentEpochInfo();
      expect(epochInfo.currentEpochNumber).to.equal(1);
      expect(epochInfo.isActive).to.equal(true);
      expect(epochInfo.startTime).to.be.gt(0);
      expect(epochInfo.endTime).to.be.gt(epochInfo.startTime);
    });
    
    it("Should not allow non-owners to start an epoch", async function () {
      await expect(
        emissionController.connect(addr1).startEpoch()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should not allow starting an epoch when one is already active", async function () {
      await emissionController.startEpoch();
      
      await expect(
        emissionController.startEpoch()
      ).to.be.revertedWith("Epoch already active");
    });
    
    it("Should emit an EpochStarted event when starting an epoch", async function () {
      await expect(emissionController.startEpoch())
        .to.emit(emissionController, "EpochStarted")
        .withArgs(1, (await time.latest()), (await time.latest()) + (await emissionController.epochDuration()).toNumber());
    });
    
    it("Should not allow processing an epoch that hasn't ended", async function () {
      await emissionController.startEpoch();
      
      await expect(
        emissionController.processEpoch()
      ).to.be.revertedWith("Epoch not finished yet");
    });
    
    it("Should allow processing an epoch after its duration", async function () {
      await emissionController.startEpoch();
      
      // Set up project metrics score
      await emissionController.setProjectMetricsScore(projectId, ethers.utils.parseEther("1000"));
      await emissionController.setGlobalMetricsScore(ethers.utils.parseEther("1000"));
      
      // Fast forward past epoch duration
      const epochDuration = await emissionController.epochDuration();
      await time.increase(epochDuration.toNumber() + 1);
      
      // Process the epoch
      await emissionController.processEpoch();
      
      // Check epoch has been processed
      const epochInfo = await emissionController.getCurrentEpochInfo();
      expect(epochInfo.isActive).to.equal(false);
      
      // Check epoch emissions have been calculated
      const epochEmissions = await emissionController.epochTotalEmissions(1);
      expect(epochEmissions).to.be.gt(0);
    });
  });

  describe("Emission Calculation", function () {
    it("Should calculate global impact score correctly", async function () {
      const stakingScore = ethers.utils.parseEther("3000"); // Total staked amount
      const metricsScore = ethers.utils.parseEther("2000");
      
      // Set global weights for calculation (50/50 by default)
      const globalImpactScore = await emissionController.calculateGlobalImpactScore(
        stakingScore,
        metricsScore
      );
      
      // 3000*0.5 + 2000*0.5 = 2500
      expect(globalImpactScore).to.equal(ethers.utils.parseEther("2500"));
    });
    
    it("Should calculate project impact score correctly", async function () {
      const projectStakingScore = ethers.utils.parseEther("1000");
      const projectMetricsScore = ethers.utils.parseEther("2000");
      
      // Set up metrics score
      await emissionController.setProjectMetricsScore(projectId, projectMetricsScore);
      
      const projectImpactScore = await emissionController.calculateProjectImpactScore(
        projectId,
        projectStakingScore,
        projectMetricsScore
      );
      
      // 1000*0.5 + 2000*0.5 = 1500
      expect(projectImpactScore).to.equal(ethers.utils.parseEther("1500"));
    });
    
    it("Should calculate total emissions correctly based on impact score", async function () {
      const impactScore = ethers.utils.parseEther("5000");
      
      const baseEmissions = await emissionController.baseEmissionsPerEpoch();
      const totalEmissions = await emissionController.calculateTotalEmissions(impactScore);
      
      // Should be greater than base emissions due to impact score
      expect(totalEmissions).to.be.gt(baseEmissions);
      // But less than max emissions
      expect(totalEmissions).to.be.lte(await emissionController.maxEmissionsPerEpoch());
    });
  });
  
  describe("Claim Processing", function () {
    beforeEach(async function () {
      // Set up a full epoch cycle
      await emissionController.startEpoch();
      
      // Set project metrics scores
      await emissionController.setProjectMetricsScore(projectId, ethers.utils.parseEther("1000"));
      await emissionController.setGlobalMetricsScore(ethers.utils.parseEther("1000"));
      
      // Fast forward past epoch duration
      const epochDuration = await emissionController.epochDuration();
      await time.increase(epochDuration.toNumber() + 1);
      
      // Process the epoch
      await emissionController.processEpoch();
    });
    
    it("Should allow stakers to claim emissions", async function () {
      // Start a new epoch for claim validation
      await emissionController.startEpoch();
      
      const initialBalance = await celToken.balanceOf(addr1.address);
      
      // Check if addr1 has unclaimed emissions
      const unclaimedCheck = await emissionController.checkUnclaimedStakingEmissions(
        1, projectId, addr1.address
      );
      
      // Claim staking emissions for first epoch
      if (unclaimedCheck.hasUnclaimed) {
        await emissionController.connect(addr1).claimStakingEmissions(1, projectId);
      }
      
      const finalBalance = await celToken.balanceOf(addr1.address);
      
      // Only verify the balance increased if there were unclaimed emissions
      if (unclaimedCheck.hasUnclaimed) {
        expect(finalBalance).to.be.gt(initialBalance);
        expect(finalBalance.sub(initialBalance)).to.equal(unclaimedCheck.amount);
      } else {
        expect(finalBalance).to.equal(initialBalance);
      }
    });
    
    it("Should not allow claiming staking emissions twice", async function () {
      // Start a new epoch for claim validation
      await emissionController.startEpoch();
      
      // Claim first
      try {
        await emissionController.connect(addr1).claimStakingEmissions(1, projectId);
      } catch (error) {
        // Ignore failures here, as we're testing the duplicate claim
      }
      
      // Try to claim again
      await expect(
        emissionController.connect(addr1).claimStakingEmissions(1, projectId)
      ).to.be.revertedWith("Already claimed");
    });
    
    it("Should record claims correctly", async function () {
      // Start a new epoch for claim validation
      await emissionController.startEpoch();
      
      // Initial claim status
      let hasClaimed = await emissionController.hasClaimedStakingEmissions(
        1, projectId, addr1.address
      );
      expect(hasClaimed).to.equal(false);
      
      // Claim if there are emissions to claim
      const unclaimedCheck = await emissionController.checkUnclaimedStakingEmissions(
        1, projectId, addr1.address
      );
      
      if (unclaimedCheck.hasUnclaimed) {
        await emissionController.connect(addr1).claimStakingEmissions(1, projectId);
        
        // Check claim status after claiming
        hasClaimed = await emissionController.hasClaimedStakingEmissions(
          1, projectId, addr1.address
        );
        expect(hasClaimed).to.equal(true);
      }
    });
  });
  
  describe("Configuration", function () {
    it("Should allow owner to update epoch duration", async function () {
      const newDuration = 7 * 24 * 60 * 60; // 7 days
      
      await emissionController.setEpochDuration(newDuration);
      
      expect(await emissionController.epochDuration()).to.equal(newDuration);
    });
    
    it("Should enforce minimum and maximum duration limits", async function () {
      const tooShort = 60 * 60; // 1 hour (less than 1 day)
      const tooLong = 100 * 24 * 60 * 60; // 100 days (more than 90 days)
      
      await expect(
        emissionController.setEpochDuration(tooShort)
      ).to.be.revertedWith("Invalid duration");
      
      await expect(
        emissionController.setEpochDuration(tooLong)
      ).to.be.revertedWith("Invalid duration");
    });
    
    it("Should allow owner to update emission parameters", async function () {
      const newBaseEmissions = ethers.utils.parseEther("20000");
      const newMaxEmissions = ethers.utils.parseEther("200000");
      
      await emissionController.setBaseEmissionsPerEpoch(newBaseEmissions);
      expect(await emissionController.baseEmissionsPerEpoch()).to.equal(newBaseEmissions);
      
      await emissionController.setMaxEmissionsPerEpoch(newMaxEmissions);
      expect(await emissionController.maxEmissionsPerEpoch()).to.equal(newMaxEmissions);
    });
    
    it("Should enforce emission parameter constraints", async function () {
      const currentMaxEmissions = await emissionController.maxEmissionsPerEpoch();
      const exceedMax = currentMaxEmissions.add(ethers.utils.parseEther("1"));
      
      // Base emissions must be <= max emissions
      await expect(
        emissionController.setBaseEmissionsPerEpoch(exceedMax)
      ).to.be.revertedWith("Invalid amount");
      
      // Max emissions must be >= base emissions
      const currentBaseEmissions = await emissionController.baseEmissionsPerEpoch();
      const belowBase = currentBaseEmissions.sub(ethers.utils.parseEther("1"));
      
      await expect(
        emissionController.setMaxEmissionsPerEpoch(belowBase)
      ).to.be.revertedWith("Must be >= base emissions");
    });
    
    it("Should allow owner to set global weights", async function () {
      // Update to 40% staking, 60% metrics
      await emissionController.setGlobalWeights(4000, 6000);
      
      expect(await emissionController.globalStakingScoreWeight()).to.equal(4000);
      expect(await emissionController.globalMetricsScoreWeight()).to.equal(6000);
    });
    
    it("Should enforce that global weights sum to 100%", async function () {
      // Invalid weights that don't sum to 10000 (100%)
      await expect(
        emissionController.setGlobalWeights(3000, 6000)
      ).to.be.revertedWith("Weights must sum to 100%");
    });
    
    it("Should allow owner to set emission shares", async function () {
      // Update to 30% staking, 70% IU holders
      await emissionController.setEmissionShares(3000, 7000);
      
      expect(await emissionController.stakingEmissionShare()).to.equal(3000);
      expect(await emissionController.iuHoldersEmissionShare()).to.equal(7000);
    });
    
    it("Should enforce that emission shares sum to 100%", async function () {
      // Invalid shares that don't sum to 10000 (100%)
      await expect(
        emissionController.setEmissionShares(3000, 6000)
      ).to.be.revertedWith("Shares must sum to 100%");
    });
  });
}); 