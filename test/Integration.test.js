const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Celystik Hub Integration", function () {
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
  let creator1;
  let creator2;
  let contributor;
  let investor1;
  let investor2;
  let staker1;
  let staker2;
  let projectId;

  beforeEach(async function () {
    // Get the ContractFactory and Signers
    CELToken = await ethers.getContractFactory("CELToken");
    InnovationUnits = await ethers.getContractFactory("InnovationUnits");
    ProjectStaking = await ethers.getContractFactory("ProjectStaking");
    ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
    EmissionController = await ethers.getContractFactory("EmissionController");
    [owner, creator1, creator2, contributor, investor1, investor2, staker1, staker2] = await ethers.getSigners();

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
    
    // Deploy EmissionController
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
    
    // Distribute CEL tokens to all test accounts
    const initialTokenAmount = ethers.utils.parseEther("10000");
    for (const account of [creator1, creator2, contributor, investor1, investor2, staker1, staker2]) {
      await celToken.transfer(account.address, initialTokenAmount);
    }
  });

  describe("End-to-end Project Lifecycle", function () {
    it("Should handle the complete project lifecycle from creation to emissions", async function () {
      // Step 1: Create a project with multiple creators
      console.log("Creating project...");
      const totalSupply = ethers.utils.parseEther("1000000"); // 1M total supply
      const initialPrice = ethers.utils.parseEther("0.01"); // 0.01 CEL initial price
      const creators = [creator1.address, creator2.address];
      const creatorShares = [7000, 3000]; // 70% to creator1, 30% to creator2
      const creatorAllocation = 5000; // 50% to creators
      const contributorAllocation = 3000; // 30% to contributors
      const investorAllocation = 2000; // 20% to investors
      
      const createTx = await innovationUnits.createProject(
        totalSupply,
        initialPrice,
        creators,
        creatorShares,
        creatorAllocation,
        contributorAllocation,
        investorAllocation
      );
      const receipt = await createTx.wait();
      const event = receipt.events?.find(e => e.event === 'ProjectRegistered');
      projectId = event.args.projectId;
      console.log(`Project #${projectId} created`);
      
      // Verify initial creator allocations
      const creator1Units = await innovationUnits.balanceOf(creator1.address, projectId);
      const creator2Units = await innovationUnits.balanceOf(creator2.address, projectId);
      const totalCreatorUnits = creator1Units.add(creator2Units);
      
      const expectedCreatorAllocation = totalSupply.mul(creatorAllocation).div(10000);
      expect(totalCreatorUnits).to.equal(expectedCreatorAllocation);
      expect(creator1Units).to.equal(expectedCreatorAllocation.mul(7000).div(10000));
      
      // Step 2: Add a contributor to the project
      console.log("Adding contributor...");
      const contributorUnits = ethers.utils.parseEther("50000"); // 50k units
      await innovationUnits.connect(creator1).mintToContributor(
        projectId,
        contributor.address,
        contributorUnits
      );
      
      // Verify contributor allocation
      const actualContributorUnits = await innovationUnits.balanceOf(contributor.address, projectId);
      expect(actualContributorUnits).to.equal(contributorUnits);
      
      // Step 3: Investors purchase units
      console.log("Investors purchasing units...");
      const iuAmount1 = 100; // 100 IUs for investor1
      const iuAmount2 = 200; // 200 IUs for investor2
      
      // Calculate costs including fees using contract function
      const [basePayment1, fee1, totalCost1] = await innovationUnits.calculateBuyingCost(projectId, iuAmount1);
      const [basePayment2, fee2, totalCost2] = await innovationUnits.calculateBuyingCost(projectId, iuAmount2);
      
      // Approve CEL token transfers
      await celToken.connect(investor1).approve(innovationUnits.address, totalCost1);
      await celToken.connect(investor2).approve(innovationUnits.address, totalCost2);
      
      // Verify allowances
      const investor1Allowance = await celToken.allowance(investor1.address, innovationUnits.address);
      const investor2Allowance = await celToken.allowance(investor2.address, innovationUnits.address);
      console.log(`Investor1 allowance: ${ethers.utils.formatEther(investor1Allowance)} CEL`);
      console.log(`Investor2 allowance: ${ethers.utils.formatEther(investor2Allowance)} CEL`);
      
      // Purchase Innovation Units
      console.log(`Investor1 purchasing ${iuAmount1} IUs...`);
      await innovationUnits.connect(investor1).buyIUs(projectId, iuAmount1);
      console.log(`Investor2 purchasing ${iuAmount2} IUs...`);
      await innovationUnits.connect(investor2).buyIUs(projectId, iuAmount2);
      
      // Verify investor units
      const investor1Units = await innovationUnits.balanceOf(investor1.address, projectId);
      const investor2Units = await innovationUnits.balanceOf(investor2.address, projectId);
      expect(investor1Units).to.equal(iuAmount1);
      expect(investor2Units).to.equal(iuAmount2);
      
      // Step 4: Stakers stake CEL tokens on the project
      console.log("Staking on project...");
      const staker1Amount = ethers.utils.parseEther("1000");
      const staker2Amount = ethers.utils.parseEther("2000");
      const lockDurationDays = 20;
      
      // Approve CEL token transfers for staking
      await celToken.connect(staker1).approve(projectStaking.address, staker1Amount);
      await celToken.connect(staker2).approve(projectStaking.address, staker2Amount);
      
      // Stake on the project
      await projectStaking.connect(staker1).stake(projectId, staker1Amount, lockDurationDays);
      await projectStaking.connect(staker2).stake(projectId, staker2Amount, lockDurationDays);
      
      // Verify staking amounts
      const staker1Stakes = await projectStaking.getUserActiveStakes(projectId, staker1.address);
      const staker2Stakes = await projectStaking.getUserActiveStakes(projectId, staker2.address);
      expect(staker1Stakes.amounts[0]).to.equal(staker1Amount);
      expect(staker2Stakes.amounts[0]).to.equal(staker2Amount);
      
      // Step 5: Run through an emission epoch
      console.log("Starting emission epoch...");
      
      // Set project metrics score
      await emissionController.setProjectMetricsScore(projectId, ethers.utils.parseEther("5000"));
      await emissionController.setGlobalMetricsScore(ethers.utils.parseEther("5000"));
      
      // Start epoch
      await emissionController.startEpoch();
      
      // Fast forward time
      const epochDuration = await emissionController.epochDuration();
      await time.increase(epochDuration.toNumber() + 1);
      
      // Process the epoch
      console.log("Processing epoch...");
      await emissionController.processEpoch();
      
      // Get emission data
      const [totalEmissions, stakingEmissions, iuHolderEmissions] = await emissionController.getEpochProjectEmissions(1, projectId);
      console.log(`Project emissions: ${ethers.utils.formatEther(totalEmissions)} CEL`);
      console.log(`Staking emissions: ${ethers.utils.formatEther(stakingEmissions)} CEL`);
      console.log(`IU holder emissions: ${ethers.utils.formatEther(iuHolderEmissions)} CEL`);
      
      // Step 6: Claim emissions
      console.log("Claiming emissions...");
      
      // Check and claim staking emissions
      const staker1InitialBalance = await celToken.balanceOf(staker1.address);
      const [hasUnclaimedStaking, unclaimedStakingAmount] = await emissionController.checkUnclaimedStakingEmissions(1, projectId, staker1.address);
      
      if (hasUnclaimedStaking) {
        console.log(`Staker1 can claim: ${ethers.utils.formatEther(unclaimedStakingAmount)} CEL`);
        await emissionController.connect(staker1).claimStakingEmissions(1, projectId);
        
        // Verify staker received emissions
        const staker1FinalBalance = await celToken.balanceOf(staker1.address);
        expect(staker1FinalBalance).to.be.gt(staker1InitialBalance);
        expect(staker1FinalBalance.sub(staker1InitialBalance)).to.equal(unclaimedStakingAmount);
      }
      
      // Check and claim IU holder emissions
      const investor1InitialBalance = await celToken.balanceOf(investor1.address);
      const [hasUnclaimedIU, unclaimedIUAmount] = await emissionController.checkUnclaimedIUHolderEmissions(1, projectId, investor1.address);
      
      if (hasUnclaimedIU) {
        console.log(`Investor1 can claim: ${ethers.utils.formatEther(unclaimedIUAmount)} CEL`);
        await emissionController.connect(investor1).claimIUHolderEmissions(1, projectId);
        
        // Verify investor received emissions
        const investor1FinalBalance = await celToken.balanceOf(investor1.address);
        expect(investor1FinalBalance).to.be.gt(investor1InitialBalance);
        expect(investor1FinalBalance.sub(investor1InitialBalance)).to.equal(unclaimedIUAmount);
      }
      
      console.log("End-to-end test completed successfully!");
    });
  });

  describe("Advanced Scenario: Project Evolution", function () {
    it("Should handle a project's evolution over multiple epochs", async function () {
      // Create a project
      const createTx = await innovationUnits.createProject(
        ethers.utils.parseEther("1000000"), // 1M total supply
        ethers.utils.parseEther("0.01"), // 0.01 CEL initial price
        [creator1.address], 
        [10000], // 100% to creator1
        6000, // 60% to creators
        2000, // 20% to contributors
        2000  // 20% to investors
      );
      const receipt = await createTx.wait();
      const event = receipt.events?.find(e => e.event === 'ProjectRegistered');
      projectId = event.args.projectId;
      
      // Initial staking - low amount
      const lockDurationDays = 20;
      await celToken.connect(staker1).approve(projectStaking.address, ethers.utils.parseEther("1000"));
      await projectStaking.connect(staker1).stake(projectId, ethers.utils.parseEther("1000"), lockDurationDays);
      
      // First epoch - low project metrics
      await emissionController.setProjectMetricsScore(projectId, ethers.utils.parseEther("1000"));
      await emissionController.setGlobalMetricsScore(ethers.utils.parseEther("10000"));
      
      await emissionController.startEpoch();
      await time.increase((await emissionController.epochDuration()).toNumber() + 1);
      await emissionController.processEpoch();
      
      const [epoch1Total, epoch1Staking, epoch1IU] = await emissionController.getEpochProjectEmissions(1, projectId);
      
      // Second epoch - project grows, more staking
      await celToken.connect(staker2).approve(projectStaking.address, ethers.utils.parseEther("5000"));
      await projectStaking.connect(staker2).stake(projectId, ethers.utils.parseEther("5000"), lockDurationDays);
      
      // Project metrics improve
      await emissionController.setProjectMetricsScore(projectId, ethers.utils.parseEther("3000"));
      
      await emissionController.startEpoch();
      await time.increase((await emissionController.epochDuration()).toNumber() + 1);
      await emissionController.processEpoch();
      
      const [epoch2Total, epoch2Staking, epoch2IU] = await emissionController.getEpochProjectEmissions(2, projectId);
      
      // Third epoch - project matures, more investment
      // Calculate costs for IU purchase using contract function
      const iuAmount = 100; // 100 IUs
      const [basePayment, fee, totalCost] = await innovationUnits.calculateBuyingCost(projectId, iuAmount);
      
      // Approve and purchase IUs
      await celToken.connect(investor1).approve(innovationUnits.address, totalCost);
      await innovationUnits.connect(investor1).buyIUs(projectId, iuAmount);
      
      // Project metrics become excellent
      await emissionController.setProjectMetricsScore(projectId, ethers.utils.parseEther("8000"));
      
      await emissionController.startEpoch();
      await time.increase((await emissionController.epochDuration()).toNumber() + 1);
      await emissionController.processEpoch();
      
      const [epoch3Total, epoch3Staking, epoch3IU] = await emissionController.getEpochProjectEmissions(3, projectId);
      
      // Compare emissions growth across epochs
      expect(epoch2Total).to.be.gt(epoch1Total);
      expect(epoch3Total).to.be.gt(epoch2Total);
      
      console.log(`Epoch 1 emissions: ${ethers.utils.formatEther(epoch1Total)} CEL`);
      console.log(`Epoch 2 emissions: ${ethers.utils.formatEther(epoch2Total)} CEL`);
      console.log(`Epoch 3 emissions: ${ethers.utils.formatEther(epoch3Total)} CEL`);
      
      // Verify all participants can claim rewards
      await emissionController.startEpoch(); // Start another epoch for claim validation
      
      // Loop through all epochs and verify claim process for each participant
      for (let epoch = 1; epoch <= 3; epoch++) {
        // Check staker claims
        const stakers = [staker1, staker2];
        for (const staker of stakers) {
          const [hasUnclaimed, amount] = await emissionController.checkUnclaimedStakingEmissions(
            epoch, projectId, staker.address
          );
          
          if (hasUnclaimed) {
            await emissionController.connect(staker).claimStakingEmissions(epoch, projectId);
            // Verify claim was recorded
            const [hasUnclaimedAfter] = await emissionController.checkUnclaimedStakingEmissions(
              epoch, projectId, staker.address
            );
            expect(hasUnclaimedAfter).to.be.false;
          }
        }
        
        // Check IU holder claims
        if (epoch >= 3) { // Investor only present from epoch 3
          const [hasUnclaimed, amount] = await emissionController.checkUnclaimedIUHolderEmissions(
            epoch, projectId, investor1.address
          );
          
          if (hasUnclaimed) {
            await emissionController.connect(investor1).claimIUHolderEmissions(epoch, projectId);
            // Verify claim was recorded
            const [hasUnclaimedAfter] = await emissionController.checkUnclaimedIUHolderEmissions(
              epoch, projectId, investor1.address
            );
            expect(hasUnclaimedAfter).to.be.false;
          }
        }
      }
    });
  });
}); 