async function main() {
  const ProjectNFT = await ethers.getContractFactory("ProjectNFT");
  const projectNFT = await ProjectNFT.deploy("ipfs://your-ipfs-gateway/"); // Replace with your IPFS gateway or base URI

  //await projectNFT.deployed();

  console.log("ProjectNFT deployed to:", await projectNFT.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });