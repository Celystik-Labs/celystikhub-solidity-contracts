// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ResearchNFT is ERC721URIStorage, Ownable {
    uint256 public nextTokenId;
    mapping(uint256 => uint256) public impactScores;
    mapping(uint256 => bool) public isForSale;
    mapping(uint256 => uint256) public salePrice;
    mapping(uint256 => address) public licensedUsers;

    event NFTMinted(uint256 tokenId, string uri);
    event NFTListed(uint256 tokenId, uint256 price);
    event NFTPurchased(uint256 tokenId, address buyer);
    event NFTLicensed(uint256 tokenId, address licensee);
    event ResearchFunded(uint256 tokenId, address funder, uint256 amount);
    event ReviewSubmitted(uint256 tokenId, string review);

    constructor() ERC721("ResearchNFT", "RNFT") {}

    function mintResearchNFT(string memory uri) public {
        uint256 tokenId = nextTokenId;
        _mint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);
        nextTokenId++;
        emit NFTMinted(tokenId, uri);
    }

    function listNFTForSale(uint256 tokenId, uint256 price) public {
        require(ownerOf(tokenId) == msg.sender, "Not the NFT owner");
        isForSale[tokenId] = true;
        salePrice[tokenId] = price;
        emit NFTListed(tokenId, price);
    }

    function purchaseNFT(uint256 tokenId) public payable {
        require(isForSale[tokenId], "NFT not for sale");
        require(msg.value == salePrice[tokenId], "Incorrect price");

        address seller = ownerOf(tokenId);
        payable(seller).transfer(msg.value);
        _transfer(seller, msg.sender, tokenId);

        isForSale[tokenId] = false;
        emit NFTPurchased(tokenId, msg.sender);
    }

    function licenseResearch(uint256 tokenId, address licensee) public {
        require(ownerOf(tokenId) == msg.sender, "Not the NFT owner");
        licensedUsers[tokenId] = licensee;
        emit NFTLicensed(tokenId, licensee);
    }

    function fundResearch(uint256 tokenId) public payable {
        require(msg.value > 0, "Funding must be greater than 0");
        address owner = ownerOf(tokenId);
        payable(owner).transfer(msg.value);
        emit ResearchFunded(tokenId, msg.sender, msg.value);
    }

    function submitReview(uint256 tokenId, string memory review) public {
        emit ReviewSubmitted(tokenId, review);
    }

   
}
