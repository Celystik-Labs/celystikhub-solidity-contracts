const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ProjectFactory", function () {
  let CELToken;
  let celToken;
  let InnovationUnits;
  let innovationUnits;
  let Staking;
  let staking;
  let EmissionController;
  let emissionController;
  let ProjectFactory;
  let projectFactory;
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
  const DECAY_RATE = ethers.utils.parseEther("0.05"); // 5%
  const STAKE_AMOUNT = ethers.utils.parseEther("1000");
  const STAKE_LIMIT = ethers.utils.parseEther("10000");
  const MIN_STAKING_PERIOD = 60 * 60 * 24 * 7; // 1 week in seconds
  const CREATOR_SHARE = 2000; // 20% in basis points
  const CONTRIBUTOR_SHARE = 3000; // 30% in basis points
  const INVESTOR_SHARE = 5000; // 50% in basis points
  const TOTAL_SUPPLY = 1000000; // 1 million IUs
  const PRICE_PER_UNIT = 1; // 1 CEL per IU

  beforeEach(async function () {
    // Get the ContractFactory and Signers here
    CELToken = await ethers.getContractFactory("CELToken");
    InnovationUnits = await ethers.getContractFactory("InnovationUnits");
    Staking = await ethers.getContractFactory("Staking");
    EmissionController = await ethers.getContractFactory("EmissionController");
    ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    
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

    // Deploy ProjectFactory
    projectFactory = await ProjectFactory.deploy(
      innovationUnits.address,
      staking.address
    );
    await projectFactory.deployed();

    // Setup permissions
    await celToken.setMinter(emissionController.address, true);
    await innovationUnits.transferOwnership(emissionController.address);
    await staking.transferOwnership(emissionController.address);
    await emissionController.transferOwnership(projectFactory.address); // Factory controls EmissionController

    // Set contract addresses in EmissionController
    await emissionController.setInnovationUnitsAddress(innovationUnits.address);
    await emissionController.setStakingAddress(staking.address);
    await emissionController.setProjectFactoryAddress(projectFactory.address);

    // Distribute some tokens for testing
    await celToken.transfer(investor.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(staker1.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(staker2.address, ethers.utils.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the right contract addresses", async function () {
      expect(await projectFactory.innovationUnits()).to.equal(innovationUnits.address);
      expect(await projectFactory.staking()).to.equal(staking.address);
    });

    it("Should verify permissions", async function () {
      // EmissionController should be owned by ProjectFactory
      expect(await emissionController.owner()).to.equal(projectFactory.address);
      
      // InnovationUnits should be owned by EmissionController
      expect(await innovationUnits.owner()).to.equal(emissionController.address);
      
      // Staking should be owned by EmissionController
      expect(await staking.owner()).to.equal(emissionController.address);
      
      // CEL Token should have EmissionController as minter
      expect(await celToken.isMinter(emissionController.address)).to.equal(true);
    });
  });

  describe("Project Creation", function () {
    it("Should create a project successfully", async function () {
      // Create a project using the factory
      await projectFactory.createProject(
        PROJECT_ID,
        CREATOR_SHARE,
        CONTRIBUTOR_SHARE,
        INVESTOR_SHARE,
        TOTAL_SUPPLY,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );

      // Verify project is registered in factory
      expect(await projectFactory.projectExists(PROJECT_ID)).to.equal(true);
      expect(await projectFactory.getProjectCount()).to.equal(1);
      
      // Verify project in InnovationUnits
      const projectConfig = await innovationUnits.projectConfigs(PROJECT_ID);
      expect(projectConfig.isActive).to.equal(true);
      
      // Verify in Staking
      const stakingPool = await staking.projectPools(PROJECT_ID);
      expect(stakingPool.enabled).to.equal(true);
      expect(stakingPool.stakeLimit).to.equal(STAKE_LIMIT);
    });

    it("Should not allow creating a project with invalid parameters", async function () {
      // Invalid project ID
      await expect(
        projectFactory.createProject(
          0, // Invalid project ID
          CREATOR_SHARE,
          CONTRIBUTOR_SHARE,
          INVESTOR_SHARE,
          TOTAL_SUPPLY,
          PRICE_PER_UNIT,
          STAKE_LIMIT
        )
      ).to.be.revertedWith("ProjectFactory: project ID must be greater than zero");

      // Invalid shares (don't add up to 100%)
      await expect(
        projectFactory.createProject(
          PROJECT_ID,
          3000, // 30%
          3000, // 30%
          3000, // 30% (total 90%, should be 100%)
          TOTAL_SUPPLY,
          PRICE_PER_UNIT,
          STAKE_LIMIT
        )
      ).to.be.revertedWith("ProjectFactory: shares must add up to 10000 basis points (100%)");

      // Invalid total supply
      await expect(
        projectFactory.createProject(
          PROJECT_ID,
          CREATOR_SHARE,
          CONTRIBUTOR_SHARE,
          INVESTOR_SHARE,
          0, // Invalid total supply
          PRICE_PER_UNIT,
          STAKE_LIMIT
        )
      ).to.be.revertedWith("ProjectFactory: total supply must be greater than zero");

      // Invalid price per unit
      await expect(
        projectFactory.createProject(
          PROJECT_ID,
          CREATOR_SHARE,
          CONTRIBUTOR_SHARE,
          INVESTOR_SHARE,
          TOTAL_SUPPLY,
          0, // Invalid price per unit
          STAKE_LIMIT
        )
      ).to.be.revertedWith("ProjectFactory: price per unit must be greater than zero");
    });

    it("Should not allow creating duplicate projects", async function () {
      // Create first project
      await projectFactory.createProject(
        PROJECT_ID,
        CREATOR_SHARE,
        CONTRIBUTOR_SHARE,
        INVESTOR_SHARE,
        TOTAL_SUPPLY,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );

      // Try to create duplicate project
      await expect(
        projectFactory.createProject(
          PROJECT_ID, // Same project ID
          CREATOR_SHARE,
          CONTRIBUTOR_SHARE,
          INVESTOR_SHARE,
          TOTAL_SUPPLY,
          PRICE_PER_UNIT,
          STAKE_LIMIT
        )
      ).to.be.revertedWith("ProjectFactory: project already exists");
    });
  });

  describe("Role Assignments", function () {
    beforeEach(async function () {
      // Create a project first
      await projectFactory.createProject(
        PROJECT_ID,
        CREATOR_SHARE,
        CONTRIBUTOR_SHARE,
        INVESTOR_SHARE,
        TOTAL_SUPPLY,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );
    });

    it("Should assign creator role", async function () {
      await projectFactory.assignCreator(PROJECT_ID, creator.address);

      // Check creator in InnovationUnits
      const creatorIUs = await innovationUnits.getInnovationUnits(creator.address, PROJECT_ID);
      expect(creatorIUs).to.be.gt(0);
    });

    it("Should assign contributor role", async function () {
      const amount = ethers.utils.parseEther("100");
      await projectFactory.assignContributor(PROJECT_ID, contributor.address, amount);

      // Check contributor in InnovationUnits
      const contributorIUs = await innovationUnits.getInnovationUnits(contributor.address, PROJECT_ID);
      expect(contributorIUs).to.equal(amount);
    });

    it("Should not allow assigning multiple creators", async function () {
      await projectFactory.assignCreator(PROJECT_ID, creator.address);
      
      await expect(
        projectFactory.assignCreator(PROJECT_ID, addrs[0].address)
      ).to.be.revertedWith("InnovationUnits: creator allocation already done");
    });

    it("Should not allow assigning roles to non-existent projects", async function () {
      const NON_EXISTENT_PROJECT_ID = 999;
      
      await expect(
        projectFactory.assignCreator(NON_EXISTENT_PROJECT_ID, creator.address)
      ).to.be.revertedWith("ProjectFactory: project does not exist");
      
      await expect(
        projectFactory.assignContributor(NON_EXISTENT_PROJECT_ID, contributor.address, ethers.utils.parseEther("100"))
      ).to.be.revertedWith("ProjectFactory: project does not exist");
    });
  });

  describe("Project Updates", function () {
    beforeEach(async function () {
      // Create a project first
      await projectFactory.createProject(
        PROJECT_ID,
        CREATOR_SHARE,
        CONTRIBUTOR_SHARE,
        INVESTOR_SHARE,
        TOTAL_SUPPLY,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );
    });

    it("Should update project stake limit", async function () {
      const newStakeLimit = ethers.utils.parseEther("20000");
      
      await projectFactory.updateProject(PROJECT_ID, newStakeLimit, true);
      
      // Check updated stake limit in Staking
      const stakingPool = await staking.projectPools(PROJECT_ID);
      expect(stakingPool.stakeLimit).to.equal(newStakeLimit);
    });

    it("Should deactivate a project", async function () {
      await projectFactory.updateProject(PROJECT_ID, STAKE_LIMIT, false);
      
      // Check project is inactive in Staking
      const stakingPool = await staking.projectPools(PROJECT_ID);
      expect(stakingPool.enabled).to.equal(false);
    });

    it("Should not allow updating non-existent projects", async function () {
      const NON_EXISTENT_PROJECT_ID = 999;
      
      await expect(
        projectFactory.updateProject(NON_EXISTENT_PROJECT_ID, STAKE_LIMIT, true)
      ).to.be.revertedWith("ProjectFactory: project does not exist");
    });
  });

  describe("Project Queries", function () {
    beforeEach(async function () {
      // Create multiple projects
      await projectFactory.createProject(
        1,
        CREATOR_SHARE,
        CONTRIBUTOR_SHARE,
        INVESTOR_SHARE,
        TOTAL_SUPPLY,
        PRICE_PER_UNIT,
        STAKE_LIMIT
      );
      
      await projectFactory.createProject(
        2,
        CREATOR_SHARE,
        CONTRIBUTOR_SHARE,
        INVESTOR_SHARE,
        TOTAL_SUPPLY * 2,
        PRICE_PER_UNIT * 2,
        STAKE_LIMIT * 2
      );
      
      await projectFactory.createProject(
        3,
        CREATOR_SHARE,
        CONTRIBUTOR_SHARE,
        INVESTOR_SHARE,
        TOTAL_SUPPLY * 3,
        PRICE_PER_UNIT * 3,
        STAKE_LIMIT * 3
      );
    });

    it("Should return correct project count", async function () {
      expect(await projectFactory.getProjectCount()).to.equal(3);
    });

    it("Should check project existence correctly", async function () {
      expect(await projectFactory.projectExists(1)).to.equal(true);
      expect(await projectFactory.projectExists(2)).to.equal(true);
      expect(await projectFactory.projectExists(3)).to.equal(true);
      expect(await projectFactory.projectExists(4)).to.equal(false);
    });

    it("Should retrieve projects in range", async function () {
      const projects = await projectFactory.getProjects(0, 3);
      
      expect(projects.length).to.equal(3);
      expect(projects[0].id).to.equal(1);
      expect(projects[1].id).to.equal(2);
      expect(projects[2].id).to.equal(3);
      
      // Check specific project details
      expect(projects[0].totalSupply).to.equal(TOTAL_SUPPLY);
      expect(projects[1].totalSupply).to.equal(TOTAL_SUPPLY * 2);
      expect(projects[2].totalSupply).to.equal(TOTAL_SUPPLY * 3);
    });

    it("Should validate query range", async function () {
      await expect(
        projectFactory.getProjects(2, 1) // Invalid range (start > end)
      ).to.be.revertedWith("ProjectFactory: invalid range");
      
      await expect(
        projectFactory.getProjects(0, 4) // Out of bounds (only 3 projects)
      ).to.be.revertedWith("ProjectFactory: end index out of bounds");
    });
  });
}); 