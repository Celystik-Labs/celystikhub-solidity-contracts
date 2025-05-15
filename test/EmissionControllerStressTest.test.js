const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EmissionController Stress Test", function () {
  // Test configuration - ADJUST THESE BASED ON YOUR ENVIRONMENT CAPABILITIES
  const NUM_PROJECTS = 50; // Use 1000 for full stress test
  const NUM_USERS_PER_PROJECT = 20; // Use 100 for full stress test
  const INITIAL_CEL_SUPPLY = ethers.utils.parseEther("1000000000"); // 1B CEL
  const BASE_STAKE_AMOUNT = ethers.utils.parseEther("1000"); // 1000 CEL
  const BASE_BUY_AMOUNT = 100; // 100 IU tokens

  // Contract instances
  let celToken;
  let innovationUnits;
  let projectStaking;
  let emissionController;
  
  // Signers
  let owner;
  let treasury;
  let users = [];
  
  // Test data
  let projectIds = [];
  
  // Performance metrics
  let setupStartTime;
  let setupEndTime;
  let epochStartTime;
  let epochProcessTime;
  let claimTimes = [];
  
  before(async function() {
    // Set very long timeout as this test involves many transactions
    this.timeout(24 * 3600 * 1000); // 24 hours
    
    console.log("=== EMISSION CONTROLLER STRESS TEST ===");
    console.log(`Testing with ${NUM_PROJECTS} projects and ${NUM_USERS_PER_PROJECT} users per project`);
    console.log(`Total number of users: ${NUM_PROJECTS * NUM_USERS_PER_PROJECT}`);
    
    setupStartTime = Date.now();
    
    // Get signers
    [owner, treasury, ...restSigners] = await ethers.getSigners();
    
    // Use existing signers to start with
    users = restSigners;
    
    // Calculate total users needed
    const totalUsersNeeded = NUM_PROJECTS * NUM_USERS_PER_PROJECT;
    console.log(`Total users needed: ${totalUsersNeeded}`);
    console.log(`Available signers: ${users.length}`);
    
    // Create additional wallet instances if needed (but note they won't have ETH)
    if (totalUsersNeeded > users.length) {
      console.log(`Creating ${totalUsersNeeded - users.length} additional user wallets...`);
      for (let i = users.length; i < totalUsersNeeded; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        users.push(wallet);
        if (i % 1000 === 0) {
          console.log(`Created ${i - users.length + 1} user wallets...`);
        }
      }
    }
    
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
    
    // Configure a shorter epoch duration for testing (1 day instead of 30)
    await emissionController.setEpochDuration(86400); // 1 day
    
    console.log("Contract setup complete. Setting up projects and users...");
    
    // IMPORTANT: CREATE PROJECTS IN BATCHES TO AVOID GAS ISSUES
    const BATCH_SIZE = 10;
    
    // Create projects in batches
    console.log(`Creating ${NUM_PROJECTS} projects in batches of ${BATCH_SIZE}...`);
    for (let batchStart = 0; batchStart < NUM_PROJECTS; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, NUM_PROJECTS);
      console.log(`Creating projects ${batchStart} to ${batchEnd - 1}...`);
      await createProjectsBatch(batchStart, batchEnd);
    }
    
    // Set up users for each project in batches
    console.log(`Setting up ${NUM_USERS_PER_PROJECT} users for each project in batches...`);
    for (let projectIndex = 0; projectIndex < projectIds.length; projectIndex++) {
      const projectId = projectIds[projectIndex];
      console.log(`Setting up users for project ${projectId} (${projectIndex + 1}/${projectIds.length})...`);
      
      // Set up users in batches
      for (let batchStart = 0; batchStart < NUM_USERS_PER_PROJECT; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, NUM_USERS_PER_PROJECT);
        console.log(`Setting up users ${batchStart} to ${batchEnd - 1} for project ${projectId}...`);
        await setupUsersBatch(projectId, projectIndex, batchStart, batchEnd);
      }
    }
    
    setupEndTime = Date.now();
    console.log(`Setup completed in ${(setupEndTime - setupStartTime) / 1000} seconds`);
  });

  // Helper function to create a batch of projects
  async function createProjectsBatch(startIdx, endIdx) {
    for (let i = startIdx; i < endIdx; i++) {
      // Use a dedicated creator for each project
      const creator = users[i];
      
      // Fund the creator
      await celToken.transfer(creator.address, ethers.utils.parseEther("10000"));
      
      // Set up project params
      const params = {
        initialPrice: ethers.utils.parseEther("1"), // 1 CEL per IU
        creators: [creator.address],
        creatorShares: [10000], // 100% to this creator
        creatorsAllocatedPercentage: 2000, // 20%
        contributorsReservePercentage: 3000, // 30%
        investorsReservePercentage: 5000, // 50%
        projectName: `Stress Test Project ${i}`
      };
      
      // Create the project
      const tx = await innovationUnits.connect(owner).createProject(
        params.initialPrice,
        params.creators,
        params.creatorShares,
        params.creatorsAllocatedPercentage,
        params.contributorsReservePercentage,
        params.investorsReservePercentage,
        params.projectName
      );
      
      const receipt = await tx.wait();
      
      // Extract the project ID from events
      const event = receipt.events.find(e => e.event === 'ProjectRegistered');
      const projectId = event.args.projectId.toNumber();
      projectIds.push(projectId);
    }
  }
  
  // Helper function to set up a batch of users for a project
  async function setupUsersBatch(projectId, projectIndex, startUserIdx, endUserIdx) {
    // Half of the users will be stakers, half will be IU holders
    const midpoint = Math.floor((startUserIdx + endUserIdx) / 2);
    
    // Calculate base user index for this project
    const projectBaseIdx = NUM_PROJECTS + (projectIndex * NUM_USERS_PER_PROJECT);
    
    // Setup stakers
    for (let i = startUserIdx; i < midpoint; i++) {
      const userIdx = projectBaseIdx + i;
      const user = users[userIdx];
      
      // Fund the user
      const stakeAmount = BASE_STAKE_AMOUNT.add(ethers.utils.parseEther((i % 10).toString()));
      await celToken.transfer(user.address, stakeAmount);
      
      // Approve and stake
      await celToken.connect(user).approve(projectStaking.address, stakeAmount);
      await projectStaking.connect(user).stake(
        projectId, 
        stakeAmount,
        7 + ((i % 104) * 7) // Lock between 7 days and 2 years
      );
    }
    
    // Setup IU holders
    for (let i = midpoint; i < endUserIdx; i++) {
      const userIdx = projectBaseIdx + i;
      const user = users[userIdx];
      
      // Get IU price
      const projectData = await innovationUnits.getProjectData(projectId);
      const iuPrice = projectData[1];
      
      // Calculate buy amount and cost
      const buyAmount = BASE_BUY_AMOUNT + (i % 10);
      const cost = iuPrice.mul(buyAmount);
      const costWithFees = cost.mul(110).div(100); // Add 10% for fees
      
      // Fund the user
      await celToken.transfer(user.address, costWithFees);
      
      // Approve and buy IUs
      await celToken.connect(user).approve(innovationUnits.address, costWithFees);
      await innovationUnits.connect(user).buyIUs(projectId, buyAmount);
    }
  }

  it("Should handle a complete emission cycle at scale", async function() {
    // Set a very long timeout for this test
    this.timeout(24 * 3600 * 1000); // 24 hours
    
    console.log("\n=== STARTING EMISSION CYCLE STRESS TEST ===");
    
    // 1. Start an epoch
    console.log("Starting emission epoch...");
    epochStartTime = Date.now();
    await emissionController.startEpoch();
    
    // Verify epoch was started
    const epochInfo = await emissionController.getCurrentEpochInfo();
    expect(epochInfo.isActive).to.be.true;
    console.log(`Epoch ${epochInfo.currentEpochNumber} started successfully`);
    
    // 2. Fast forward to end of epoch
    console.log("Advancing time to end of epoch...");
    const epochDuration = await emissionController.epochDuration();
    await time.increase(epochDuration.toNumber());
    
    // 3. Process the epoch
    console.log("Processing epoch...");
    const processStart = Date.now();
    const tx = await emissionController.processEpoch();
    await tx.wait();
    const processEnd = Date.now();
    epochProcessTime = processEnd - processStart;
    
    console.log(`Epoch processed in ${epochProcessTime / 1000} seconds`);
    
    // Check that the epoch was processed
    const updatedEpochInfo = await emissionController.getCurrentEpochInfo();
    expect(updatedEpochInfo.isActive).to.be.false;
    
    // 4. Sample a few projects to verify emissions
    console.log("Verifying emissions for sample projects...");
    
    // Total emissions for this epoch
    const epochNumber = updatedEpochInfo.currentEpochNumber;
    let totalEmissionsForEpoch = ethers.BigNumber.from(0);
    
    // Check 5 random projects
    const samplesToCheck = 5;
    const sampleProjects = [];
    
    for (let i = 0; i < samplesToCheck; i++) {
      const randomIndex = Math.floor(Math.random() * projectIds.length);
      const projectId = projectIds[randomIndex];
      sampleProjects.push(projectId);
      
      // Get emissions data
      const emissions = await emissionController.getEpochProjectEmissions(epochNumber, projectId);
      
      console.log(`Project ${projectId} emissions: 
        Total: ${ethers.utils.formatEther(emissions.totalEmissions)} CEL
        Staking: ${ethers.utils.formatEther(emissions.stakingEmissions)} CEL (${emissions.stakingEmissions.mul(100).div(emissions.totalEmissions)}%)
        IU Holders: ${ethers.utils.formatEther(emissions.iuHolderEmissions)} CEL (${emissions.iuHolderEmissions.mul(100).div(emissions.totalEmissions)}%)
        Treasury: ${ethers.utils.formatEther(emissions.treasuryEmissions)} CEL (${emissions.treasuryEmissions.mul(100).div(emissions.totalEmissions)}%)`);
      
      // Add to total
      totalEmissionsForEpoch = totalEmissionsForEpoch.add(emissions.totalEmissions);
      
      // Basic validations
      expect(emissions.totalEmissions).to.be.gt(0);
      
      // Sum check
      const sum = emissions.stakingEmissions
        .add(emissions.iuHolderEmissions)
        .add(emissions.treasuryEmissions);
      
      expect(sum).to.equal(emissions.totalEmissions);
    }
    
    console.log(`Total emissions for sampled projects: ${ethers.utils.formatEther(totalEmissionsForEpoch)} CEL`);
    
    // 5. Test claiming for sample users
    console.log("\nTesting claiming performance...");
    
    // For each sample project, test with a few stakers and IU holders
    for (const projectId of sampleProjects) {
      const projectIndex = projectIds.indexOf(projectId);
      const projectBaseUserIdx = NUM_PROJECTS + (projectIndex * NUM_USERS_PER_PROJECT);
      
      // Try with 3 stakers
      for (let i = 0; i < 3; i++) {
        const userIdx = projectBaseUserIdx + i;
        const user = users[userIdx];
        
        // Check if they have claims
        const unclaimedStaking = await emissionController.checkUnclaimedStakingEmissions(
          epochNumber,
          projectId,
          user.address
        );
        
        if (unclaimedStaking.hasUnclaimed) {
          console.log(`Staker ${i} for Project ${projectId} has ${ethers.utils.formatEther(unclaimedStaking.amount)} CEL to claim`);
          
          const claimStart = Date.now();
          const tx = await emissionController.connect(user).claimStakingEmissions(epochNumber, projectId);
          await tx.wait();
          const claimEnd = Date.now();
          const claimDuration = claimEnd - claimStart;
          claimTimes.push(claimDuration);
          
          console.log(`Claimed in ${claimDuration / 1000} seconds`);
          
          // Verify they received tokens
          const balance = await celToken.balanceOf(user.address);
          expect(balance).to.be.gte(unclaimedStaking.amount);
          
          // Verify they can't claim again
          const afterClaim = await emissionController.checkUnclaimedStakingEmissions(
            epochNumber,
            projectId,
            user.address
          );
          expect(afterClaim.hasUnclaimed).to.be.false;
        }
      }
      
      // Try with 3 IU holders
      const midpoint = Math.floor(NUM_USERS_PER_PROJECT / 2);
      for (let i = 0; i < 3; i++) {
        const userIdx = projectBaseUserIdx + midpoint + i;
        const user = users[userIdx];
        
        // Check if they have claims
        const unclaimedIU = await emissionController.checkUnclaimedIUHolderEmissions(
          epochNumber,
          projectId,
          user.address
        );
        
        if (unclaimedIU.hasUnclaimed) {
          console.log(`IU Holder ${i} for Project ${projectId} has ${ethers.utils.formatEther(unclaimedIU.amount)} CEL to claim`);
          
          const claimStart = Date.now();
          const tx = await emissionController.connect(user).claimIUHolderEmissions(epochNumber, projectId);
          await tx.wait();
          const claimEnd = Date.now();
          const claimDuration = claimEnd - claimStart;
          claimTimes.push(claimDuration);
          
          console.log(`Claimed in ${claimDuration / 1000} seconds`);
          
          // Verify they received tokens
          const balance = await celToken.balanceOf(user.address);
          expect(balance).to.be.gte(unclaimedIU.amount);
          
          // Verify they can't claim again
          const afterClaim = await emissionController.checkUnclaimedIUHolderEmissions(
            epochNumber,
            projectId,
            user.address
          );
          expect(afterClaim.hasUnclaimed).to.be.false;
        }
      }
    }
    
    // 6. Performance Report
    console.log("\n=== PERFORMANCE REPORT ===");
    console.log(`Number of projects: ${NUM_PROJECTS}`);
    console.log(`Users per project: ${NUM_USERS_PER_PROJECT}`);
    console.log(`Total users: ${NUM_PROJECTS * NUM_USERS_PER_PROJECT}`);
    console.log(`Setup time: ${(setupEndTime - setupStartTime) / 1000} seconds`);
    console.log(`Epoch processing time: ${epochProcessTime / 1000} seconds`);
    
    if (claimTimes.length > 0) {
      const avgClaimTime = claimTimes.reduce((a, b) => a + b, 0) / claimTimes.length;
      const minClaimTime = Math.min(...claimTimes);
      const maxClaimTime = Math.max(...claimTimes);
      
      console.log(`Claim performance (${claimTimes.length} claims):`);
      console.log(`  Average claim time: ${avgClaimTime / 1000} seconds`);
      console.log(`  Minimum claim time: ${minClaimTime / 1000} seconds`);
      console.log(`  Maximum claim time: ${maxClaimTime / 1000} seconds`);
    }
    
    // Perform another epoch to make sure everything still works
    console.log("\n=== RUNNING SECOND EPOCH ===");
    await emissionController.startEpoch();
    await time.increase(epochDuration.toNumber());
    await emissionController.processEpoch();
    
    const epoch2Info = await emissionController.getCurrentEpochInfo();
    expect(epoch2Info.currentEpochNumber).to.equal(2);
    expect(epoch2Info.isActive).to.be.false;
    
    console.log("Second epoch processed successfully!");
    console.log("Stress test completed!");
  });
}); 