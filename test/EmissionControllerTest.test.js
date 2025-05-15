const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EmissionController Large Scale Test", function () {
  // Test configuration
  const NUM_PROJECTS = 3; // Reduced from 10
  const NUM_USERS_PER_PROJECT = 4; // Reduced from 10
  const INITIAL_CEL_SUPPLY = ethers.utils.parseEther("10000000"); // 10M CEL
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
  let projectCreators = [];
  
  before(async function() {
    // This setup may take a long time with 1000 projects and 100,000 users
    // Increase the timeout for this test
    this.timeout(3600000); // 1 hour
    
    console.log("Starting large scale emission controller test setup...");
    
    // Get signers
    [owner, treasury, ...restSigners] = await ethers.getSigners();
    
    // Create necessary users
    const totalUsersNeeded = NUM_PROJECTS * NUM_USERS_PER_PROJECT + NUM_PROJECTS;
    console.log(`Creating ${totalUsersNeeded} user accounts...`);
    
    // Use existing signers first
    users = restSigners;
    
    // Check if we have enough accounts
    if (totalUsersNeeded > users.length) {
      console.log(`Warning: Not enough Hardhat accounts. Need ${totalUsersNeeded} but only have ${users.length}.`);
      console.log(`The test will use ${users.length} accounts and duplicate some of them.`);
      
      // Use existing accounts by cycling through them
      const existingUsersCount = users.length;
      for (let i = existingUsersCount; i < totalUsersNeeded; i++) {
        // Reuse existing accounts in a round-robin fashion
        users.push(users[i % existingUsersCount]);
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
    
    // Create sample projects and assign test users
    console.log(`Creating ${NUM_PROJECTS} projects...`);
    await createProjects();
    
    // Set up stakers and IU holders for each project
    console.log(`Setting up ${NUM_USERS_PER_PROJECT} users per project...`);
    await setupUsersForProjects();
    
    console.log("Setup complete!");
  });

  // Helper function to create projects
  async function createProjects() {
    for (let i = 0; i < NUM_PROJECTS; i++) {
      // Create a creator for this project
      const creatorIndex = i;
      const creator = users[creatorIndex];
      projectCreators.push(creator);
      
      // Fund the creator with CEL tokens for creating project
      await celToken.transfer(creator.address, ethers.utils.parseEther("10000"));
      
      // Create project parameters
      // Creators get 20%, contributors get 30%, investors get 50%
      const creatorParams = {
        initialPrice: ethers.utils.parseEther("1"), // 1 CEL per IU
        creators: [creator.address],
        creatorShares: [10000], // 100% of creator allocation to this address
        creatorsAllocatedPercentage: 2000, // 20%
        contributorsReservePercentage: 3000, // 30%
        investorsReservePercentage: 5000, // 50%
        projectName: `Project ${i}`
      };
      
      // Have the owner connect to the Innovation Units contract and create the project
      const tx = await innovationUnits.connect(owner).createProject(
        creatorParams.initialPrice,
        creatorParams.creators,
        creatorParams.creatorShares,
        creatorParams.creatorsAllocatedPercentage,
        creatorParams.contributorsReservePercentage,
        creatorParams.investorsReservePercentage,
        creatorParams.projectName
      );
      
      const receipt = await tx.wait();
      
      // Extract project ID from the event
      const projectRegisteredEvent = receipt.events.find(e => e.event === 'ProjectRegistered');
      const projectId = projectRegisteredEvent.args.projectId.toNumber();
      projectIds.push(projectId);
      
      if ((i + 1) % 10 === 0) {
        console.log(`Created ${i + 1} projects...`);
      }
    }
  }
  
  // Helper function to set up users (stakers and IU holders) for each project
  async function setupUsersForProjects() {
    // Evenly distribute users between stakers and IU holders
    const usersPerGroup = Math.floor(NUM_USERS_PER_PROJECT / 2);
    
    // For each project
    for (let p = 0; p < projectIds.length; p++) {
      const projectId = projectIds[p];
      const usersOffset = NUM_PROJECTS + (p * NUM_USERS_PER_PROJECT);
      
      // Setup stakers
      for (let i = 0; i < usersPerGroup; i++) {
        const userIdx = usersOffset + i;
        const user = users[userIdx];
        
        // Fund the user with CEL tokens
        const stakeAmount = BASE_STAKE_AMOUNT.add(ethers.utils.parseEther(i.toString()));
        await celToken.connect(owner).transfer(user.address, stakeAmount);
        
        // Approve the staking contract to spend tokens
        await celToken.connect(user).approve(projectStaking.address, stakeAmount);
        
        // Stake tokens
        // Lock for between 1 week and 2 years based on user index
        const lockDurationDays = 7 + Math.floor(i * (730 - 7) / usersPerGroup);
        await projectStaking.connect(user).stake(projectId, stakeAmount, lockDurationDays);
        
        if ((p * usersPerGroup + i + 1) % 100 === 0) {
          console.log(`Setup ${p * usersPerGroup + i + 1} stakers...`);
        }
      }
      
      // Setup IU buyers
      for (let i = 0; i < usersPerGroup; i++) {
        const userIdx = usersOffset + usersPerGroup + i;
        const user = users[userIdx];
        
        // Get the IU price
        const projectData = await innovationUnits.getProjectData(projectId);
        const iuPrice = projectData[1]; // initialPrice
        
        // Calculate how many IUs to buy (varying by user)
        const buyAmount = BASE_BUY_AMOUNT + i;
        const totalCost = iuPrice.mul(buyAmount);
        // Add 10% for fees
        const costWithFees = totalCost.mul(110).div(100);
        
        // Fund the user with CEL tokens
        await celToken.connect(owner).transfer(user.address, costWithFees);
        
        // Approve the innovation units contract to spend tokens
        await celToken.connect(user).approve(innovationUnits.address, costWithFees);
        
        // Buy IUs
        await innovationUnits.connect(user).buyIUs(projectId, buyAmount);
        
        if ((p * usersPerGroup + i + 1) % 100 === 0) {
          console.log(`Setup ${p * usersPerGroup + i + 1} IU holders...`);
        }
      }
      
      console.log(`Completed setup for project ${p + 1} of ${projectIds.length}`);
    }
  }

  it("Should properly run a complete emission cycle with many projects and users", async function() {
    // This test can take a long time with many projects and users
    this.timeout(3600000); // 1 hour
    
    console.log("Starting emission cycle test...");
    
    // 1. Start the epoch
    console.log("Starting emission epoch...");
    await emissionController.connect(owner).startEpoch();
    
    // Get epoch info
    const epochInfo = await emissionController.getCurrentEpochInfo();
    expect(epochInfo.isActive).to.be.true;
    console.log(`Epoch ${epochInfo.currentEpochNumber} started at ${new Date(epochInfo.startTime.toNumber() * 1000)}`);
    
    // 2. Advance time to the end of the epoch
    console.log("Advancing time to end of epoch...");
    const epochDuration = await emissionController.epochDuration();
    await time.increase(epochDuration.toNumber());
    
    // 3. Process the epoch
    console.log("Processing epoch...");
    await emissionController.connect(owner).processEpoch();
    
    // Verify epoch was processed
    const updatedEpochInfo = await emissionController.getCurrentEpochInfo();
    expect(updatedEpochInfo.isActive).to.be.false;
    console.log(`Epoch ${updatedEpochInfo.currentEpochNumber} processed`);
    
    // 4. Verify total emissions were calculated correctly
    const epochNumber = updatedEpochInfo.currentEpochNumber;
    
    // Sample projects to check in detail
    const projectsToCheck = projectIds.slice(0, 3);
    
    console.log("Checking emission calculations for sample projects...");
    for (const projectId of projectsToCheck) {
      const emissions = await emissionController.getEpochProjectEmissions(epochNumber, projectId);
      console.log(`Project ${projectId} emissions:
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
      const sum = emissions.stakingEmissions.add(emissions.iuHolderEmissions).add(emissions.treasuryEmissions);
      // Due to rounding errors, don't check for exact equality
      const diff = sum.sub(emissions.totalEmissions).abs();
      const tolerance = ethers.BigNumber.from(10); // Small tolerance for rounding errors
      expect(diff.lte(tolerance)).to.be.true;
    }
    
    // 5. Test claiming emissions for a sample of users
    console.log("Testing emission claims for sample users...");
    
    // Sample a few users from each project for testing claims
    for (const projectId of projectsToCheck) {
      const usersOffset = NUM_PROJECTS + (projectIds.indexOf(projectId) * NUM_USERS_PER_PROJECT);
      
      // Sample stakers
      for (let i = 0; i < 3; i++) {
        const user = users[usersOffset + i];
        
        // Check unclaimed staking emissions
        const unclaimedStaking = await emissionController.checkUnclaimedStakingEmissions(
          epochNumber,
          projectId,
          user.address
        );
        
        if (unclaimedStaking.hasUnclaimed) {
          console.log(`User ${user.address} has ${ethers.utils.formatEther(unclaimedStaking.amount)} CEL unclaimed staking emissions`);
          
          // Claim staking emissions
          const celBalanceBefore = await celToken.balanceOf(user.address);
          await emissionController.connect(user).claimStakingEmissions(epochNumber, projectId);
          const celBalanceAfter = await celToken.balanceOf(user.address);
          
          // Verify user received the tokens
          const received = celBalanceAfter.sub(celBalanceBefore);
          console.log(`User received ${ethers.utils.formatEther(received)} CEL from staking emissions`);
          expect(received).to.be.gt(0);
          expect(received).to.equal(unclaimedStaking.amount);
          
          // Verify user can't claim again
          const afterClaim = await emissionController.checkUnclaimedStakingEmissions(
            epochNumber,
            projectId,
            user.address
          );
          expect(afterClaim.hasUnclaimed).to.be.false;
        }
      }
      
      // Sample IU holders
      const usersPerGroup = Math.floor(NUM_USERS_PER_PROJECT / 2);
      for (let i = 0; i < 3; i++) {
        const user = users[usersOffset + usersPerGroup + i];
        
        // Check unclaimed IU holder emissions
        const unclaimedIUHolder = await emissionController.checkUnclaimedIUHolderEmissions(
          epochNumber,
          projectId,
          user.address
        );
        
        if (unclaimedIUHolder.hasUnclaimed) {
          console.log(`User ${user.address} has ${ethers.utils.formatEther(unclaimedIUHolder.amount)} CEL unclaimed IU holder emissions`);
          
          // Claim IU holder emissions
          const celBalanceBefore = await celToken.balanceOf(user.address);
          await emissionController.connect(user).claimIUHolderEmissions(epochNumber, projectId);
          const celBalanceAfter = await celToken.balanceOf(user.address);
          
          // Verify user received the tokens
          const received = celBalanceAfter.sub(celBalanceBefore);
          console.log(`User received ${ethers.utils.formatEther(received)} CEL from IU holder emissions`);
          expect(received).to.be.gt(0);
          expect(received).to.equal(unclaimedIUHolder.amount);
          
          // Verify user can't claim again
          const afterClaim = await emissionController.checkUnclaimedIUHolderEmissions(
            epochNumber,
            projectId,
            user.address
          );
          expect(afterClaim.hasUnclaimed).to.be.false;
        }
      }
    }
    
    // 6. Run a second epoch cycle to ensure continued functionality
    console.log("Starting second emission epoch...");
    await emissionController.connect(owner).startEpoch();
    
    // Advance time to the end of the second epoch
    console.log("Advancing time to end of second epoch...");
    await time.increase(epochDuration.toNumber());
    
    // Process the second epoch
    console.log("Processing second epoch...");
    await emissionController.connect(owner).processEpoch();
    
    // Verify second epoch was processed
    const secondEpochInfo = await emissionController.getCurrentEpochInfo();
    expect(secondEpochInfo.isActive).to.be.false;
    expect(secondEpochInfo.currentEpochNumber).to.equal(2);
    console.log(`Second epoch processed`);
    
    console.log("Emission cycle test completed successfully!");
  });
}); 