const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { string } = require("hardhat/internal/core/params/argumentTypes");

describe("ProjectStaking", function () {
  let CELToken;
  let InnovationUnits;
  let ProjectStaking;
  let ProtocolTreasury;
  let celToken;
  let innovationUnits;
  let projectStaking;
  let protocolTreasury;
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

    // Transfer some CEL tokens to test accounts
    await celToken.transfer(addr1.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(addr2.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(addr3.address, ethers.utils.parseEther("10000"));

    // Approve staking contract to spend tokens
    await celToken.connect(addr1).approve(projectStaking.address, ethers.utils.parseEther("10000"));
    await celToken.connect(addr2).approve(projectStaking.address, ethers.utils.parseEther("10000"));
    await celToken.connect(addr3).approve(projectStaking.address, ethers.utils.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await projectStaking.owner()).to.equal(owner.address);
    });

    it("Should set the correct CEL token address", async function () {
      expect(await projectStaking.celToken()).to.equal(celToken.address);
    });

    it("Should set the correct Innovation Units address", async function () {
      expect(await projectStaking.innovationUnits()).to.equal(innovationUnits.address);
    });
  });

  describe("Staking", function () {
    it("Should allow users to stake tokens", async function () {
      const stakeAmount = ethers.utils.parseEther("1000");
      const lockDurationDays = 20;
      await projectStaking.connect(addr1).stake(projectId, stakeAmount, lockDurationDays);

      const stakes = await projectStaking.getUserActiveStakes(projectId, addr1.address);
      expect(stakes.amounts[0]).to.equal(stakeAmount);

      const totalStaked = await projectStaking.totalStaked();
      expect(totalStaked).to.equal(stakeAmount);
    });

    it("Should not allow staking if project doesn't exist", async function () {
      const stakeAmount = ethers.utils.parseEther("1000");
      const lockDurationDays = 20;
      const nonExistentProjectId = 999;

      await expect(
        projectStaking.connect(addr1).stake(nonExistentProjectId, stakeAmount, lockDurationDays)
      ).to.be.revertedWith("Project does not exist");
    });

    it("Should not allow staking if user doesn't have enough tokens", async function () {
      const stakeAmount = ethers.utils.parseEther("20000"); // More than available
      const lockDurationDays = 20;

      await expect(
        projectStaking.connect(addr1).stake(projectId, stakeAmount, lockDurationDays)
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should update total stake amount correctly", async function () {
      // Multiple users stake
      const lockDurationDays = 20;
      await projectStaking.connect(addr1).stake(projectId, ethers.utils.parseEther("1000"), lockDurationDays);
      await projectStaking.connect(addr2).stake(projectId, ethers.utils.parseEther("2000"), lockDurationDays);
      await projectStaking.connect(addr3).stake(projectId, ethers.utils.parseEther("3000"), lockDurationDays);

      const totalStaked = await projectStaking.totalStaked();
      expect(totalStaked).to.equal(ethers.utils.parseEther("6000"));
    });

    it("Should emit Staked event when staking", async function () {
      const stakeAmount = ethers.utils.parseEther("1000");
      const lockDurationDays = 20;
      const lockDurationSeconds = lockDurationDays * 24 * 60 * 60;

      const tx = await projectStaking.connect(addr1).stake(projectId, stakeAmount, lockDurationDays);
      const receipt = await tx.wait();
      
      const event = receipt.events.find(e => e.event === "Staked");
      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(addr1.address);
      expect(event.args.projectId).to.equal(projectId);
      expect(event.args.amount).to.equal(stakeAmount);
      expect(event.args.lockDuration).to.equal(lockDurationSeconds);
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      // Stake some tokens first
      const lockDurationDays = 20;
      await projectStaking.connect(addr1).stake(projectId, ethers.utils.parseEther("1000"), lockDurationDays);
      await projectStaking.connect(addr2).stake(projectId, ethers.utils.parseEther("2000"), lockDurationDays);
    });

    it("Should allow users to unstake tokens after lock period", async function () {
      // Get current time and add lock period
      const lockPeriod = 20 * 24 * 60 * 60; // 20 days in seconds
      await time.increase(lockPeriod + 1);

      const initialBalance = await celToken.balanceOf(addr1.address);
      
      await projectStaking.connect(addr1).unstake(projectId, 0); // Unstake first stake

      const stakes = await projectStaking.getUserActiveStakes(projectId, addr1.address);
      expect(stakes.amounts.length).to.equal(0); // No active stakes after unstaking

      const finalBalance = await celToken.balanceOf(addr1.address);
      expect(finalBalance).to.equal(initialBalance.add(ethers.utils.parseEther("1000")));

      const totalStaked = await projectStaking.totalStaked();
      expect(totalStaked).to.equal(ethers.utils.parseEther("2000")); // Only addr2's stake remains
    });

    it("Should not allow unstaking before lock period ends", async function () {
      await expect(
        projectStaking.connect(addr1).unstake(projectId, 0)
      ).to.be.revertedWith("Tokens still locked");
    });

    it("Should not allow unstaking more than staked amount", async function () {
      // Fast forward past lock period
      const lockPeriod = 20 * 24 * 60 * 60; // 20 days in seconds
      await time.increase(lockPeriod + 1);

      await expect(
        projectStaking.connect(addr1).unstake(projectId, 1) // Invalid stake index
      ).to.be.revertedWith("Invalid stake index");
    });

    it("Should emit Unstaked event when unstaking", async function () {
      // Fast forward past lock period
      const lockPeriod = 20 * 24 * 60 * 60; // 20 days in seconds
      await time.increase(lockPeriod + 1);

      const tx = await projectStaking.connect(addr1).unstake(projectId, 0);
      const receipt = await tx.wait();
      
      const event = receipt.events.find(e => e.event === "Unstaked");
      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(addr1.address);
      expect(event.args.projectId).to.equal(projectId);
      expect(event.args.amount).to.equal(ethers.utils.parseEther("1000"));
    });
  });

  describe("Score Calculation", function () {
    beforeEach(async function () {
      // Stake some tokens 
      const lockDurationDays = 20;
      await projectStaking.connect(addr1).stake(projectId, ethers.utils.parseEther("1000"), lockDurationDays);
      await projectStaking.connect(addr2).stake(projectId, ethers.utils.parseEther("2000"), lockDurationDays);
      await projectStaking.connect(addr3).stake(projectId, ethers.utils.parseEther("3000"), lockDurationDays);
    });

    it("Should calculate correct project score", async function () {
      const projectScore = await projectStaking.getProjectScore(projectId);
      expect(projectScore).to.be.gt(0);
    });

    it("Should calculate correct user project score", async function () {
      const userScore = await projectStaking.getUserProjectScore(projectId, addr2.address);
      expect(userScore).to.be.gt(0);
    });

    it("Should calculate correct total score across all projects", async function () {
      // Create a second project and stake on it
      const creators = [owner.address];
      const creatorShares = [10000];
      const tx = await innovationUnits.createProject(
        ethers.utils.parseEther("2000000"), // 2M total supply
        ethers.utils.parseEther("0.02"), // 0.02 CEL initial price
        creators,
        creatorShares,
        5000,
        3000,
        2000
      );
      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === 'ProjectRegistered');
      if (!event) {
        throw new Error("ProjectCreated event not found");
      }
      const projectId2 = event.args.projectId;

      // Stake on second project
      const lockDurationDays = 20;
      await projectStaking.connect(addr1).stake(projectId2, ethers.utils.parseEther("4000"), lockDurationDays);
      
      const totalScore = await projectStaking.totalScore();
      expect(totalScore).to.be.gt(0);
    });
  });

  describe("Configuration", function () {
    it("Should allow owner to update stake lock period", async function () {
      const newLockPeriod = 60 * 60 * 24 * 14; // 14 days
      await projectStaking.setMinLockDuration(newLockPeriod);

      const lockPeriod = await projectStaking.minLockDuration();
      expect(lockPeriod).to.equal(newLockPeriod);
    });

    it("Should not allow non-owners to update stake lock period", async function () {
      const newLockPeriod = 60 * 60 * 24 * 14; // 14 days

      await expect(
        projectStaking.connect(addr1).setMinLockDuration(newLockPeriod)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should emit LockDurationUpdated event when updating lock period", async function () {
      const oldLockPeriod = await projectStaking.minLockDuration();
      const newLockPeriod = 60 * 60 * 24 * 14; // 14 days
      const which = "min";

      await expect(projectStaking.setMinLockDuration(newLockPeriod))
        .to.emit(projectStaking, "LockDurationUpdated")
        .withArgs(which, oldLockPeriod, newLockPeriod);
    });
  });

  describe("Emission Controller Integration", function () {
    it("Should allow owner to set the emission controller", async function () {
      // Deploy mock emission controller (using an EOA for simplicity)
      const mockEmissionController = addr3.address;

      await projectStaking.setEmissionController(mockEmissionController);

      expect(await projectStaking.emissionController()).to.equal(mockEmissionController);
    });

    it("Should not allow non-owners to set the emission controller", async function () {
      const mockEmissionController = addr3.address;

      await expect(
        projectStaking.connect(addr1).setEmissionController(mockEmissionController)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should emit EmissionControllerUpdated event when setting emission controller", async function () {
      const mockEmissionController = addr3.address;

      await expect(projectStaking.setEmissionController(mockEmissionController))
        .to.emit(projectStaking, "EmissionControllerUpdated")
        .withArgs(mockEmissionController);
    });
  });
}); 