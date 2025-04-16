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
  const TOTAL_SUPPLY = 100000; // 100k IU tokens
  const HUNDRED_PERCENT = ethers.utils.parseEther("100"); // 100% scaled by PRECISION (1e18)
  const CREATOR_SHARE = ethers.utils.parseEther("20");  // 20% scaled by PRECISION
  const CONTRIBUTOR_SHARE = ethers.utils.parseEther("30");  // 30% scaled by PRECISION
  const INVESTOR_SHARE = ethers.utils.parseEther("50");  // 50% scaled by PRECISION
  const PRICE_PER_UNIT = ethers.utils.parseEther("0.01"); // 0.01 CEL per IU
  const PURCHASE_AMOUNT = 1000; // 1000 IUs
  const CONTRIBUTION_VALUE = 100; // 100 IUs

  beforeEach(async function () {
    // Get the ContractFactory and Signers here
    CELToken = await ethers.getContractFactory("CELToken");
    InnovationUnits = await ethers.getContractFactory("InnovationUnits");
    [owner, creator, contributor1, contributor2, investor1, investor2, nonParticipant, ...addrs] = await ethers.getSigners();

    // Deploy CEL Token
    celToken = await CELToken.deploy(
        "Celystik Hub Token",
        "CEL",
        ethers.utils.parseEther("1000000"), // Initial supply: 1 million tokens
        ethers.utils.parseEther("10000000") // Cap: 10 million tokens
    );
    await celToken.deployed();

    // Deploy InnovationUnits
    innovationUnits = await InnovationUnits.deploy(celToken.address);
    await innovationUnits.deployed();

    // Set up initial token balances and approvals
    const INITIAL_BALANCE = ethers.utils.parseEther("10000");
    await celToken.transfer(investor1.address, INITIAL_BALANCE);
    await celToken.transfer(investor2.address, INITIAL_BALANCE);
    await celToken.transfer(contributor1.address, INITIAL_BALANCE);
    await celToken.transfer(contributor2.address, INITIAL_BALANCE);
    
    // Approve InnovationUnits contract to spend tokens
    await celToken.connect(investor1).approve(innovationUnits.address, INITIAL_BALANCE);
    await celToken.connect(investor2).approve(innovationUnits.address, INITIAL_BALANCE);
    await celToken.connect(contributor1).approve(innovationUnits.address, INITIAL_BALANCE);
    await celToken.connect(contributor2).approve(innovationUnits.address, INITIAL_BALANCE);

    // Create a project for testing - match the exact signature in the contract
    await innovationUnits.createProject(
        PROJECT_ID,        // projectId
        TOTAL_SUPPLY,      // totalSupply
        CREATOR_SHARE,     // creatorShare
        CONTRIBUTOR_SHARE, // contributorReserve
        INVESTOR_SHARE,    // investorReserve
        PRICE_PER_UNIT     // pricePerUnit
    );
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
    const purchaseAmount = ethers.utils.parseEther("1000");

    it("Should allow purchasing innovation units", async function () {
      await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, purchaseAmount);
      
      const balance = await innovationUnits.getInnovationUnits(investor1.address, PROJECT_ID);
      expect(balance).to.equal(purchaseAmount);
    });

    it("Should allow multiple investors to purchase units", async function () {
      await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, purchaseAmount);
      await innovationUnits.connect(investor2).purchaseIUs(PROJECT_ID, purchaseAmount);
      
      const balance1 = await innovationUnits.getInnovationUnits(investor1.address, PROJECT_ID);
      const balance2 = await innovationUnits.getInnovationUnits(investor2.address, PROJECT_ID);
      
      expect(balance1).to.equal(purchaseAmount);
      expect(balance2).to.equal(purchaseAmount);
    });

    it("Should allow additional purchases", async function () {
      await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, purchaseAmount.div(2));
      await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, purchaseAmount.div(2));
      
      const balance = await innovationUnits.getInnovationUnits(investor1.address, PROJECT_ID);
      expect(balance).to.equal(purchaseAmount);
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
    const purchaseAmount = ethers.utils.parseEther("1000");

    beforeEach(async function () {
      await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, purchaseAmount);
    });

    it("Should get correct IU balances", async function () {
      const balance = await innovationUnits.getInnovationUnits(investor1.address, PROJECT_ID);
      expect(balance).to.equal(purchaseAmount);
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
      const purchaseAmount = ethers.utils.parseEther("1000");
      const transferAmount = ethers.utils.parseEther("500");

      beforeEach(async function () {
        await innovationUnits.connect(investor1).purchaseIUs(PROJECT_ID, purchaseAmount);
      });

      it("Should allow transferring IUs to another address", async function () {
        await innovationUnits.connect(investor1).transferIUs(PROJECT_ID, investor2.address, transferAmount);
        
        const balance1 = await innovationUnits.getInnovationUnits(investor1.address, PROJECT_ID);
        const balance2 = await innovationUnits.getInnovationUnits(investor2.address, PROJECT_ID);
        
        expect(balance1).to.equal(purchaseAmount.sub(transferAmount));
        expect(balance2).to.equal(transferAmount);
      });

      it("Should not allow transferring more IUs than owned", async function () {
        const tooMuch = purchaseAmount.mul(2);
        await expect(
          innovationUnits.connect(investor1).transferIUs(PROJECT_ID, investor2.address, tooMuch)
        ).to.be.revertedWith("InnovationUnits: insufficient balance");
      });
    });
  });
}); 