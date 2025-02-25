// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ResearchNFT {
    struct Research {
        string title;
        string repository;
        string metadata;
        address owner;
        uint256 impactScore;
        bool licensed;
    }

    mapping(uint256 => Research) public researchNFTs;
    uint256 public nextTokenId;
    mapping(address => uint256[]) public userResearch;

    event ResearchMinted(uint256 tokenId, address owner);
    event ImpactUpdated(uint256 tokenId, uint256 newScore);
    event ResearchLicensed(uint256 tokenId, address licensee);

    function mintResearchNFT(
        string memory _title, 
        string memory _repository, 
        string memory _metadata
    ) public {
        uint256 tokenId = nextTokenId;
        researchNFTs[tokenId] = Research(_title, _repository, _metadata, msg.sender, 0, false);
        userResearch[msg.sender].push(tokenId);
        nextTokenId++;

        emit ResearchMinted(tokenId, msg.sender);
    }

    function updateImpactScore(uint256 tokenId, uint256 newScore) public {
        require(msg.sender == researchNFTs[tokenId].owner, "Only owner can update score");
        researchNFTs[tokenId].impactScore = newScore;
        emit ImpactUpdated(tokenId, newScore);
    }

    function licenseResearch(uint256 tokenId, address licensee) public {
        require(msg.sender == researchNFTs[tokenId].owner, "Only owner can license research");
        researchNFTs[tokenId].licensed = true;
        emit ResearchLicensed(tokenId, licensee);
    }

    function getResearch(uint256 tokenId) public view returns (Research memory) {
        return researchNFTs[tokenId];
    }
}
