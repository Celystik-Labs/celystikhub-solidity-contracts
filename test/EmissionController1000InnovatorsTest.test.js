const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EmissionController with 1000 Innovators", function () {
  // Test configuration
  const INNOVATORS_COUNT = 1000;
  const STAKERS_COUNT = INNOVATORS_COUNT / 2;
  const IU_HOLDERS_COUNT = INNOVATORS_COUNT / 2;
  const INITIAL_CEL_SUPPLY = ethers.utils.parseEther("10000000"); // 10M CEL
  const STAKE_AMOUNT = ethers.utils.parseEther("1000"); // 1000 CEL
  const IU_AMOUNT = 100; // 100 IU tokens
  
  // Contract instances
  let celToken;
  let innovationUnits;
  let projectStaking;
  let emissionController;
  
  // Signers
  let owner;
  let treasury;
  let creator;
  let stakers = [];
  let iuHolders = [];
  
  // Test data
  let projectId;
  
  before(async function() {
    // Set a long timeout for this test
    this.timeout(3600000); // 1 hour
    
    console.log("Starting test with 1000 innovators on a single project...");
    
    // Get signers
    const signers = await ethers.getSigners();
    [owner, treasury, creator, ...remainingSigners] = signers;
    
    // Split remaining signers between stakers and IU holders
    // If we don't have enough signers, we'll need to create new wallets
    const availableSigners = remainingSigners.length;
    console.log(`Available signers: ${availableSigners}`);
    
    // Use available signers first
    for (let i = 0; i < Math.min(STAKERS_COUNT, availableSigners); i++) {
      stakers.push(remainingSigners[i]);
    }
    
    // Create additional staker wallets if needed
    if (STAKERS_COUNT > availableSigners) {
      console.log(`Creating ${STAKERS_COUNT - availableSigners} additional staker wallets...`);
      for (let i = availableSigners; i < STAKERS_COUNT; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        stakers.push(wallet);
      }
    }
    
    // Use remaining signers for IU holders or create new ones
    let remainingForIUHolders = Math.max(0, availableSigners - STAKERS_COUNT);
    
    for (let i = 0; i < Math.min(IU_HOLDERS_COUNT, remainingForIUHolders); i++) {
      iuHolders.push(remainingSigners[STAKERS_COUNT + i]);
    }
    
    // Create additional IU holder wallets if needed
    if (IU_HOLDERS_COUNT > remainingForIUHolders) {
      console.log(`Creating ${IU_HOLDERS_COUNT - remainingForIUHolders} additional IU holder wallets...`);
      for (let i = remainingForIUHolders; i < IU_HOLDERS_COUNT; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        iuHolders.push(wallet);
      }
    }
    
    console.log(`Created ${stakers.length} stakers and ${iuHolders.length} IU holders`);
    
    // Deploy contracts
    console.log("Deploying contracts...");
    
    // Deploy CEL Token
    const CELToken = await ethers.getContractFactory("CELToken");
    celToken = await CELToken.deploy("Celystik Hub Token", "CEL", INITIAL_CEL_SUPPLY);
    await celToken.deployed();
    console.log("CEL Token deployed to:", celToken.address);
    
    // Deploy Innovation Units
    const InnovationUnits = await ethers.getContractFactory("InnovationUnits");
    innovationUnits = await InnovationUnits.deploy(
      "https://api.example.com/metadata/{id}.json",
      celToken.address,
      treasury.address
    );
    await innovationUnits.deployed();
    console.log("Innovation Units deployed to:", innovationUnits.address);
    
    // Deploy Project Staking
    const ProjectStaking = await ethers.getContractFactory("ProjectStaking");
    projectStaking = await ProjectStaking.deploy(celToken.address, innovationUnits.address);
    await projectStaking.deployed();
    console.log("Project Staking deployed to:", projectStaking.address);
    
    // Deploy Emission Controller
    const EmissionController = await ethers.getContractFactory("EmissionController");
    emissionController = await EmissionController.deploy(
      celToken.address,
      projectStaking.address,
      innovationUnits.address
    );
    await emissionController.deployed();
    console.log("Emission Controller deployed to:", emissionController.address);
    
    // Set permissions
    await celToken.setMinter(emissionController.address, true);
    await projectStaking.setEmissionController(emissionController.address);
    
    // Create a project
    console.log("Creating test project...");
    await celToken.transfer(creator.address, ethers.utils.parseEther("10000"));
    
    const projectParams = {
      initialPrice: ethers.utils.parseEther("1"), // 1 CEL per IU
      creators: [creator.address],
      creatorShares: [10000], // 100% to creator
      creatorsAllocatedPercentage: 2000, // 20%
      contributorsReservePercentage: 3000, // 30%
      investorsReservePercentage: 5000, // 50%
      projectName: "1000 Innovators Test Project"
    };
    
    const tx = await innovationUnits.connect(owner).createProject(
      projectParams.initialPrice,
      projectParams.creators,
      projectParams.creatorShares,
      projectParams.creatorsAllocatedPercentage,
      projectParams.contributorsReservePercentage,
      projectParams.investorsReservePercentage,
      projectParams.projectName
    );
    
    const receipt = await tx.wait();
    const projectRegisteredEvent = receipt.events.find(e => e.event === 'ProjectRegistered');
    projectId = projectRegisteredEvent.args.projectId.toNumber();
    
    console.log(`Created project with ID: ${projectId}`);
  });
  
  it("Should set up 1000 innovators in batches", async function() {
    this.timeout(3600000); // 1 hour
    
    // Set up stakers and IU holders in batches to avoid gas issues
    const BATCH_SIZE = 20;
    
    // Set up stakers
    console.log("Setting up stakers...");
    for (let batchStart = 0; batchStart < STAKERS_COUNT; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, STAKERS_COUNT);
      console.log(`Setting up stakers ${batchStart} to ${batchEnd - 1}...`);
      
      for (let i = batchStart; i < batchEnd; i++) {
        const staker = stakers[i];
        
        // Fund the staker
        await celToken.connect(owner).transfer(staker.address, STAKE_AMOUNT);
        
        // Approve and stake
        await celToken.connect(staker).approve(projectStaking.address, STAKE_AMOUNT);
        
        // Vary the lock duration to test different scores
        // Between 7 days and 2 years (730 days)
        const lockDurationDays = 7 + Math.floor((i / STAKERS_COUNT) * (730 - 7));
        
        await projectStaking.connect(staker).stake(projectId, STAKE_AMOUNT, lockDurationDays);
      }
    }
    
    // Set up IU holders
    console.log("Setting up IU holders...");
    for (let batchStart = 0; batchStart < IU_HOLDERS_COUNT; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, IU_HOLDERS_COUNT);
      console.log(`Setting up IU holders ${batchStart} to ${batchEnd - 1}...`);
      
      for (let i = batchStart; i < batchEnd; i++) {
        const holder = iuHolders[i];
        
        // Get IU price
        const projectData = await innovationUnits.getProjectData(projectId);
        const iuPrice = projectData[1];
        
        // Calculate cost with 10% buffer for fees
        const cost = iuPrice.mul(IU_AMOUNT);
        const costWithFees = cost.mul(110).div(100);
        
        // Fund the holder
        await celToken.connect(owner).transfer(holder.address, costWithFees);
        
        // Approve and buy IUs
        await celToken.connect(holder).approve(innovationUnits.address, costWithFees);
        await innovationUnits.connect(holder).buyIUs(projectId, IU_AMOUNT);
      }
    }
    
    // Verify setup
    const projectScore = await projectStaking.getProjectScore(projectId);
    console.log(`Project staking score: ${ethers.utils.formatEther(projectScore)}`);
    
    const totalStaked = await projectStaking.projectTotalStaked(projectId);
    console.log(`Total staked on project: ${ethers.utils.formatEther(totalStaked)} CEL`);
    
    const totalIUs = await innovationUnits.getTotalSupply(projectId);
    console.log(`Total IUs in circulation: ${totalIUs}`);
    
    // Basic validation
    expect(totalStaked).to.be.gte(STAKE_AMOUNT.mul(STAKERS_COUNT));
    expect(totalIUs).to.be.gte(IU_AMOUNT * IU_HOLDERS_COUNT);
  });

  it("Should run a full emission cycle with 1000 innovators", async function() {
    this.timeout(3600000); // 1 hour
    
    // Start an epoch
    console.log("Starting emission epoch...");
    await emissionController.connect(owner).startEpoch();
    
    // Get epoch info
    const epochInfo = await emissionController.getCurrentEpochInfo();
    expect(epochInfo.isActive).to.be.true;
    console.log(`Epoch ${epochInfo.currentEpochNumber} started successfully`);
    
    // Advance time to the end of the epoch
    console.log("Advancing time to end of epoch...");
    const epochDuration = await emissionController.epochDuration();
    await time.increase(epochDuration.toNumber());
    
    // Process the epoch and measure performance
    console.log("Processing epoch with 1000 innovators...");
    const startTime = Date.now();
    const tx = await emissionController.connect(owner).processEpoch();
    await tx.wait();
    const endTime = Date.now();
    
    console.log(`Epoch processed in ${(endTime - startTime) / 1000} seconds`);
    
    // Get emission info
    const updatedEpochInfo = await emissionController.getCurrentEpochInfo();
    expect(updatedEpochInfo.isActive).to.be.false;
    
    const epochNumber = updatedEpochInfo.currentEpochNumber;
    const emissions = await emissionController.getEpochProjectEmissions(
      epochNumber,
      projectId
    );
    
    console.log(`Project emissions:
      Total: ${ethers.utils.formatEther(emissions.totalEmissions)} CEL
      Staking: ${ethers.utils.formatEther(emissions.stakingEmissions)} CEL
      IU Holders: ${ethers.utils.formatEther(emissions.iuHolderEmissions)} CEL
      Treasury: ${ethers.utils.formatEther(emissions.treasuryEmissions)} CEL`);
    
    // Basic validations
    expect(emissions.totalEmissions).to.be.gt(0);
    expect(emissions.stakingEmissions).to.be.gt(0);
    expect(emissions.iuHolderEmissions).to.be.gt(0);
    expect(emissions.treasuryEmissions).to.be.gt(0);
    
    // Sum check
    const sum = emissions.stakingEmissions
      .add(emissions.iuHolderEmissions)
      .add(emissions.treasuryEmissions);
    
    expect(sum).to.equal(emissions.totalEmissions);
  });
  
  it("Should efficiently process claims for many innovators", async function() {
    this.timeout(3600000); // 1 hour
    
    const epochNumber = await emissionController.currentEpoch();
    
    // Test claim performance with sample users
    console.log("Testing claim performance...");
    
    // Sample 10 stakers and 10 IU holders
    const sampleSize = 10;
    const claimTimes = { staking: [], iuHolder: [] };
    
    // Test staker claims
    console.log("Testing staker claims...");
    for (let i = 0; i < sampleSize; i++) {
      const stakerIndex = Math.floor(Math.random() * STAKERS_COUNT);
      const staker = stakers[stakerIndex];
      
      const unclaimedStaking = await emissionController.checkUnclaimedStakingEmissions(
        epochNumber,
        projectId,
        staker.address
      );
      
      if (unclaimedStaking.hasUnclaimed) {
        console.log(`Staker ${stakerIndex} has ${ethers.utils.formatEther(unclaimedStaking.amount)} CEL to claim`);
        
        const startTime = Date.now();
        const tx = await emissionController.connect(staker).claimStakingEmissions(
          epochNumber,
          projectId
        );
        await tx.wait();
        const endTime = Date.now();
        
        const claimDuration = endTime - startTime;
        claimTimes.staking.push(claimDuration);
        
        console.log(`Claimed in ${claimDuration / 1000} seconds`);
        
        // Verify claim
        const balance = await celToken.balanceOf(staker.address);
        expect(balance).to.be.gte(unclaimedStaking.amount);
        
        // Verify can't claim again
        const afterClaim = await emissionController.checkUnclaimedStakingEmissions(
          epochNumber,
          projectId,
          staker.address
        );
        expect(afterClaim.hasUnclaimed).to.be.false;
      }
    }
    
    // Test IU holder claims
    console.log("Testing IU holder claims...");
    for (let i = 0; i < sampleSize; i++) {
      const holderIndex = Math.floor(Math.random() * IU_HOLDERS_COUNT);
      const holder = iuHolders[holderIndex];
      
      const unclaimedIU = await emissionController.checkUnclaimedIUHolderEmissions(
        epochNumber,
        projectId,
        holder.address
      );
      
      if (unclaimedIU.hasUnclaimed) {
        console.log(`IU Holder ${holderIndex} has ${ethers.utils.formatEther(unclaimedIU.amount)} CEL to claim`);
        
        const startTime = Date.now();
        const tx = await emissionController.connect(holder).claimIUHolderEmissions(
          epochNumber,
          projectId
        );
        await tx.wait();
        const endTime = Date.now();
        
        const claimDuration = endTime - startTime;
        claimTimes.iuHolder.push(claimDuration);
        
        console.log(`Claimed in ${claimDuration / 1000} seconds`);
        
        // Verify claim
        const balance = await celToken.balanceOf(holder.address);
        expect(balance).to.be.gte(unclaimedIU.amount);
        
        // Verify can't claim again
        const afterClaim = await emissionController.checkUnclaimedIUHolderEmissions(
          epochNumber,
          projectId,
          holder.address
        );
        expect(afterClaim.hasUnclaimed).to.be.false;
      }
    }
    
    // Print claim performance stats
    console.log("\n=== CLAIM PERFORMANCE STATS ===");
    
    if (claimTimes.staking.length > 0) {
      const avgStakingClaimTime = claimTimes.staking.reduce((a, b) => a + b, 0) / claimTimes.staking.length;
      console.log(`Average staking claim time: ${avgStakingClaimTime / 1000} seconds`);
    }
    
    if (claimTimes.iuHolder.length > 0) {
      const avgIUClaimTime = claimTimes.iuHolder.reduce((a, b) => a + b, 0) / claimTimes.iuHolder.length;
      console.log(`Average IU holder claim time: ${avgIUClaimTime / 1000} seconds`);
    }
  });
}); 