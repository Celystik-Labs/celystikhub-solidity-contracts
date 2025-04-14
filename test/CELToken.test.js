const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CELToken", function () {
  let CELToken;
  let celToken;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    CELToken = await ethers.getContractFactory("CELToken");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Deploy the contract
    celToken = await CELToken.deploy(
      "Celystik Hub Token", // name
      "CEL",               // symbol
      ethers.utils.parseEther("1000000"), // Initial supply: 1 million tokens
      ethers.utils.parseEther("10000000") // Cap: 10 million tokens
    );
    await celToken.deployed();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await celToken.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await celToken.balanceOf(owner.address);
      expect(await celToken.totalSupply()).to.equal(ownerBalance);
    });

    it("Should set the correct token name and symbol", async function () {
      expect(await celToken.name()).to.equal("Celystik Hub Token");
      expect(await celToken.symbol()).to.equal("CEL");
    });

    it("Should set the correct cap", async function () {
      expect(await celToken.cap()).to.equal(ethers.utils.parseEther("10000000"));
    });
  });

  describe("Transactions", function () {
    it("Should transfer tokens between accounts", async function () {
      // Transfer 50 tokens from owner to addr1
      await celToken.transfer(addr1.address, 50);
      const addr1Balance = await celToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(50);

      // Transfer 50 tokens from addr1 to addr2
      await celToken.connect(addr1).transfer(addr2.address, 50);
      const addr2Balance = await celToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(50);
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      const initialOwnerBalance = await celToken.balanceOf(owner.address);

      // Try to send 1 token from addr1 (0 tokens) to owner
      await expect(
        celToken.connect(addr1).transfer(owner.address, 1)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

      // Owner balance shouldn't have changed
      expect(await celToken.balanceOf(owner.address)).to.equal(initialOwnerBalance);
    });

    it("Should update balances after transfers", async function () {
      const initialOwnerBalance = await celToken.balanceOf(owner.address);

      // Transfer 100 tokens from owner to addr1
      await celToken.transfer(addr1.address, 100);

      // Transfer another 50 tokens from owner to addr2
      await celToken.transfer(addr2.address, 50);

      // Check balances
      const finalOwnerBalance = await celToken.balanceOf(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance.sub(150));

      const addr1Balance = await celToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(100);

      const addr2Balance = await celToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(50);
    });
  });

  describe("Minting", function () {
    it("Should allow owner to mint tokens", async function () {
      const initialSupply = await celToken.totalSupply();
      
      // Mint 1000 tokens to addr1
      await celToken.mint(addr1.address, 1000);
      
      // Check balance of addr1
      const addr1Balance = await celToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(1000);
      
      // Check total supply
      const newSupply = await celToken.totalSupply();
      expect(newSupply).to.equal(initialSupply.add(1000));
    });
    
    it("Should not allow non-minters to mint tokens", async function () {
      // Try to mint from addr1
      await expect(
        celToken.connect(addr1).mint(addr2.address, 1000)
      ).to.be.revertedWith("CELToken: caller is not a minter");
    });
    
    it("Should not allow minting beyond the cap", async function () {
      const cap = await celToken.cap();
      const initialSupply = await celToken.totalSupply();
      const mintAmount = cap.sub(initialSupply).add(1); // One more than allowed
      
      // Try to mint beyond the cap
      await expect(
        celToken.mint(addr1.address, mintAmount)
      ).to.be.revertedWith("CELToken: cap exceeded");
    });
  });

  describe("Access Control", function () {
    it("Should allow owner to set minter role", async function () {
      // Check addr1 is not a minter
      expect(await celToken.isMinter(addr1.address)).to.equal(false);
      
      // Set addr1 as minter
      await celToken.setMinter(addr1.address, true);
      
      // Check addr1 is now a minter
      expect(await celToken.isMinter(addr1.address)).to.equal(true);
      
      // Mint tokens from addr1
      await celToken.connect(addr1).mint(addr2.address, 500);
      
      // Check addr2 received the tokens
      expect(await celToken.balanceOf(addr2.address)).to.equal(500);
    });
    
    it("Should allow owner to set burner role", async function () {
      // Check addr1 is not a burner
      expect(await celToken.isBurner(addr1.address)).to.equal(false);
      
      // Set addr1 as burner
      await celToken.setBurner(addr1.address, true);
      
      // Check addr1 is now a burner
      expect(await celToken.isBurner(addr1.address)).to.equal(true);
    });
    
    it("Should not allow non-owners to set roles", async function () {
      // Try to set a minter from non-owner
      await expect(
        celToken.connect(addr1).setMinter(addr2.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      // Try to set a burner from non-owner
      await expect(
        celToken.connect(addr1).setBurner(addr2.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Pausing", function () {
    it("Should allow owner to pause and unpause transfers", async function () {
      // Pause the token
      await celToken.pause();
      expect(await celToken.paused()).to.equal(true);
      
      // Try to transfer tokens
      await expect(
        celToken.transfer(addr1.address, 100)
      ).to.be.revertedWith("ERC20Pausable: token transfer while paused");
      
      // Unpause the token
      await celToken.unpause();
      expect(await celToken.paused()).to.equal(false);
      
      // Transfer should now work
      await celToken.transfer(addr1.address, 100);
      expect(await celToken.balanceOf(addr1.address)).to.equal(100);
    });
    
    it("Should not allow non-owners to pause or unpause", async function () {
      // Try to pause from non-owner
      await expect(
        celToken.connect(addr1).pause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      // Pause as owner
      await celToken.pause();
      
      // Try to unpause from non-owner
      await expect(
        celToken.connect(addr1).unpause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
}); 