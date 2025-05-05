const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProtocolTreasury", function () {
  let ProtocolTreasury;
  let CELToken;
  let protocolTreasury;
  let celToken;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers
    ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
    CELToken = await ethers.getContractFactory("CELToken");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

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
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await protocolTreasury.owner()).to.equal(owner.address);
    });

    it("Should set the correct CEL token address", async function () {
      expect(await protocolTreasury.celToken()).to.equal(celToken.address);
    });
  });

  describe("Fund Management", function () {
    beforeEach(async function () {
      // Transfer some tokens to addr1 for testing
      await celToken.transfer(addr1.address, ethers.utils.parseEther("1000"));
      // Approve treasury to spend addr1's tokens
      await celToken.connect(addr1).approve(protocolTreasury.address, ethers.utils.parseEther("1000"));
    });

    it("Should show the correct CEL token balance", async function () {
      // Receive fees from addr1
      await protocolTreasury.connect(addr1).receiveFees(ethers.utils.parseEther("500"));
      
      const treasuryBalance = await celToken.balanceOf(protocolTreasury.address);
      expect(treasuryBalance).to.equal(ethers.utils.parseEther("500"));
      
      // Check balance using getBalance function
      const reportedBalance = await protocolTreasury.getBalance();
      expect(reportedBalance).to.equal(treasuryBalance);
    });

    it("Should allow owner to send fees to a recipient", async function () {
      // First receive some fees
      await protocolTreasury.connect(addr1).receiveFees(ethers.utils.parseEther("500"));
      
      const initialAddr2Balance = await celToken.balanceOf(addr2.address);
      const sendAmount = ethers.utils.parseEther("200");

      await protocolTreasury.sendFees(addr2.address, sendAmount);

      const finalAddr2Balance = await celToken.balanceOf(addr2.address);
      expect(finalAddr2Balance).to.equal(initialAddr2Balance.add(sendAmount));

      const treasuryBalance = await celToken.balanceOf(protocolTreasury.address);
      expect(treasuryBalance).to.equal(ethers.utils.parseEther("300")); // 500 - 200
    });

    it("Should not allow non-owners to send fees", async function () {
      // First receive some fees
      await protocolTreasury.connect(addr1).receiveFees(ethers.utils.parseEther("500"));
      
      const sendAmount = ethers.utils.parseEther("200");

      await expect(
        protocolTreasury.connect(addr1).sendFees(addr1.address, sendAmount)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should track total fees received", async function () {
      // Initially totalFees should be 0
      expect(await protocolTreasury.totalFees()).to.equal(0);
      
      // Receive fees in multiple transactions
      await protocolTreasury.connect(addr1).receiveFees(ethers.utils.parseEther("100"));
      await protocolTreasury.connect(addr1).receiveFees(ethers.utils.parseEther("200"));
      
      // Total fees should be sum of all received fees
      expect(await protocolTreasury.totalFees()).to.equal(ethers.utils.parseEther("300"));
    });
    
    it("Should emit FeesReceived event when receiving fees", async function () {
      const amount = ethers.utils.parseEther("100");
      
      await expect(protocolTreasury.connect(addr1).receiveFees(amount))
        .to.emit(protocolTreasury, "FeesReceived")
        .withArgs(amount, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
    });
    
    it("Should emit FeesSent event when sending fees", async function () {
      // First receive some fees
      await protocolTreasury.connect(addr1).receiveFees(ethers.utils.parseEther("500"));
      
      const amount = ethers.utils.parseEther("200");
      
      await expect(protocolTreasury.sendFees(addr2.address, amount))
        .to.emit(protocolTreasury, "FeesSent")
        .withArgs(addr2.address, amount);
    });
  });

  describe("ETH Management", function () {
    let ethAmount;

    beforeEach(async function () {
      // Send some ETH to the treasury for tests
      ethAmount = ethers.utils.parseEther("1.0");
      await owner.sendTransaction({
        to: protocolTreasury.address,
        value: ethAmount
      });
    });

    it("Should receive and store ETH", async function () {
      const treasuryBalance = await ethers.provider.getBalance(protocolTreasury.address);
      expect(treasuryBalance).to.equal(ethAmount);
    });

    it("Should allow owner to withdraw ETH via emergencyWithdraw", async function () {
      const initialBalance = await ethers.provider.getBalance(addr1.address);
      const withdrawAmount = ethers.utils.parseEther("0.5");

      await protocolTreasury.emergencyWithdraw(
        ethers.constants.AddressZero, // Use zero address for ETH
        addr1.address,
        withdrawAmount
      );

      const finalBalance = await ethers.provider.getBalance(addr1.address);
      expect(finalBalance.sub(initialBalance)).to.equal(withdrawAmount);

      const treasuryBalance = await ethers.provider.getBalance(protocolTreasury.address);
      expect(treasuryBalance).to.equal(ethAmount.sub(withdrawAmount));
    });

    it("Should not allow non-owners to withdraw ETH", async function () {
      const withdrawAmount = ethers.utils.parseEther("0.5");

      await expect(
        protocolTreasury.connect(addr1).emergencyWithdraw(
          ethers.constants.AddressZero,
          addr1.address,
          withdrawAmount
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should emit EmergencyWithdrawal event when withdrawing ETH", async function () {
      const withdrawAmount = ethers.utils.parseEther("0.5");
      
      await expect(
        protocolTreasury.emergencyWithdraw(
          ethers.constants.AddressZero,
          addr1.address,
          withdrawAmount
        )
      ).to.emit(protocolTreasury, "EmergencyWithdrawal")
       .withArgs(ethers.constants.AddressZero, addr1.address, withdrawAmount);
    });
  });

  describe("Emergency Functions", function () {
    let testToken;

    beforeEach(async function () {
      // Deploy another ERC20 token for testing emergency recovery
      const TestToken = await ethers.getContractFactory("CELToken"); // Reusing CELToken as test token
      testToken = await TestToken.deploy("Test Token", "TST", ethers.utils.parseEther("1000000"));
      await testToken.deployed();

      // Transfer some test tokens to the treasury
      await testToken.transfer(protocolTreasury.address, ethers.utils.parseEther("1000"));
    });

    it("Should allow owner to recover ERC20 tokens via emergencyWithdraw", async function () {
      const initialOwnerBalance = await testToken.balanceOf(owner.address);
      const recoveryAmount = ethers.utils.parseEther("500");

      await protocolTreasury.emergencyWithdraw(
        testToken.address,
        owner.address,
        recoveryAmount
      );

      const finalOwnerBalance = await testToken.balanceOf(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance.add(recoveryAmount));

      const treasuryBalance = await testToken.balanceOf(protocolTreasury.address);
      expect(treasuryBalance).to.equal(ethers.utils.parseEther("500")); // 1000 - 500
    });

    it("Should not allow non-owners to recover ERC20 tokens", async function () {
      const recoveryAmount = ethers.utils.parseEther("500");

      await expect(
        protocolTreasury.connect(addr1).emergencyWithdraw(
          testToken.address,
          addr1.address,
          recoveryAmount
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should emit EmergencyWithdrawal event when recovering tokens", async function () {
      const recoveryAmount = ethers.utils.parseEther("500");
      
      await expect(
        protocolTreasury.emergencyWithdraw(
          testToken.address,
          owner.address,
          recoveryAmount
        )
      ).to.emit(protocolTreasury, "EmergencyWithdrawal")
       .withArgs(testToken.address, owner.address, recoveryAmount);
    });
  });
}); 