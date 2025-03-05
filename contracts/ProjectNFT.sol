// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ProjectNFT is ERC1155, Ownable {
    using Strings for uint256;

    string public name = "ProjectNFT";
    string public symbol = "PNFT";
    string public baseURI;

    uint256 public constant CODE_PROJECT_TYPE = 1;
    uint256 public constant PAPER_PROJECT_TYPE = 2;
    uint256 public constant DATASET_PROJECT_TYPE = 3;

    mapping(uint256 => string) public projectTypes;
    mapping(uint256 => string) public projectLicenses;

    constructor(string memory _baseURI) ERC1155(_baseURI) Ownable(msg.sender) {
        baseURI = _baseURI;
        _setProjectType(CODE_PROJECT_TYPE, "Code Project");
        _setProjectType(PAPER_PROJECT_TYPE, "Paper Project");
        _setProjectType(DATASET_PROJECT_TYPE, "Dataset Project");
    }

    function setBaseURI(string memory _baseURI) public onlyOwner {
        baseURI = _baseURI;
    }

    function uri(uint256 _tokenId) public view override returns (string memory) {
        return string(abi.encodePacked(baseURI, Strings.toString(_tokenId), ".json"));
    }

    function mint(address _to, uint256 _id, uint256 _amount, bytes memory _data) public onlyOwner {
        _mint(_to, _id, _amount, _data);
    }

    function mintBatch(address _to, uint256[] memory _ids, uint256[] memory _amounts, bytes memory _data) public onlyOwner {
        _mintBatch(_to, _ids, _amounts, _data);
    }

    function _setProjectType(uint256 _projectType, string memory _typeName) internal {
        projectTypes[_projectType] = _typeName;
    }

    function setProjectType(uint256 _projectType, string memory _typeName) public onlyOwner {
        _setProjectType(_projectType, _typeName);
    }

    function setProjectLicense(uint256 _tokenId, string memory _license) public onlyOwner {
        projectLicenses[_tokenId] = _license;
    }

    function getProjectLicense(uint256 _tokenId) public view returns (string memory) {
        return projectLicenses[_tokenId];
    }
} 