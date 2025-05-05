const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InnovationUnits", function () {
  let CELToken;
  let InnovationUnits;
  let ProtocolTreasury;
  let celToken;
  let innovationUnits;
  let protocolTreasury;
  let owner;
  let creator1;
  let creator2;
  let contributor;
  let investor1;
  let investor2;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers
    CELToken = await ethers.getContractFactory("CELToken");
    InnovationUnits = await ethers.getContractFactory("InnovationUnits");
    ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
    [owner, creator1, creator2, contributor, investor1, investor2, ...addrs] = await ethers.getSigners();

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

    // Transfer some CEL tokens to test accounts
    await celToken.transfer(creator1.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(creator2.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(contributor.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(investor1.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(investor2.address, ethers.utils.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await innovationUnits.owner()).to.equal(owner.address);
    });

    it("Should set the correct CEL token address", async function () {
      expect(await innovationUnits.celToken()).to.equal(celToken.address);
    });

    it("Should set the correct protocol treasury address", async function () {
      expect(await innovationUnits.protocolTreasuryAddress()).to.equal(protocolTreasury.address);
    });

    it("Should initialize with zero projects", async function () {
      expect(await innovationUnits.getTotalProjects()).to.equal(0);
    });

    it("Should be ready for direct use", async function () {
      const [isReady, missingComponent] = await innovationUnits.isReadyForDirectUse();
      expect(isReady).to.be.true;
      expect(missingComponent).to.equal("");
    });
  });

  describe("Project Creation", function () {
    it("Should create a project with correct allocations", async function () {
      const totalSupply = ethers.utils.parseEther("1000000"); // 1M total supply
      const initialPrice = ethers.utils.parseEther("0.01"); // 0.01 CEL initial price
      const creators = [creator1.address, creator2.address];
      const creatorShares = [7000, 3000]; // 70% to creator1, 30% to creator2
      const creatorAllocation = 5000; // 50% to creators
      const contributorAllocation = 3000; // 30% to contributors
      const investorAllocation = 2000; // 20% to investors

      const tx = await innovationUnits.createProject(
        totalSupply,
        initialPrice,
        creators,
        creatorShares,
        creatorAllocation,
        contributorAllocation,
        investorAllocation
      );

      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === 'ProjectRegistered');
      expect(event).to.not.be.undefined;
      const projectId = event.args.projectId;

      // Verify project data
      const projectData = await innovationUnits.getProjectData(projectId);
      expect(projectData.totalSupply).to.equal(totalSupply);
      expect(projectData.initialPrice).to.equal(initialPrice);
      expect(projectData.creatorsAllocatedPercentage).to.equal(creatorAllocation);
      expect(projectData.contributorsReservePercentage).to.equal(contributorAllocation);
      expect(projectData.investorsReservePercentage).to.equal(investorAllocation);
      expect(projectData.treasuryBalance).to.equal(0);

      // Verify creator allocations
      const creator1Units = await innovationUnits.balanceOf(creator1.address, projectId);
      const creator2Units = await innovationUnits.balanceOf(creator2.address, projectId);
      const totalCreatorUnits = creator1Units.add(creator2Units);

      const expectedCreatorAllocation = totalSupply.mul(creatorAllocation).div(10000);
      expect(totalCreatorUnits).to.equal(expectedCreatorAllocation);
      expect(creator1Units).to.equal(expectedCreatorAllocation.mul(7000).div(10000));
      expect(creator2Units).to.equal(expectedCreatorAllocation.mul(3000).div(10000));
    });

    it("Should not allow creating a project with invalid allocations", async function () {
      const totalSupply = ethers.utils.parseEther("1000000");
      const initialPrice = ethers.utils.parseEther("0.01");
      const creators = [creator1.address];
      const creatorShares = [10000];
      
      // Total allocation exceeds 100%
      await expect(
        innovationUnits.createProject(
          totalSupply,
          initialPrice,
          creators,
          creatorShares,
          5000, // 50%
          3000, // 30%
          3000  // 30% (total 110%)
        )
      ).to.be.revertedWith("Total allocation must equal 100%");
    });

    it("Should not allow creating a project with mismatched creator arrays", async function () {
      const totalSupply = ethers.utils.parseEther("1000000");
      const initialPrice = ethers.utils.parseEther("0.01");
      const creators = [creator1.address, creator2.address];
      const creatorShares = [10000]; // Only one share for two creators

      await expect(
        innovationUnits.createProject(
          totalSupply,
          initialPrice,
          creators,
          creatorShares,
          5000,
          3000,
          2000
        )
      ).to.be.revertedWith("Creator arrays length mismatch");
    });

    it("Should not allow creating a project with no creators", async function () {
      const totalSupply = ethers.utils.parseEther("1000000");
      const initialPrice = ethers.utils.parseEther("0.01");
      const creators = [];
      const creatorShares = [];

      await expect(
        innovationUnits.createProject(
          totalSupply,
          initialPrice,
          creators,
          creatorShares,
          5000,
          3000,
          2000
        )
      ).to.be.revertedWith("At least one creator required");
    });
  });

  describe("Contributor Management", function () {
    let projectId;

    beforeEach(async function () {
      // Create a test project
      const tx = await innovationUnits.createProject(
        ethers.utils.parseEther("1000000"),
        ethers.utils.parseEther("0.01"),
        [creator1.address],
        [10000],
        5000, // 50% to creators
        3000, // 30% to contributors
        2000  // 20% to investors
      );
      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === 'ProjectRegistered');
      projectId = event.args.projectId;
    });

    it("Should allow project creator to mint to contributors", async function () {
      const contributorUnits = ethers.utils.parseEther("50000");
      await innovationUnits.connect(creator1).mintToContributor(
        projectId,
        contributor.address,
        contributorUnits
      );

      const balance = await innovationUnits.balanceOf(contributor.address, projectId);
      expect(balance).to.equal(contributorUnits);

      // Verify contributor info
      const contributorInfo = await innovationUnits.getContributorInfo(projectId, contributor.address);
      expect(contributorInfo).to.equal(contributorUnits);
    });

    it("Should not allow minting more than contributor allocation", async function () {
      const totalSupply = ethers.utils.parseEther("1000000");
      const contributorAllocation = totalSupply.mul(3000).div(10000); // 30%
      const excessAmount = contributorAllocation.add(1);

      await expect(
        innovationUnits.connect(creator1).mintToContributor(
          projectId,
          contributor.address,
          excessAmount
        )
      ).to.be.revertedWith("Exceeds contributors allocation");
    });

    it("Should not allow non-creators to mint to contributors", async function () {
      const contributorUnits = ethers.utils.parseEther("50000");
      await expect(
        innovationUnits.connect(investor1).mintToContributor(
          projectId,
          contributor.address,
          contributorUnits
        )
      ).to.be.revertedWith("Not a project creator");
    });

    it("Should track contributor information correctly", async function () {
      const contributorUnits = ethers.utils.parseEther("50000");
      await innovationUnits.connect(creator1).mintToContributor(
        projectId,
        contributor.address,
        contributorUnits
      );

      const [contributors, amounts] = await innovationUnits.getContributorsInfo(projectId);
      expect(contributors).to.include(contributor.address);
      expect(amounts[0]).to.equal(contributorUnits);
    });
  });

  describe("Investor Management", function () {
    let projectId;

    beforeEach(async function () {
      // Create a test project
      const tx = await innovationUnits.createProject(
        ethers.utils.parseEther("1000000"),
        ethers.utils.parseEther("0.01"),
        [creator1.address],
        [10000],
        5000, // 50% to creators
        3000, // 30% to contributors
        2000  // 20% to investors
      );
      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === 'ProjectRegistered');
      projectId = event.args.projectId;

      // Calculate total cost with fees for 100 IUs
      const iuAmount = 100; // Just 100 IUs, not in wei
      const basePayment = ethers.utils.parseEther("0.01").mul(iuAmount); // initialPrice * amount
      const buyFeePercentage = await innovationUnits.buyFeePercentage();
      const fee = basePayment.mul(buyFeePercentage).div(10000);
      const totalCost = basePayment.add(fee);

      // Approve CEL tokens for investors with sufficient amount including fees
      await celToken.connect(investor1).approve(innovationUnits.address, totalCost);
      await celToken.connect(investor2).approve(innovationUnits.address, totalCost);
    });

    it("Should allow investors to buy IUs", async function () {
      const iuAmount = 100; // Just 100 IUs, not in wei
      
      // Get total cost using the contract's calculation function
      const [basePayment, fee, totalCost] = await innovationUnits.calculateBuyingCost(projectId, iuAmount);
      
      // Approve CEL tokens
      await celToken.connect(investor1).approve(innovationUnits.address, totalCost);
      
      // Buy IUs
      await innovationUnits.connect(investor1).buyIUs(projectId, iuAmount);

      // Verify IU balance
      const balance = await innovationUnits.balanceOf(investor1.address, projectId);
      expect(balance).to.equal(iuAmount);

      // Verify investor info
      const investorInfo = await innovationUnits.getInvestorInfo(projectId, investor1.address);
      expect(investorInfo).to.equal(iuAmount);

      // Verify treasury received payment
      const treasuryBalance = await innovationUnits.projectTreasuryBalances(projectId);
      expect(treasuryBalance).to.equal(basePayment);
    });

    it("Should not allow buying more than investor allocation", async function () {
      const totalSupply = ethers.utils.parseEther("1000000");
      const investorAllocation = totalSupply.mul(2000).div(10000); // 20%
      const excessAmount = investorAllocation.add(1);

      await expect(
        innovationUnits.connect(investor1).buyIUs(projectId, excessAmount)
      ).to.be.revertedWith("Exceeds investors allocation");
    });

    it("Should handle buy fees correctly", async function () {
      const iuAmount = 100; // Just 100 IUs, not in wei
      const initialTreasuryBalance = await celToken.balanceOf(protocolTreasury.address);

      // Get total cost using the contract's calculation function
      const [basePayment, fee, totalCost] = await innovationUnits.calculateBuyingCost(projectId, iuAmount);
      
      // Approve and buy
      await celToken.connect(investor1).approve(innovationUnits.address, totalCost);
      await innovationUnits.connect(investor1).buyIUs(projectId, iuAmount);

      const finalTreasuryBalance = await celToken.balanceOf(protocolTreasury.address);
      expect(finalTreasuryBalance.sub(initialTreasuryBalance)).to.equal(fee);
    });

    it("Should track investor information correctly", async function () {
      const iuAmount = 100; // Just 100 IUs, not in wei
      await innovationUnits.connect(investor1).buyIUs(projectId, iuAmount);

      const [investors, amounts] = await innovationUnits.getInvestorsInfo(projectId);
      expect(investors).to.include(investor1.address);
      expect(amounts[0]).to.equal(iuAmount);
    });
  });

  describe("Selling and Liquidity", function () {
    let projectId;

    beforeEach(async function () {
      // Create a test project
      const tx = await innovationUnits.createProject(
        ethers.utils.parseEther("1000000"),
        ethers.utils.parseEther("0.01"),
        [creator1.address],
        [10000],
        5000, // 50% to creators
        3000, // 30% to contributors
        2000  // 20% to investors
      );
      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === 'ProjectRegistered');
      projectId = event.args.projectId;

      // Calculate total cost with fees for 100 IUs
      const iuAmount = 100; // Just 100 IUs, not in wei
      const basePayment = ethers.utils.parseEther("0.01").mul(iuAmount); // initialPrice * amount
      const buyFeePercentage = await innovationUnits.buyFeePercentage();
      const fee = basePayment.mul(buyFeePercentage).div(10000);
      const totalCost = basePayment.add(fee);

      // Buy some IUs
      await celToken.connect(investor1).approve(innovationUnits.address, totalCost);
      await innovationUnits.connect(investor1).buyIUs(projectId, iuAmount);

      // Add liquidity to allow selling
      await celToken.approve(innovationUnits.address, ethers.utils.parseEther("1000"));
      await innovationUnits.addLiquidity(projectId, ethers.utils.parseEther("1000"));
    });

    it("Should allow investors to sell IUs", async function () {
      const sellAmount = 50; // Just 50 IUs, not in wei
      const initialBalance = await celToken.balanceOf(investor1.address);

      // Get return amounts using the contract's calculation function
      const [baseReturn, fee, netReturn] = await innovationUnits.calculateSellingReturn(projectId, sellAmount);

      await innovationUnits.connect(investor1).sellIUs(projectId, sellAmount);

      const finalBalance = await celToken.balanceOf(investor1.address);
      expect(finalBalance.sub(initialBalance)).to.equal(netReturn);

      // Verify IU balance decreased
      const iuBalance = await innovationUnits.balanceOf(investor1.address, projectId);
      expect(iuBalance).to.equal(50); // 100 - 50
    });

    it("Should handle sell fees correctly", async function () {
      const sellAmount = 50; // Just 50 IUs, not in wei
      const initialTreasuryBalance = await celToken.balanceOf(protocolTreasury.address);

      // Get return amounts using the contract's calculation function
      const [baseReturn, fee, netReturn] = await innovationUnits.calculateSellingReturn(projectId, sellAmount);

      await innovationUnits.connect(investor1).sellIUs(projectId, sellAmount);

      const finalTreasuryBalance = await celToken.balanceOf(protocolTreasury.address);
      expect(finalTreasuryBalance.sub(initialTreasuryBalance)).to.equal(fee);
    });

    it("Should allow adding liquidity", async function () {
      const liquidityAmount = ethers.utils.parseEther("1000");
      const initialBalance = await innovationUnits.projectTreasuryBalances(projectId);
      await celToken.approve(innovationUnits.address, liquidityAmount);
      await innovationUnits.addLiquidity(projectId, liquidityAmount);

      const finalBalance = await innovationUnits.projectTreasuryBalances(projectId);
      expect(finalBalance.sub(initialBalance)).to.equal(liquidityAmount);
    });

    it("Should allow owner to remove liquidity", async function () {
      // First add liquidity
      const liquidityAmount = ethers.utils.parseEther("1000");
      await celToken.approve(innovationUnits.address, liquidityAmount);
      await innovationUnits.addLiquidity(projectId, liquidityAmount);

      // Remove half the liquidity
      const removeAmount = ethers.utils.parseEther("500");
      const initialBalance = await celToken.balanceOf(owner.address);
      const initialTreasuryBalance = await innovationUnits.projectTreasuryBalances(projectId);

      await innovationUnits.removeLiquidity(projectId, removeAmount, owner.address);

      const finalBalance = await celToken.balanceOf(owner.address);
      const finalTreasuryBalance = await innovationUnits.projectTreasuryBalances(projectId);
      expect(finalBalance.sub(initialBalance)).to.equal(removeAmount);
      expect(initialTreasuryBalance.sub(finalTreasuryBalance)).to.equal(removeAmount);
    });

    it("Should calculate selling return correctly", async function () {
      const sellAmount = 100; // 100 IUs
      const expectedBaseReturn = ethers.utils.parseEther("0.01").mul(sellAmount);
      const sellFeePercentage = await innovationUnits.sellFeePercentage();
      const expectedFee = expectedBaseReturn.mul(sellFeePercentage).div(10000);
      const expectedNetReturn = expectedBaseReturn.sub(expectedFee);

      const [baseReturn, fee, netReturn] = await innovationUnits.calculateSellingReturn(projectId, sellAmount);

      expect(baseReturn).to.equal(expectedBaseReturn);
      expect(fee).to.equal(expectedFee);
      expect(netReturn).to.equal(expectedNetReturn);
    });

    it("Should not calculate selling return for non-existent project", async function () {
      const nonExistentProjectId = 999;
      const sellAmount = 100;

      await expect(
        innovationUnits.calculateSellingReturn(nonExistentProjectId, sellAmount)
      ).to.be.revertedWith("Project does not exist");
    });

    it("Should not calculate selling return for zero amount", async function () {
      await expect(
        innovationUnits.calculateSellingReturn(projectId, 0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });
  });

  describe("Fee Management", function () {
    it("Should allow owner to update buy fee percentage", async function () {
      const newBuyFee = 1000; // 10%
      await innovationUnits.updateBuyFeePercentage(newBuyFee);
      expect(await innovationUnits.buyFeePercentage()).to.equal(newBuyFee);
    });

    it("Should allow owner to update sell fee percentage", async function () {
      const newSellFee = 1500; // 15%
      await innovationUnits.updateSellFeePercentage(newSellFee);
      expect(await innovationUnits.sellFeePercentage()).to.equal(newSellFee);
    });

    it("Should not allow setting fees above maximum", async function () {
      const tooHighFee = 3100; // 31%
      await expect(
        innovationUnits.updateBuyFeePercentage(tooHighFee)
      ).to.be.revertedWith("Fee too high: max 30%");

      await expect(
        innovationUnits.updateSellFeePercentage(tooHighFee)
      ).to.be.revertedWith("Fee too high: max 30%");
    });

    it("Should not allow non-owners to update fees", async function () {
      const newFee = 1000;
      await expect(
        innovationUnits.connect(investor1).updateBuyFeePercentage(newFee)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        innovationUnits.connect(investor1).updateSellFeePercentage(newFee)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to rescue CEL tokens", async function () {
      // Send some CEL tokens directly to the contract
      const amount = ethers.utils.parseEther("100");
      await celToken.transfer(innovationUnits.address, amount);

      const initialBalance = await celToken.balanceOf(owner.address);
      await innovationUnits.rescueCEL(amount, owner.address);
      
      const finalBalance = await celToken.balanceOf(owner.address);
      expect(finalBalance.sub(initialBalance)).to.equal(amount);
    });

    it("Should not allow rescuing treasury CEL tokens", async function () {
      // Create a project and buy IUs to get CEL tokens in treasury
      const tx = await innovationUnits.createProject(
        ethers.utils.parseEther("1000000"),
        ethers.utils.parseEther("0.01"),
        [creator1.address],
        [10000],
        5000,
        3000,
        2000
      );
      const receipt = await tx.wait();
      const projectId = receipt.events.find(e => e.event === 'ProjectRegistered').args.projectId;

      // Calculate total cost with fees for 100 IUs
      const iuAmount = 100; // Just 100 IUs, not in wei
      const basePayment = ethers.utils.parseEther("0.01").mul(iuAmount); // initialPrice * amount
      const buyFeePercentage = await innovationUnits.buyFeePercentage();
      const fee = basePayment.mul(buyFeePercentage).div(10000);
      const totalCost = basePayment.add(fee);

      await celToken.connect(investor1).approve(innovationUnits.address, totalCost);
      await innovationUnits.connect(investor1).buyIUs(projectId, iuAmount);

      await expect(
        innovationUnits.rescueCEL(ethers.utils.parseEther("100"), owner.address)
      ).to.be.revertedWith("No excess CEL to rescue");
    });

    it("Should allow owner to rescue other tokens", async function () {
      // Deploy a test token
      const TestToken = await ethers.getContractFactory("CELToken");
      const testToken = await TestToken.deploy("Test", "TST", ethers.utils.parseEther("1000000"));
      await testToken.deployed();

      // Send some test tokens to the contract
      const amount = ethers.utils.parseEther("100");
      await testToken.transfer(innovationUnits.address, amount);

      const initialBalance = await testToken.balanceOf(owner.address);
      await innovationUnits.rescueToken(testToken.address, amount, owner.address);
      
      const finalBalance = await testToken.balanceOf(owner.address);
      expect(finalBalance.sub(initialBalance)).to.equal(amount);
    });

    it("Should not allow rescuing CEL token through rescueToken", async function () {
      await expect(
        innovationUnits.rescueToken(celToken.address, ethers.utils.parseEther("100"), owner.address)
      ).to.be.revertedWith("Use rescueCEL for CEL tokens");
    });
  });
}); 