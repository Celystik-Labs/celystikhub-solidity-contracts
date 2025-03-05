const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProjectNFT", function () {
  it("Should mint a new NFT", async function () {
    const [owner, addr1] = await ethers.getSigners();

    const ProjectNFT = await ethers.getContractFactory("ProjectNFT");
    const projectNFT = await ProjectNFT.deploy("ipfs://test/");
  

    const projectId = 1;
    const mintAmount = 1;
    const data = [];

    await projectNFT.mint(addr1.address, projectId, mintAmount, data);

    expect(await projectNFT.balanceOf(addr1.address, projectId)).to.equal(mintAmount);
  });

  it("Should set and get project license", async function () {
    const [owner, addr1] = await ethers.getSigners();

    const ProjectNFT = await ethers.getContractFactory("ProjectNFT");
    const projectNFT = await ProjectNFT.deploy("ipfs://test/");


    const projectId = 1;
    const mintAmount = 1;
    const data = [];
    const license = "MIT License";

    await projectNFT.mint(addr1.address, projectId, mintAmount, data);
    await projectNFT.setProjectLicense(projectId, license);

    expect(await projectNFT.getProjectLicense(projectId)).to.equal(license);
  });
});