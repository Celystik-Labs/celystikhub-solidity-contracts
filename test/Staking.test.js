const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Staking", function () {
  let CELToken;
  let celToken;
  let Staking;
  let staking;
  let owner;
  let user1;
  let user2;
  let addrs;

  // Constants for testing
  const PROJECT_ID = 1;
  const STAKE_AMOUNT = ethers.utils.parseEther("100");
  const STAKE_LIMIT = ethers.utils.parseEther("1000");
  const MIN_STAKING_PERIOD = 60 * 60 * 24 * 7; // 1 week in seconds

  beforeEach(async function () {
    // Get the ContractFactory and Signers here
    CELToken = await ethers.getContractFactory("CELToken");
    Staking = await ethers.getContractFactory("Staking");
    [owner, user1, user2, ...addrs] = await ethers.getSigners();

    // Deploy CEL Token
    celToken = await CELToken.deploy(
      "Celystik Hub Token", // name
      "CEL",              // symbol
      ethers.utils.parseEther("1000000"), // Initial supply: 1 million tokens
      ethers.utils.parseEther("10000000") // Cap: 10 million tokens
    );
    await celToken.deployed();

    // Deploy Staking
    staking = await Staking.deploy(celToken.address);
    await staking.deployed();

    // Transfer CEL tokens to users for testing
    await celToken.transfer(user1.address, ethers.utils.parseEther("10000"));
    await celToken.transfer(user2.address, ethers.utils.parseEther("10000"));

    // Create a staking pool for testing
    await staking.createStakingPool(PROJECT_ID, STAKE_LIMIT, MIN_STAKING_PERIOD);
  });

  describe("Staking Pool Creation", function () {
    it("Should create a staking pool with correct parameters", async function () {
      const poolInfo = await staking.getProjectStakingPool(PROJECT_ID);
      
      expect(poolInfo.totalStaked).to.equal(0);
      expect(poolInfo.stakeLimit).to.equal(STAKE_LIMIT);
      expect(poolInfo.enabled).to.equal(true);
      expect(poolInfo.minStakingPeriod).to.equal(MIN_STAKING_PERIOD);
    });

    it("Should not allow creating a staking pool with ID 0", async function () {
      await expect(
        staking.createStakingPool(0, STAKE_LIMIT, MIN_STAKING_PERIOD)
      ).to.be.revertedWith("Staking: project ID must be greater than zero");
    });

    it("Should not allow creating a duplicate staking pool", async function () {
      await expect(
        staking.createStakingPool(PROJECT_ID, STAKE_LIMIT, MIN_STAKING_PERIOD)
      ).to.be.revertedWith("Staking: staking pool already exists");
    });

    it("Should not allow non-owners to create staking pools", async function () {
      await expect(
        staking.connect(user1).createStakingPool(2, STAKE_LIMIT, MIN_STAKING_PERIOD)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Staking Pool Updates", function () {
    it("Should allow owner to update staking pool parameters", async function () {
      const newStakeLimit = ethers.utils.parseEther("2000");
      const newMinStakingPeriod = MIN_STAKING_PERIOD * 2;
      
      await staking.updateStakingPool(PROJECT_ID, newStakeLimit, true, newMinStakingPeriod);
      
      const poolInfo = await staking.getProjectStakingPool(PROJECT_ID);
      expect(poolInfo.stakeLimit).to.equal(newStakeLimit);
      expect(poolInfo.enabled).to.equal(true);
      expect(poolInfo.minStakingPeriod).to.equal(newMinStakingPeriod);
    });

    it("Should allow disabling a staking pool", async function () {
      await staking.updateStakingPool(PROJECT_ID, STAKE_LIMIT, false, MIN_STAKING_PERIOD);
      
      const poolInfo = await staking.getProjectStakingPool(PROJECT_ID);
      expect(poolInfo.enabled).to.equal(false);
    });

    it("Should not allow setting a stake limit lower than current staked amount", async function () {
      // First stake some tokens
      await celToken.connect(user1).approve(staking.address, STAKE_AMOUNT);
      await staking.connect(user1).stake(PROJECT_ID, STAKE_AMOUNT);
      
      // Try to set limit lower than staked amount
      const lowerLimit = STAKE_AMOUNT.div(2);
      await expect(
        staking.updateStakingPool(PROJECT_ID, lowerLimit, true, MIN_STAKING_PERIOD)
      ).to.be.revertedWith("Staking: new stake limit cannot be less than current total staked");
    });

    it("Should not allow non-owners to update staking pools", async function () {
      await expect(
        staking.connect(user1).updateStakingPool(PROJECT_ID, STAKE_LIMIT, false, MIN_STAKING_PERIOD)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Staking", function () {
    beforeEach(async function () {
      // Approve staking contract to spend user's tokens
      await celToken.connect(user1).approve(staking.address, STAKE_AMOUNT.mul(2));
      await celToken.connect(user2).approve(staking.address, STAKE_AMOUNT.mul(2));
    });

    it("Should allow staking tokens", async function () {
      await staking.connect(user1).stake(PROJECT_ID, STAKE_AMOUNT);
      
      const userStake = await staking.getStaked(user1.address, PROJECT_ID);
      expect(userStake).to.equal(STAKE_AMOUNT);
      
      const totalStaked = await staking.getTotalStaked(PROJECT_ID);
      expect(totalStaked).to.equal(STAKE_AMOUNT);
      
      // Check CEL tokens were transferred
      const stakingBalance = await celToken.balanceOf(staking.address);
      expect(stakingBalance).to.equal(STAKE_AMOUNT);
    });

    it("Should track staking details", async function () {
      const txResponse = await staking.connect(user1).stake(PROJECT_ID, STAKE_AMOUNT);
      const txReceipt = await txResponse.wait();
      const timestamp = (await ethers.provider.getBlock(txReceipt.blockNumber)).timestamp;
      
      const userStakeInfo = await staking.getUserStake(user1.address, PROJECT_ID);
      expect(userStakeInfo.amount).to.equal(STAKE_AMOUNT);
      expect(userStakeInfo.since).to.equal(timestamp);
      expect(userStakeInfo.lastRewardsClaimed).to.equal(timestamp);
    });

    it("Should allow additional staking", async function () {
      await staking.connect(user1).stake(PROJECT_ID, STAKE_AMOUNT);
      await staking.connect(user1).stake(PROJECT_ID, STAKE_AMOUNT);
      
      const userStake = await staking.getStaked(user1.address, PROJECT_ID);
      expect(userStake).to.equal(STAKE_AMOUNT.mul(2));
    });

    it("Should enforce stake limit", async function () {
      // Make sure user1 has enough tokens
      const userBalance = await celToken.balanceOf(user1.address);
      if (userBalance.lt(STAKE_LIMIT)) {
        await celToken.transfer(user1.address, STAKE_LIMIT.mul(2));
      }
      
      // Ensure the approval is sufficient
      await celToken.connect(user1).approve(staking.address, STAKE_LIMIT);
      
      // Stake up to the limit
      await staking.connect(user1).stake(PROJECT_ID, STAKE_LIMIT);
      
      // Try to stake more
      await expect(
        staking.connect(user2).stake(PROJECT_ID, 1)
      ).to.be.revertedWith("Staking: stake limit reached");
    });

    it("Should not allow staking when pool is disabled", async function () {
      // Disable staking pool
      await staking.updateStakingPool(PROJECT_ID, STAKE_LIMIT, false, MIN_STAKING_PERIOD);
      
      // Try to stake
      await expect(
        staking.connect(user1).stake(PROJECT_ID, STAKE_AMOUNT)
      ).to.be.revertedWith("Staking: staking is not enabled for this project");
    });

    it("Should not allow staking with insufficient approval", async function () {
      // Reset approval
      await celToken.connect(user1).approve(staking.address, 0);
      
      await expect(
        staking.connect(user1).stake(PROJECT_ID, STAKE_AMOUNT)
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      // Approve and stake tokens
      await celToken.connect(user1).approve(staking.address, STAKE_AMOUNT);
      await staking.connect(user1).stake(PROJECT_ID, STAKE_AMOUNT);
    });

    it("Should not allow unstaking before minimum period", async function () {
      await expect(
        staking.connect(user1).unstake(PROJECT_ID, STAKE_AMOUNT)
      ).to.be.revertedWith("Staking: minimum staking period not reached");
    });

    it("Should allow unstaking after minimum period", async function () {
      // Advance time
      await ethers.provider.send("evm_increaseTime", [MIN_STAKING_PERIOD]);
      await ethers.provider.send("evm_mine");
      
      // Check can unstake flag
      const canUnstake = await staking.canUnstake(user1.address, PROJECT_ID);
      expect(canUnstake).to.equal(true);
      
      // Unstake
      const initialBalance = await celToken.balanceOf(user1.address);
      await staking.connect(user1).unstake(PROJECT_ID, STAKE_AMOUNT);
      
      // Check user stake
      const userStake = await staking.getStaked(user1.address, PROJECT_ID);
      expect(userStake).to.equal(0);
      
      // Check total staked
      const totalStaked = await staking.getTotalStaked(PROJECT_ID);
      expect(totalStaked).to.equal(0);
      
      // Check tokens returned
      const finalBalance = await celToken.balanceOf(user1.address);
      expect(finalBalance.sub(initialBalance)).to.equal(STAKE_AMOUNT);
    });

    it("Should allow partial unstaking", async function () {
      // Advance time
      await ethers.provider.send("evm_increaseTime", [MIN_STAKING_PERIOD]);
      await ethers.provider.send("evm_mine");
      
      // Unstake half
      const halfAmount = STAKE_AMOUNT.div(2);
      await staking.connect(user1).unstake(PROJECT_ID, halfAmount);
      
      // Check user stake
      const userStake = await staking.getStaked(user1.address, PROJECT_ID);
      expect(userStake).to.equal(halfAmount);
    });

    it("Should not allow unstaking more than staked", async function () {
      // Advance time
      await ethers.provider.send("evm_increaseTime", [MIN_STAKING_PERIOD]);
      await ethers.provider.send("evm_mine");
      
      await expect(
        staking.connect(user1).unstake(PROJECT_ID, STAKE_AMOUNT.mul(2))
      ).to.be.revertedWith("Staking: unstake amount exceeds staked amount");
    });

    it("Should return correct remaining lock time", async function () {
      // Half way through staking period
      await ethers.provider.send("evm_increaseTime", [MIN_STAKING_PERIOD / 2]);
      await ethers.provider.send("evm_mine");
      
      const remainingTime = await staking.getRemainingLockTime(user1.address, PROJECT_ID);
      expect(remainingTime).to.be.closeTo(MIN_STAKING_PERIOD / 2, 10); // Allow small deviation for block times
    });
  });

  describe("Staking Shares", function () {
    beforeEach(async function () {
      // Approve tokens
      await celToken.connect(user1).approve(staking.address, STAKE_AMOUNT.mul(3));
      await celToken.connect(user2).approve(staking.address, STAKE_AMOUNT.mul(3));
      
      // Stake tokens
      await staking.connect(user1).stake(PROJECT_ID, STAKE_AMOUNT);
      await staking.connect(user2).stake(PROJECT_ID, STAKE_AMOUNT.mul(2));
    });

    it("Should calculate staking shares correctly", async function () {
      const user1Share = await staking.getUserStakeShare(user1.address, PROJECT_ID);
      const user2Share = await staking.getUserStakeShare(user2.address, PROJECT_ID);
      
      // user1 has 1/3 of the stake, user2 has 2/3
      const precision = ethers.utils.parseEther("1");
      expect(user1Share).to.equal(precision.div(3));
      expect(user2Share).to.equal(precision.mul(2).div(3));
    });

    it("Should update shares when staking amounts change", async function () {
      // Advance time
      await ethers.provider.send("evm_increaseTime", [MIN_STAKING_PERIOD]);
      await ethers.provider.send("evm_mine");
      
      // User1 unstakes half
      await staking.connect(user1).unstake(PROJECT_ID, STAKE_AMOUNT.div(2));
      
      const user1Share = await staking.getUserStakeShare(user1.address, PROJECT_ID);
      const user2Share = await staking.getUserStakeShare(user2.address, PROJECT_ID);
      
      // user1 now has 1/5, user2 has 4/5
      const precision = ethers.utils.parseEther("1");
      expect(user1Share).to.be.closeTo(precision.div(5), precision.div(100)); // Allow small rounding error
      expect(user2Share).to.be.closeTo(precision.mul(4).div(5), precision.div(100));
    });

    it("Should return 0 share for non-stakers", async function () {
      const nonStakerShare = await staking.getUserStakeShare(addrs[0].address, PROJECT_ID);
      expect(nonStakerShare).to.equal(0);
    });
  });

  describe("Owner Functions", function () {
    beforeEach(async function () {
      // Approve and stake tokens
      await celToken.connect(user1).approve(staking.address, STAKE_AMOUNT);
      await staking.connect(user1).stake(PROJECT_ID, STAKE_AMOUNT);
    });

    it("Should allow owner to update last rewards claimed timestamp", async function () {
      const newTimestamp = Math.floor(Date.now() / 1000) + 1000;
      await staking.updateLastRewardsClaimed(user1.address, PROJECT_ID, newTimestamp);
      
      const userStake = await staking.getUserStake(user1.address, PROJECT_ID);
      expect(userStake.lastRewardsClaimed).to.equal(newTimestamp);
    });

    it("Should not allow updating rewards timestamp for non-stakers", async function () {
      await expect(
        staking.updateLastRewardsClaimed(user2.address, PROJECT_ID, 1000)
      ).to.be.revertedWith("Staking: user has no stake");
    });

    it("Should allow owner to perform emergency withdrawals", async function () {
      const withdrawAmount = STAKE_AMOUNT.div(2);
      const initialBalance = await celToken.balanceOf(owner.address);
      
      await staking.emergencyWithdraw(owner.address, withdrawAmount);
      
      const finalBalance = await celToken.balanceOf(owner.address);
      expect(finalBalance.sub(initialBalance)).to.equal(withdrawAmount);
    });

    it("Should not allow non-owners to perform emergency withdrawals", async function () {
      await expect(
        staking.connect(user1).emergencyWithdraw(user1.address, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
}); 