// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IInnovationUnits.sol";

/**
 * @title InnovationUnits
 * @dev ERC-1155 token for representing Innovation Units (IUs) for multiple projects
 * Each token ID represents a different project's Innovation Units
 * This approach avoids deploying separate contracts for each project
 *
 * Note: This contract implements all functions defined in IInnovationUnits interface
 * but doesn't explicitly inherit from it to avoid duplicate event definitions.
 * All functionality remains the same.
 */
contract InnovationUnits is ERC1155Supply, Ownable {
    using SafeMath for uint256;

    // Project counter for generating unique IDs
    uint256 private _projectCounter = 0;

    // Project struct to store all project-specific data
    struct ProjectData {
        uint256 projectId;
        uint256 totalSupply;
        uint256 initialPrice;
        uint256 creatorsAllocatedPercentage;
        uint256 contributorsReservePercentage;
        uint256 investorsReservePercentage;
        address treasuryAddress;
        bool exists;
    }

    // Mapping from token ID (project ID) to project data
    mapping(uint256 => ProjectData) public projects;

    // Mapping from project ID to list of creators
    mapping(uint256 => address[]) public projectCreators;

    // Creator details per project (project ID => creator address => share)
    mapping(uint256 => mapping(address => uint256)) public creatorShares;
    mapping(uint256 => mapping(address => uint256)) public creatorSoldAmounts;

    // Contributor and investor tracking per project
    mapping(uint256 => address[]) public projectContributors;
    mapping(uint256 => mapping(address => uint256)) public contributorAmounts;

    mapping(uint256 => address[]) public projectInvestors;
    mapping(uint256 => mapping(address => uint256)) public investorAmounts;

    // Tracking minted tokens per project
    mapping(uint256 => uint256) public creatorsMinted;
    mapping(uint256 => uint256) public contributorsMinted;
    mapping(uint256 => uint256) public investorsMinted;

    // Fee settings
    uint256 public buyFeePercentage = 500; // 5% buy fee (in basis points)
    uint256 public sellFeePercentage = 2000; // 20% sell fee (in basis points)

    // Project registration event
    event ProjectRegistered(
        uint256 indexed projectId,
        address indexed admin,
        uint256 totalSupply
    );
    event IUMinted(
        uint256 indexed projectId,
        address indexed to,
        uint256 amount
    );
    event IUSold(
        uint256 indexed projectId,
        address indexed from,
        uint256 amount,
        uint256 returnAmount
    );
    event IUBought(
        uint256 indexed projectId,
        address indexed buyer,
        uint256 amount,
        uint256 price
    );
    event PriceUpdated(
        uint256 indexed projectId,
        uint256 oldPrice,
        uint256 newPrice
    );
    event FeeUpdated(string feeType, uint256 oldValue, uint256 newValue);

    /**
     * @dev Constructor
     * @param _uri Base URI for token metadata
     */
    constructor(string memory _uri) ERC1155(_uri) {}

    /**
     * @dev Modifier to check if the project exists
     */
    modifier projectExists(uint256 projectId) {
        require(projects[projectId].exists, "Project does not exist");
        _;
    }

    /**
     * @dev Creates a new project and assigns a unique token ID for its IUs
     * @param _totalSupply Total supply of Innovation Units for this project
     * @param _initialPrice Initial price per IU in wei
     * @param _creators Array of creator addresses
     * @param _creatorShares Array of creator shares (in percentage of creator allocation)
     * @param _creatorsAllocatedPercentage Percentage allocated to creators (in basis points)
     * @param _contributorsReservePercentage Percentage allocated to contributors (in basis points)
     * @param _investorsReservePercentage Percentage allocated to investors (in basis points)
     * @param _treasuryAddress Address where fees will be sent
     * @return projectId The project ID (token ID) assigned to the new project
     */
    function createProject(
        uint256 _totalSupply,
        uint256 _initialPrice,
        address[] memory _creators,
        uint256[] memory _creatorShares,
        uint256 _creatorsAllocatedPercentage,
        uint256 _contributorsReservePercentage,
        uint256 _investorsReservePercentage,
        address _treasuryAddress,
        address _projectAdmin
    ) external onlyOwner returns (uint256 projectId) {
        require(
            _creators.length == _creatorShares.length,
            "Creator arrays length mismatch"
        );
        require(_creators.length > 0, "At least one creator required");
        require(_treasuryAddress != address(0), "Invalid treasury address");
        require(_projectAdmin != address(0), "Invalid project admin address");

        uint256 totalCreatorShares = 0;
        for (uint256 i = 0; i < _creatorShares.length; i++) {
            totalCreatorShares = totalCreatorShares.add(_creatorShares[i]);
        }
        require(
            totalCreatorShares == 10000,
            "Creator shares must add up to 100%"
        );

        uint256 totalPercentage = _contributorsReservePercentage.add(
            (_investorsReservePercentage.add(_creatorsAllocatedPercentage))
        );
        require(totalPercentage == 10000, "Total allocation must equal 100%");

        // Generate a new project ID
        projectId = _projectCounter;
        _projectCounter++;

        // Store project data
        projects[projectId] = ProjectData({
            projectId: projectId,
            totalSupply: _totalSupply,
            initialPrice: _initialPrice,
            creatorsAllocatedPercentage: _creatorsAllocatedPercentage,
            contributorsReservePercentage: _contributorsReservePercentage,
            investorsReservePercentage: _investorsReservePercentage,
            treasuryAddress: _treasuryAddress,
            exists: true
        });

        // Store creator information
        projectCreators[projectId] = _creators;
        for (uint256 i = 0; i < _creators.length; i++) {
            creatorShares[projectId][_creators[i]] = _creatorShares[i];
        }

        emit ProjectRegistered(projectId, _projectAdmin, _totalSupply);
        return projectId;
    }

    /**
     * @dev Mints IUs to creators based on their specified shares
     * @param projectId The project ID (token ID) of the IUs
     */
    function mintToCreators(
        uint256 projectId
    ) external projectExists(projectId) {
        require(creatorsMinted[projectId] == 0, "Creators already minted");

        ProjectData storage project = projects[projectId];
        address[] storage creators = projectCreators[projectId];

        uint256 creatorsAllocation = project
            .totalSupply
            .mul(project.creatorsAllocatedPercentage)
            .div(10000);

        for (uint256 i = 0; i < creators.length; i++) {
            address creator = creators[i];
            uint256 creatorShare = creatorShares[projectId][creator];
            uint256 creatorAmount = creatorsAllocation.mul(creatorShare).div(
                10000
            );

            _mint(creator, projectId, creatorAmount, "");
            creatorsMinted[projectId] = creatorsMinted[projectId].add(
                creatorAmount
            );

            emit IUMinted(projectId, creator, creatorAmount);
        }
    }

    /**
     * @dev Mints IUs to a contributor
     * @param projectId The project ID (token ID) of the IUs
     * @param contributor Address of the contributor
     * @param amount Amount of IUs to mint
     */
    function mintToContributor(
        uint256 projectId,
        address contributor,
        uint256 amount
    ) external projectExists(projectId) onlyOwner {
        require(contributor != address(0), "Invalid contributor address");
        require(amount > 0, "Amount must be greater than 0");

        ProjectData storage project = projects[projectId];

        uint256 contributorsAllocation = project
            .totalSupply
            .mul(project.contributorsReservePercentage)
            .div(10000);
        require(
            contributorsMinted[projectId].add(amount) <= contributorsAllocation,
            "Exceeds contributors allocation"
        );

        _mint(contributor, projectId, amount, "");
        contributorsMinted[projectId] = contributorsMinted[projectId].add(
            amount
        );

        // Track contributor information
        if (contributorAmounts[projectId][contributor] == 0) {
            projectContributors[projectId].push(contributor);
        }
        contributorAmounts[projectId][contributor] = contributorAmounts[
            projectId
        ][contributor].add(amount);

        emit IUMinted(projectId, contributor, amount);
    }

    /**
     * @dev Buy IUs as an investor
     * @param projectId The project ID (token ID) of the IUs
     * @param investor Address of the investor
     * @param amount Amount of IUs to buy
     * @return basePayment The base amount required for the purchase (goes to project treasury)
     * @return fee The fee amount (goes to platform treasury)
     */
    function mintIUsForTokens(
        uint256 projectId,
        address investor,
        uint256 amount
    )
        external
        projectExists(projectId)
        onlyOwner
        returns (uint256 basePayment, uint256 fee)
    {
        require(investor != address(0), "Invalid investor address");
        require(amount > 0, "Amount must be greater than 0");

        ProjectData storage project = projects[projectId];

        uint256 investorsAllocation = project
            .totalSupply
            .mul(project.investorsReservePercentage)
            .div(10000);
        require(
            investorsMinted[projectId].add(amount) <= investorsAllocation,
            "Exceeds investors allocation"
        );

        // Calculate payment amounts
        basePayment = amount.mul(project.initialPrice);
        fee = basePayment.mul(buyFeePercentage).div(10000);

        // Handle token minting (caller will handle payment collection)
        _mint(investor, projectId, amount, "");
        investorsMinted[projectId] = investorsMinted[projectId].add(amount);

        // Track investor information
        if (investorAmounts[projectId][investor] == 0) {
            projectInvestors[projectId].push(investor);
        }
        investorAmounts[projectId][investor] = investorAmounts[projectId][
            investor
        ].add(amount);

        emit IUBought(projectId, investor, amount, project.initialPrice);
        return (basePayment, fee);
    }

    /**
     * @dev Sell IUs for Tokens
     * @param projectId The project ID (token ID) of the IUs
     * @param seller Address of the seller
     * @param amount Amount of IUs to sell
     * @return baseReturn The base amount to return to seller (before fee deduction)
     * @return fee The fee amount (goes to platform treasury)
     */
    function burnIUsForTokens(
        uint256 projectId,
        address seller,
        uint256 amount
    )
        external
        projectExists(projectId)
        onlyOwner
        returns (uint256 baseReturn, uint256 fee)
    {
        require(seller != address(0), "Invalid seller address");
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(seller, projectId) >= amount, "Insufficient balance");

        ProjectData storage project = projects[projectId];

        // Calculate return amounts
        baseReturn = amount.mul(project.initialPrice);
        fee = baseReturn.mul(sellFeePercentage).div(10000);
        uint256 returnAmount = baseReturn.sub(fee);

        // Update tracking based on seller type
        if (investorAmounts[projectId][seller] > 0) {
            // If the seller is an investor, update their tracking
            investorAmounts[projectId][seller] = investorAmounts[projectId][
                seller
            ] > amount
                ? investorAmounts[projectId][seller].sub(amount)
                : 0;
        } else if (contributorAmounts[projectId][seller] > 0) {
            // If the seller is a contributor, update their tracking
            contributorAmounts[projectId][seller] = contributorAmounts[
                projectId
            ][seller] > amount
                ? contributorAmounts[projectId][seller].sub(amount)
                : 0;
        } else if (creatorShares[projectId][seller] > 0) {
            // If the seller is a creator, track how many IUs they've sold
            creatorSoldAmounts[projectId][seller] = creatorSoldAmounts[
                projectId
            ][seller].add(amount);
        }

        // Burn the tokens (caller will handle payment)
        _burn(seller, projectId, amount);

        emit IUSold(projectId, seller, amount, returnAmount);
        return (baseReturn, fee);
    }

    /**
     * @dev Update the treasury address for a project
     * @param projectId The project ID to update
     * @param _treasuryAddress New address for the treasury
     */
    function setTreasuryAddress(
        uint256 projectId,
        address _treasuryAddress
    ) external projectExists(projectId) onlyOwner {
        require(_treasuryAddress != address(0), "Invalid treasury address");
        projects[projectId].treasuryAddress = _treasuryAddress;
    }

    /**
     * @dev Returns the project data
     * @param projectId The project ID to query
     */
    function getProjectData(
        uint256 projectId
    )
        external
        view
        projectExists(projectId)
        returns (
            uint256 totalSupply,
            uint256 initialPrice,
            uint256 creatorsAllocatedPercentage,
            uint256 contributorsReservePercentage,
            uint256 investorsReservePercentage,
            address treasuryAddress
        )
    {
        ProjectData storage project = projects[projectId];
        return (
            project.totalSupply,
            project.initialPrice,
            project.creatorsAllocatedPercentage,
            project.contributorsReservePercentage,
            project.investorsReservePercentage,
            project.treasuryAddress
        );
    }

    /**
     * @dev Returns the remaining allocation for contributors
     * @param projectId The project ID to query
     */
    function remainingContributorAllocation(
        uint256 projectId
    ) external view projectExists(projectId) returns (uint256) {
        ProjectData storage project = projects[projectId];
        uint256 contributorsAllocation = project
            .totalSupply
            .mul(project.contributorsReservePercentage)
            .div(10000);
        return contributorsAllocation.sub(contributorsMinted[projectId]);
    }

    /**
     * @dev Returns the remaining allocation for investors
     * @param projectId The project ID to query
     */
    function remainingInvestorAllocation(
        uint256 projectId
    ) external view projectExists(projectId) returns (uint256) {
        ProjectData storage project = projects[projectId];
        uint256 investorsAllocation = project
            .totalSupply
            .mul(project.investorsReservePercentage)
            .div(10000);
        return investorsAllocation.sub(investorsMinted[projectId]);
    }

    /**
     * @dev Returns creator information for a project
     * @param projectId The project ID to query
     * @return _creators Array of creator addresses
     * @return _shares Array of creator shares
     */
    function getCreatorInfo(
        uint256 projectId
    )
        external
        view
        projectExists(projectId)
        returns (address[] memory _creators, uint256[] memory _shares)
    {
        address[] storage creators = projectCreators[projectId];
        _shares = new uint256[](creators.length);

        for (uint256 i = 0; i < creators.length; i++) {
            _shares[i] = creatorShares[projectId][creators[i]];
        }

        return (creators, _shares);
    }

    /**
     * @dev Returns information about IUs sold by creators for a project
     * @param projectId The project ID to query
     * @return _creators Array of creator addresses
     * @return _soldAmounts Array of IU amounts each creator has sold
     */
    function getCreatorSoldInfo(
        uint256 projectId
    )
        external
        view
        projectExists(projectId)
        returns (address[] memory _creators, uint256[] memory _soldAmounts)
    {
        address[] storage creators = projectCreators[projectId];
        _soldAmounts = new uint256[](creators.length);

        for (uint256 i = 0; i < creators.length; i++) {
            _soldAmounts[i] = creatorSoldAmounts[projectId][creators[i]];
        }

        return (creators, _soldAmounts);
    }

    /**
     * @dev Returns information about how many IUs a specific creator has sold
     * @param projectId The project ID to query
     * @param creator Address of the creator to query
     * @return soldAmount The amount of IUs the creator has sold
     */
    function getCreatorSoldAmount(
        uint256 projectId,
        address creator
    ) external view projectExists(projectId) returns (uint256 soldAmount) {
        return creatorSoldAmounts[projectId][creator];
    }

    /**
     * @dev Returns comprehensive information about a specific creator
     * @param projectId The project ID to query
     * @param creator Address of the creator to query
     * @return share Percentage allocation of the creator (in basis points)
     * @return allocation Total IUs allocated to the creator
     * @return soldAmount Amount of IUs the creator has sold
     * @return currentBalance Current IU balance of the creator
     */
    function getCreatorStatus(
        uint256 projectId,
        address creator
    )
        external
        view
        projectExists(projectId)
        returns (
            uint256 share,
            uint256 allocation,
            uint256 soldAmount,
            uint256 currentBalance
        )
    {
        ProjectData storage project = projects[projectId];
        share = creatorShares[projectId][creator];

        // Calculate the total IUs allocated to this creator based on their share
        uint256 creatorsAllocation = project
            .totalSupply
            .mul(project.creatorsAllocatedPercentage)
            .div(10000);
        allocation = creatorsAllocation.mul(share).div(10000);

        soldAmount = creatorSoldAmounts[projectId][creator];
        currentBalance = balanceOf(creator, projectId);

        return (share, allocation, soldAmount, currentBalance);
    }

    /**
     * @dev Returns all contributors information for a project
     * @param projectId The project ID to query
     * @return _contributors Array of addresses that have received contributor IUs
     * @return _amounts Array of IU amounts each contributor has received
     */
    function getContributorsInfo(
        uint256 projectId
    )
        external
        view
        projectExists(projectId)
        returns (address[] memory _contributors, uint256[] memory _amounts)
    {
        address[] storage contributors = projectContributors[projectId];
        _amounts = new uint256[](contributors.length);

        for (uint256 i = 0; i < contributors.length; i++) {
            _amounts[i] = contributorAmounts[projectId][contributors[i]];
        }

        return (contributors, _amounts);
    }

    /**
     * @dev Returns contributor information for a specific address
     * @param projectId The project ID to query
     * @param contributor Address of the contributor to query
     * @return amount The amount of IUs the contributor has received
     */
    function getContributorInfo(
        uint256 projectId,
        address contributor
    ) external view projectExists(projectId) returns (uint256 amount) {
        return contributorAmounts[projectId][contributor];
    }

    /**
     * @dev Returns all investors information for a project
     * @param projectId The project ID to query
     * @return _investors Array of addresses that have invested in IUs
     * @return _amounts Array of IU amounts each investor has purchased
     */
    function getInvestorsInfo(
        uint256 projectId
    )
        external
        view
        projectExists(projectId)
        returns (address[] memory _investors, uint256[] memory _amounts)
    {
        address[] storage investors = projectInvestors[projectId];
        _amounts = new uint256[](investors.length);

        for (uint256 i = 0; i < investors.length; i++) {
            _amounts[i] = investorAmounts[projectId][investors[i]];
        }

        return (investors, _amounts);
    }

    /**
     * @dev Returns investor information for a specific address
     * @param projectId The project ID to query
     * @param investor Address of the investor to query
     * @return amount The amount of IUs the investor has purchased
     */
    function getInvestorInfo(
        uint256 projectId,
        address investor
    ) external view projectExists(projectId) returns (uint256 amount) {
        return investorAmounts[projectId][investor];
    }

    /**
     * @dev Check if a project exists
     * @param projectId The project ID to check
     * @return True if the project exists
     */
    function projectIdExists(uint256 projectId) external view returns (bool) {
        return projects[projectId].exists;
    }

    /**
     * @dev Get total number of projects registered
     * @return The total number of projects
     */
    function getTotalProjects() external view returns (uint256) {
        return _projectCounter;
    }

    /**
     * @dev Update the buy fee percentage
     * @param _buyFeePercentage New buy fee percentage (in basis points: 100 = 1%)
     */
    function updateBuyFeePercentage(
        uint256 _buyFeePercentage
    ) external onlyOwner {
        require(_buyFeePercentage <= 3000, "Fee too high: max 30%");
        uint256 oldFee = buyFeePercentage;
        buyFeePercentage = _buyFeePercentage;
        emit FeeUpdated("buy", oldFee, _buyFeePercentage);
    }

    /**
     * @dev Update the sell fee percentage
     * @param _sellFeePercentage New sell fee percentage (in basis points: 100 = 1%)
     */
    function updateSellFeePercentage(
        uint256 _sellFeePercentage
    ) external onlyOwner {
        require(_sellFeePercentage <= 3000, "Fee too high: max 30%");
        uint256 oldFee = sellFeePercentage;
        sellFeePercentage = _sellFeePercentage;
        emit FeeUpdated("sell", oldFee, _sellFeePercentage);
    }

    // Overrides _beforeTokenTransfer from ERC1155Supply
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override(ERC1155Supply) {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }
}
