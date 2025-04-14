const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InnovationUnits", function () {
  let CELToken;
  let celToken;
  let InnovationUnits;
  let innovationUnits;
  let owner;
  let creator;
  let contributor1;
  let contributor2;
  let investor1;
  let investor2;
  let nonParticipant;
  let addrs;

  // Constants for testing
  const PROJECT_ID = 1;
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 1 million tokens
  const CAP = ethers.utils.parseEther("10000000"); // 10 million tokens
  const TOTAL_SUPPLY = ethers.utils.parseEther("100000"); // 100k IU tokens
  const CREATOR_SHARE = ethers.utils.parseEther("20");  // 20% scaled by PRECISION (1e18)
  const CONTRIBUTOR_SHARE = ethers.utils.parseEther("30");  // 30% scaled by PRECISION
  const INVESTOR_SHARE = ethers.utils.parseEther("50");  // 50% scaled by PRECISION
  const PRICE_PER_UNIT = ethers.utils.parseEther("0.01"); // 0.01 CEL per IU
  const PURCHASE_AMOUNT = ethers.utils.parseEther("1000");
  const CONTRIBUTION_VALUE = ethers.utils.parseEther("100");

  beforeEach(async function () {
    // Get the ContractFactory and Signers here
    CELToken = await ethers.getContractFactory("CELToken");
    InnovationUnits = await ethers.getContractFactory("InnovationUnits");
    [owner, creator, contributor1, contributor2, investor1, investor2, nonParticipant, ...addrs] = await ethers.getSigners();

    // Deploy CEL Token
    celToken = await CELToken.deploy(
      "Celystik Hub Token", // name
      "CEL",               // symbol
      INITIAL_SUPPLY,      // Initial supply
      CAP                  // Cap
    );
    await celToken.deployed();

    // Deploy InnovationUnits
    innovationUnits = await InnovationUnits.deploy(celToken.address);
    await innovationUnits.deployed();

    // Create a project
    await innovationUnits.createProject(
      PROJECT_ID,
      TOTAL_SUPPLY,
      CREATOR_SHARE,
      CONTRIBUTOR_SHARE,
      INVESTOR_SHARE,
      PRICE_PER_UNIT
    );

    // Transfer tokens to users for testing
    // Make sure to transfer enough tokens (20,000 CEL) to support all test cases
    await celToken.transfer(investor1.address, ethers.utils.parseEther("20000"));
    await celToken.transfer(investor2.address, ethers.utils.parseEther("20000"));

    // Ensure investor1 and investor2 have CEL tokens before purchases
    const investor1Balance = await celToken.balanceOf(investor1.address);
    const investor2Balance = await celToken.balanceOf(investor2.address);
    console.log(`Investor1 balance: ${ethers.utils.formatEther(investor1Balance)} CEL`);
    console.log(`Investor2 balance: ${ethers.utils.formatEther(investor2Balance)} CEL`);
  });

  describe("Deployment and Setup", function () {
    it("Should set the right token address", async function () {
      expect(await innovationUnits.celToken()).to.equal(celToken.address);
    });

    it("Should set the right owner", async function () {
      expect(await innovationUnits.owner()).to.equal(owner.address);
    });
  });

  describe("Project Management", function () {
    it("Should create a project with correct parameters", async function () {
      const projectConfig = await innovationUnits.getProjectConfig(PROJECT_ID);
      expect(projectConfig.isActive).to.equal(true);
      expect(projectConfig.creatorShare).to.equal(CREATOR_SHARE);
      expect(projectConfig.contributorReserve).to.equal(CONTRIBUTOR_SHARE);
      expect(projectConfig.investorReserve).to.equal(INVESTOR_SHARE);
      expect(projectConfig.totalSupply).to.equal(TOTAL_SUPPLY);
      expect(projectConfig.pricePerUnit).to.equal(PRICE_PER_UNIT);
    });

    it("Should not create a project with ID 0", async function () {
      await expect(
        innovationUnits.createProject(
          0, 
          TOTAL_SUPPLY,
          CREATOR_SHARE, 
          CONTRIBUTOR_SHARE, 
          INVESTOR_SHARE,
          PRICE_PER_UNIT
        )
      ).to.be.revertedWith("InnovationUnits: project ID must be greater than zero");
    });

    it("Should not create a duplicate project", async function () {
      await expect(
        innovationUnits.createProject(
          PROJECT_ID, 
          TOTAL_SUPPLY,
          CREATOR_SHARE, 
          CONTRIBUTOR_SHARE, 
          INVESTOR_SHARE,
          PRICE_PER_UNIT
        )
      ).to.be.revertedWith("InnovationUnits: project already exists");
    });

    it("Should not create a project with invalid share distribution", async function () {
      // Total not equal to 100%
      const invalidCreatorShare = ethers.utils.parseEther("10");
      const invalidContributorShare = ethers.utils.parseEther("20");
      const invalidInvestorShare = ethers.utils.parseEther("30");
      
      await expect(
        innovationUnits.createProject(
          2, 
          TOTAL_SUPPLY,
          invalidCreatorShare, 
          invalidContributorShare, 
          invalidInvestorShare,
          PRICE_PER_UNIT
        )
      ).to.be.revertedWith("InnovationUnits: shares must add up to 100%");
    });

    it("Should update price per unit", async function () {
      const newPrice = ethers.utils.parseEther("0.02");
      await innovationUnits.updatePricePerUnit(PROJECT_ID, newPrice);
      
      const projectConfig = await innovationUnits.getProjectConfig(PROJECT_ID);
      expect(projectConfig.pricePerUnit).to.equal(newPrice);
    });

    it("Should set project active/inactive status", async function () {
      // Set to inactive
      await innovationUnits.setProjectActive(PROJECT_ID, false);
      
      let projectConfig = await innovationUnits.getProjectConfig(PROJECT_ID);
      expect(projectConfig.isActive).to.equal(false);
      
      // Set back to active
      await innovationUnits.setProjectActive(PROJECT_ID, true);
      
      projectConfig = await innovationUnits.getProjectConfig(PROJECT_ID);
      expect(projectConfig.isActive).to.equal(true);
    });

    it("Should not update a non-existent project", async function () {
      const nonExistentProjectId = 999;
      await expect(
        innovationUnits.updatePricePerUnit(nonExistentProjectId, ethers.utils.parseEther("0.02"))
      ).to.be.revertedWith("InnovationUnits: project does not exist");
    });
  });

  describe("Creator Assignment", function () {
    it("Should allocate IUs to a creator", async function () {
      await innovationUnits.allocateToCreator(creator.address, PROJECT_ID);

      // Check creator allocation
      const creatorBalance = await innovationUnits.balanceOf(creator.address, PROJECT_ID);
      expect(creatorBalance).to.be.gt(0);
      
      // Verify the amount is according to creator share
      const projectConfig = await innovationUnits.getProjectConfig(PROJECT_ID);
      const expectedAmount = projectConfig.totalSupply.mul(projectConfig.creatorShare).div(ethers.utils.parseEther("100"));
      expect(creatorBalance).to.equal(expectedAmount);
    });

    it("Should not allocate to creator for a non-existent project", async function () {
      const nonExistentProjectId = 999;
      await expect(
        innovationUnits.allocateToCreator(creator.address, nonExistentProjectId)
      ).to.be.revertedWith("InnovationUnits: project does not exist");
    });

    it("Should not allocate to creator for an inactive project", async function () {
      // Deactivate the project
      await innovationUnits.setProjectActive(PROJECT_ID, false);

      await expect(
        innovationUnits.allocateToCreator(creator.address, PROJECT_ID)
      ).to.be.revertedWith("InnovationUnits: project is not active");
    });

    it("Should not allocate to creator more than once", async function () {
      await innovationUnits.allocateToCreator(creator.address, PROJECT_ID);

      await expect(
        innovationUnits.allocateToCreator(addrs[0].address, PROJECT_ID)
      ).to.be.revertedWith("InnovationUnits: creator allocation already done");
    });
  });

  describe("Contributor Assignment", function () {
    it("Should allocate IUs to a contributor", async function () {
      const contribution = ethers.utils.parseEther("100");
      await innovationUnits.allocateToContributor(contributor1.address, PROJECT_ID, contribution);

      // Check contributor allocation
      const contributorBalance = await innovationUnits.balanceOf(contributor1.address, PROJECT_ID);
      expect(contributorBalance).to.equal(contribution);
    });

    it("Should allow multiple contributors to the same project", async function () {
      const contribution1 = ethers.utils.parseEther("100");
      const contribution2 = ethers.utils.parseEther("200");
      
      await innovationUnits.allocateToContributor(contributor1.address, PROJECT_ID, contribution1);
      await innovationUnits.allocateToContributor(contributor2.address, PROJECT_ID, contribution2);

      // Check allocations
      const balance1 = await innovationUnits.balanceOf(contributor1.address, PROJECT_ID);
      const balance2 = await innovationUnits.balanceOf(contributor2.address, PROJECT_ID);
      
      expect(balance1).to.equal(contribution1);
      expect(balance2).to.equal(contribution2);
    });

    it("Should allow additional contributions to the same contributor", async function () {
      const contribution1 = ethers.utils.parseEther("100");
      const contribution2 = ethers.utils.parseEther("50");
      
      await innovationUnits.allocateToContributor(contributor1.address, PROJECT_ID, contribution1);
      await innovationUnits.allocateToContributor(contributor1.address, PROJECT_ID, contribution2);

      // Check total allocation
      const balance = await innovationUnits.balanceOf(contributor1.address, PROJECT_ID);
      expect(balance).to.equal(contribution1.add(contribution2));
    });

    it("Should not allocate to contributor for a non-existent project", async function () {
      const nonExistentProjectId = 999;
      await expect(
        innovationUnits.allocateToContributor(
          contributor1.address, 
          nonExistentProjectId, 
          ethers.utils.parseEther("100")
        )
      ).to.be.revertedWith("InnovationUnits: project does not exist");
    });

    it("Should not allocate to contributor for an inactive project", async function () {
      // Deactivate the project
      await innovationUnits.setProjectActive(PROJECT_ID, false);

      await expect(
        innovationUnits.allocateToContributor(
          contributor1.address, 
          PROJECT_ID, 
          ethers.utils.parseEther("100")
        )
      ).to.be.revertedWith("InnovationUnits: project is not active");
    });
  });

  describe("Innovation Units Purchase", function () {
    beforeEach(async function () {
      // Calculate the price per IU
      const projectConfig = await innovationUnits.getProjectConfig(PROJECT_ID);
      const pricePerUnit = projectConfig.pricePerUnit;
      
      // Calculate the CEL needed for purchase (amount * price)
      const amount1 = ethers.utils.parseEther("1000");
      const amount2 = ethers.utils.parseEther("500");
      const celNeeded1 = amount1.mul(pricePerUnit);
      const celNeeded2 = amount2.mul(pricePerUnit);
      
      // Approve sufficient tokens for each investor
      await celToken.connect(investor1).approve(innovationUnits.address, celNeeded1.mul(2)); // Double for multiple tests
      await celToken.connect(investor2).approve(innovationUnits.address, celNeeded2.mul(2));
    });
    
    it("Should allow purchasing innovation units", async function () {
      const amount = ethers.utils.parseEther("1000");
      await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, amount);
      
      // Check IU balance
      const balance = await innovationUnits.balanceOf(investor1.address, PROJECT_ID);
      expect(balance).to.equal(amount);
      
      // Check CEL token transfer
      const projectConfig = await innovationUnits.getProjectConfig(PROJECT_ID);
      const celCost = amount.mul(projectConfig.pricePerUnit);
      const contractBalance = await celToken.balanceOf(innovationUnits.address);
      expect(contractBalance).to.equal(celCost);
    });
    
    it("Should allow multiple investors to purchase units", async function () {
      const amount1 = ethers.utils.parseEther("1000");
      const amount2 = ethers.utils.parseEther("500");
      
      await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, amount1);
      await innovationUnits.connect(investor2).purchaseIUs(PROJECT_ID, amount2);
      
      // Check IU balances
      const balance1 = await innovationUnits.balanceOf(investor1.address, PROJECT_ID);
      const balance2 = await innovationUnits.balanceOf(investor2.address, PROJECT_ID);
      
      expect(balance1).to.equal(amount1);
      expect(balance2).to.equal(amount2);
    });
    
    it("Should allow additional purchases", async function () {
      const amount1 = ethers.utils.parseEther("500");
      const amount2 = ethers.utils.parseEther("500");
      
      await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, amount1);
      await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, amount2);
      
      // Check IU balance
      const balance = await innovationUnits.balanceOf(investor1.address, PROJECT_ID);
      expect(balance).to.equal(amount1.add(amount2));
    });
    
    it("Should not allow purchase for a non-existent project", async function () {
      const nonExistentProjectId = 999;
      const amount = ethers.utils.parseEther("1000");
      
      await expect(
        innovationUnits.connect(investor1).purchaseIUs(nonExistentProjectId, amount)
      ).to.be.revertedWith("InnovationUnits: project does not exist");
    });
    
    it("Should not allow purchase for an inactive project", async function () {
      // Deactivate the project
      await innovationUnits.setProjectActive(PROJECT_ID, false);
      
      const amount = ethers.utils.parseEther("1000");
      await expect(
        innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, amount)
      ).to.be.revertedWith("InnovationUnits: project is not active");
    });
    
    it("Should not allow purchase with zero amount", async function () {
      await expect(
        innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, 0)
      ).to.be.revertedWith("InnovationUnits: purchase amount must be greater than zero");
    });
    
    it("Should not allow purchase without sufficient approval", async function () {
      // Reset approval
      await celToken.connect(investor1).approve(innovationUnits.address, 0);
      
      const amount = ethers.utils.parseEther("1000");
      await expect(
        innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, amount)
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });
  });

  describe("Role and Units Queries", function () {
    beforeEach(async function () {
      // Allocate to creator and contributors
      await innovationUnits.allocateToCreator(creator.address, PROJECT_ID);
      await innovationUnits.allocateToContributor(contributor1.address, PROJECT_ID, ethers.utils.parseEther("100"));
      
      // Make investor purchase - with proper approval
      const projectConfig = await innovationUnits.getProjectConfig(PROJECT_ID);
      const pricePerUnit = projectConfig.pricePerUnit;
      const amount = ethers.utils.parseEther("500");
      const celNeeded = amount.mul(pricePerUnit);
      
      // Verify investor has sufficient balance first
      const investorBalance = await celToken.balanceOf(investor1.address);
      console.log(`Investor1 balance before approval: ${ethers.utils.formatEther(investorBalance)} CEL`);
      console.log(`Required CEL: ${ethers.utils.formatEther(celNeeded)} CEL`);
      
      // Ensure the investor has enough CEL tokens
      if (investorBalance.lt(celNeeded)) {
        await celToken.transfer(investor1.address, celNeeded.mul(2)); // Transfer double what's needed
        console.log(`Transferred additional CEL to investor1`);
      }
      
      await celToken.connect(investor1).approve(innovationUnits.address, celNeeded);
      await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, amount);
    });
    
    it("Should get correct IU balances", async function () {
      const creatorBalance = await innovationUnits.balanceOf(creator.address, PROJECT_ID);
      const contributorBalance = await innovationUnits.balanceOf(contributor1.address, PROJECT_ID);
      const investorBalance = await innovationUnits.balanceOf(investor1.address, PROJECT_ID);
      const nonParticipantBalance = await innovationUnits.balanceOf(nonParticipant.address, PROJECT_ID);
      
      expect(creatorBalance).to.be.gt(0);
      expect(contributorBalance).to.equal(ethers.utils.parseEther("100"));
      expect(investorBalance).to.equal(ethers.utils.parseEther("500"));
      expect(nonParticipantBalance).to.equal(0);
    });
    
    it("Should calculate ownership shares correctly", async function () {
      const creatorShare = await innovationUnits.getOwnershipShare(creator.address, PROJECT_ID);
      const contributorShare = await innovationUnits.getOwnershipShare(contributor1.address, PROJECT_ID);
      const investorShare = await innovationUnits.getOwnershipShare(investor1.address, PROJECT_ID);
      const nonParticipantShare = await innovationUnits.getOwnershipShare(nonParticipant.address, PROJECT_ID);
      
      // Calculate expected shares based on balances
      const totalMinted = await innovationUnits.getTotalMinted(PROJECT_ID);
      const creatorBalance = await innovationUnits.balanceOf(creator.address, PROJECT_ID);
      const contributorBalance = await innovationUnits.balanceOf(contributor1.address, PROJECT_ID);
      const investorBalance = await innovationUnits.balanceOf(investor1.address, PROJECT_ID);
      
      const precision = ethers.utils.parseEther("1");
      const expectedCreatorShare = creatorBalance.mul(precision).div(totalMinted);
      const expectedContributorShare = contributorBalance.mul(precision).div(totalMinted);
      const expectedInvestorShare = investorBalance.mul(precision).div(totalMinted);
      
      expect(creatorShare).to.equal(expectedCreatorShare);
      expect(contributorShare).to.equal(expectedContributorShare);
      expect(investorShare).to.equal(expectedInvestorShare);
      expect(nonParticipantShare).to.equal(0);
    });
    
    it("Should get available IUs correctly", async function () {
      const availableContributorIUs = await innovationUnits.getAvailableContributorIUs(PROJECT_ID);
      const availableInvestorIUs = await innovationUnits.getAvailableInvestorIUs(PROJECT_ID);
      
      // Calculate expected available IUs
      const projectConfig = await innovationUnits.getProjectConfig(PROJECT_ID);
      const contributorReserve = projectConfig.totalSupply.mul(projectConfig.contributorReserve).div(ethers.utils.parseEther("100"));
      const investorReserve = projectConfig.totalSupply.mul(projectConfig.investorReserve).div(ethers.utils.parseEther("100"));
      
      const expectedAvailableContributorIUs = contributorReserve.sub(ethers.utils.parseEther("100"));
      const expectedAvailableInvestorIUs = investorReserve.sub(ethers.utils.parseEther("500"));
      
      expect(availableContributorIUs).to.equal(expectedAvailableContributorIUs);
      expect(availableInvestorIUs).to.equal(expectedAvailableInvestorIUs);
    });
    
    it("Should get project holders", async function () {
      const holders = await innovationUnits.getHolders(PROJECT_ID);
      
      expect(holders).to.include(creator.address);
      expect(holders).to.include(contributor1.address);
      expect(holders).to.include(investor1.address);
      expect(holders).to.not.include(nonParticipant.address);
    });
  });
  
  describe("IU Transfers", function () {
    beforeEach(async function () {
      // Allocate to creator and contributors
      await innovationUnits.allocateToCreator(creator.address, PROJECT_ID);
      await innovationUnits.allocateToContributor(contributor1.address, PROJECT_ID, ethers.utils.parseEther("100"));
    });
    
    it("Should allow transferring IUs", async function () {
      const transferAmount = ethers.utils.parseEther("50");
      
      // Get initial balances
      const initialSenderBalance = await innovationUnits.balanceOf(contributor1.address, PROJECT_ID);
      const initialReceiverBalance = await innovationUnits.balanceOf(nonParticipant.address, PROJECT_ID);
      
      // Transfer IUs
      await innovationUnits.transferIUs(
        contributor1.address,
        nonParticipant.address, 
        PROJECT_ID, 
        transferAmount
      );
      
      // Check balances after transfer
      const finalSenderBalance = await innovationUnits.balanceOf(contributor1.address, PROJECT_ID);
      const finalReceiverBalance = await innovationUnits.balanceOf(nonParticipant.address, PROJECT_ID);
      
      expect(finalSenderBalance).to.equal(initialSenderBalance.sub(transferAmount));
      expect(finalReceiverBalance).to.equal(initialReceiverBalance.add(transferAmount));
    });
    
    it("Should not allow transferring more IUs than balance", async function () {
      const balance = await innovationUnits.balanceOf(contributor1.address, PROJECT_ID);
      const excessiveAmount = balance.add(1);
      
      await expect(
        innovationUnits.transferIUs(
          contributor1.address,
          nonParticipant.address, 
          PROJECT_ID, 
          excessiveAmount
        )
      ).to.be.revertedWith("InnovationUnits: transfer amount exceeds balance");
    });
    
    it("Should not allow transferring to zero address", async function () {
      const transferAmount = ethers.utils.parseEther("50");
      
      await expect(
        innovationUnits.transferIUs(
          contributor1.address,
          ethers.constants.AddressZero, 
          PROJECT_ID, 
          transferAmount
        )
      ).to.be.revertedWith("InnovationUnits: transfer to the zero address");
    });
  });

  describe("Administrative Functions", function () {
    describe("Transfer Functions", function () {
      let transferAmount;
      
      beforeEach(async function () {
        // Setup for transfer tests
        const projectConfig = await innovationUnits.getProjectConfig(PROJECT_ID);
        const pricePerUnit = projectConfig.pricePerUnit;
        
        // Investor 1 purchase
        const amount1 = ethers.utils.parseEther("1000");
        const celNeeded1 = amount1.mul(pricePerUnit);
        
        // Ensure investor1 has enough tokens
        const investor1Balance = await celToken.balanceOf(investor1.address);
        if (investor1Balance.lt(celNeeded1)) {
          await celToken.transfer(investor1.address, celNeeded1.mul(2));
          console.log(`Transferred additional CEL to investor1 for transfers test`);
        }
        
        await celToken.connect(investor1).approve(innovationUnits.address, celNeeded1);
        await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, amount1);
        
        // Investor 2 purchase
        const amount2 = ethers.utils.parseEther("500");
        const celNeeded2 = amount2.mul(pricePerUnit);
        
        // Ensure investor2 has enough tokens
        const investor2Balance = await celToken.balanceOf(investor2.address);
        if (investor2Balance.lt(celNeeded2)) {
          await celToken.transfer(investor2.address, celNeeded2.mul(2));
          console.log(`Transferred additional CEL to investor2 for transfers test`);
        }
        
        await celToken.connect(investor2).approve(innovationUnits.address, celNeeded2);
        await innovationUnits.connect(investor2).purchaseIUs(PROJECT_ID, amount2);
        
        // Amount to transfer in tests
        transferAmount = ethers.utils.parseEther("300");
      });

      it("Should allow transferring IUs to another address", async function () {
        const initialBalance1 = await innovationUnits.balanceOf(investor1.address, PROJECT_ID);
        const initialBalance2 = await innovationUnits.balanceOf(investor2.address, PROJECT_ID);

        await innovationUnits.connect(investor1).transferIUs(PROJECT_ID, investor2.address, transferAmount);

        const finalBalance1 = await innovationUnits.balanceOf(investor1.address, PROJECT_ID);
        const finalBalance2 = await innovationUnits.balanceOf(investor2.address, PROJECT_ID);

        expect(finalBalance1).to.equal(initialBalance1.sub(transferAmount));
        expect(finalBalance2).to.equal(initialBalance2.add(transferAmount));
      });

      it("Should not allow transferring more IUs than balance", async function () {
        const excessiveAmount = ethers.utils.parseEther("2000"); // More than investor1 has

        await expect(
          innovationUnits.connect(investor1).transferIUs(PROJECT_ID, investor2.address, excessiveAmount)
        ).to.be.revertedWith("InnovationUnits: transfer amount exceeds balance");
      });

      it("Should emit Transfer event when transferring IUs", async function () {
        await expect(innovationUnits.connect(investor1).transferIUs(PROJECT_ID, investor2.address, transferAmount))
          .to.emit(innovationUnits, "Transfer")
          .withArgs(investor1.address, investor2.address, PROJECT_ID, transferAmount);
      });
    });
  });
}); 