// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IInnovationUnits.sol";

/**
 * @title InnovationUnits
 * @dev ERC-1155 token for representing Innovation Units (IUs) for multiple projects
 * Each token ID represents a different project's Innovation Units
 *
 * Note: This contract implements all functions defined in IInnovationUnits interface
 * but doesn't explicitly inherit from it to avoid duplicate event definitions.
 * All functionality remains the same.
 */
contract InnovationUnits is ERC1155Supply, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Project counter for generating unique IDs
    uint256 private _projectCounter = 0;

    // CEL token reference
    IERC20 public celToken;

    // Protocol treasury address
    address public protocolTreasuryAddress;

    // Project treasury balances tracking
    mapping(uint256 => uint256) public projectTreasuryBalances;

    // Project struct to store all project-specific data
    struct ProjectData {
        uint256 projectId;
        uint256 totalSupply;
        uint256 initialPrice;
        uint256 creatorsAllocatedPercentage;
        uint256 contributorsReservePercentage;
        uint256 investorsReservePercentage;
        string name;
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

    // Treasury-related events
    event ProjectTreasuryUpdated(
        uint256 indexed projectId,
        uint256 previousBalance,
        uint256 newBalance
    );
    event LiquidityAdded(
        uint256 indexed projectId,
        address indexed provider,
        uint256 amount
    );
    event LiquidityRemoved(
        uint256 indexed projectId,
        address indexed recipient,
        uint256 amount
    );
    event ProtocolTreasuryUpdated(address oldTreasury, address newTreasury);

    /**
     * @dev Constructor
     * @param _uri Base URI for token metadata
     * @param _celToken Address of the CEL token (optional, can be set later via initialize)
     * @param _protocolTreasury Address of the protocol treasury (optional, can be set later via initialize)
     */
    constructor(
        string memory _uri,
        address _celToken,
        address _protocolTreasury
    ) ERC1155(_uri) {
        // Allow empty addresses for backward compatibility with existing deployments
        if (_celToken != address(0)) {
            celToken = IERC20(_celToken);
        }

        if (_protocolTreasury != address(0)) {
            protocolTreasuryAddress = _protocolTreasury;
        }
    }

    /**
     * @dev Initialize the contract with CEL token and protocol treasury addresses
     * This function can be called if these weren't set in the constructor
     * @param _celToken CEL token address
     * @param _protocolTreasury Protocol treasury address
     */
    function initialize(
        address _celToken,
        address _protocolTreasury
    ) external onlyOwner {
        require(_celToken != address(0), "Invalid CEL token address");
        require(
            _protocolTreasury != address(0),
            "Invalid protocol treasury address"
        );

        // Only allow setting these once
        require(address(celToken) == address(0), "CEL token already set");
        require(
            protocolTreasuryAddress == address(0),
            "Protocol treasury already set"
        );

        celToken = IERC20(_celToken);
        protocolTreasuryAddress = _protocolTreasury;
    }

    /**
     * @dev Modifier to check if the project exists
     */
    modifier projectExists(uint256 projectId) {
        require(projects[projectId].exists, "Project does not exist");
        _;
    }

    /**
     * @dev Modifier to check if the caller is a creator of the project
     */
    modifier onlyProjectCreator(uint256 projectId) {
        require(projects[projectId].exists, "Project does not exist");
        require(
            creatorShares[projectId][msg.sender] > 0,
            "Not a project creator"
        );
        _;
    }

    /**
     * @dev Creates a new project and assigns a unique token ID for its IUs
     * Also automatically mints tokens to creators based on their shares
     * @param _totalSupply Total supply of Innovation Units for this project
     * @param _initialPrice Initial price per IU in wei
     * @param _creators Array of creator addresses
     * @param _creatorShares Array of creator shares (in percentage of creator allocation)
     * @param _creatorsAllocatedPercentage Percentage allocated to creators (in basis points)
     * @param _contributorsReservePercentage Percentage allocated to contributors (in basis points)
     * @param _investorsReservePercentage Percentage allocated to investors (in basis points)
     * @param _projectName Name of the project
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
        string memory _projectName
    ) external nonReentrant returns (uint256 projectId) {
        require(
            _creators.length == _creatorShares.length,
            "Creator arrays length mismatch"
        );
        require(_creators.length > 0, "At least one creator required");
        require(bytes(_projectName).length > 0, "Project name cannot be empty");

        uint256 totalCreatorShares = 0;
        for (uint256 i = 0; i < _creatorShares.length; i++) {
            totalCreatorShares = totalCreatorShares.add(_creatorShares[i]);
        }

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
            name: _projectName,
            exists: true
        });

        // Initialize project treasury balance
        projectTreasuryBalances[projectId] = 0;

        // Store creator information
        projectCreators[projectId] = _creators;
        for (uint256 i = 0; i < _creators.length; i++) {
            creatorShares[projectId][_creators[i]] = _creatorShares[i];
        }

        emit ProjectRegistered(projectId, msg.sender, _totalSupply);

        // Automatically mint tokens to creators
        _mintToCreators(projectId);

        return projectId;
    }

    /**
     * @dev Internal function to mint IUs to creators based on their specified shares
     * @param projectId The project ID (token ID) of the IUs
     */
    function _mintToCreators(uint256 projectId) internal {
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
     * @dev Legacy function for backward compatibility, now all minting happens in createProject
     * @param projectId The project ID (token ID) of the IUs
     */
    function mintToCreators(
        uint256 projectId
    ) external projectExists(projectId) onlyOwner {
        require(creatorsMinted[projectId] == 0, "Creators already minted");
        _mintToCreators(projectId);
    }

    /**
     * @dev Mints IUs to a contributor - can only be called by project creators
     * @param projectId The project ID (token ID) of the IUs
     * @param contributor Address of the contributor
     * @param amount Amount of IUs to mint
     */
    function mintToContributor(
        uint256 projectId,
        address contributor,
        uint256 amount
    ) external projectExists(projectId) onlyProjectCreator(projectId) {
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
     * @dev Calculate total cost (including fees) for buying a specific amount of IUs
     * @param projectId The project ID (token ID) of the IUs
     * @param amount Amount of IUs to buy
     * @return basePayment The base cost without fees
     * @return fee The fee amount
     * @return totalCost The total cost including fees
     */
    function calculateBuyingCost(
        uint256 projectId,
        uint256 amount
    )
        public
        view
        projectExists(projectId)
        returns (uint256 basePayment, uint256 fee, uint256 totalCost)
    {
        require(amount > 0, "Amount must be greater than 0");

        ProjectData storage project = projects[projectId];

        // Calculate payment amounts
        basePayment = amount.mul(project.initialPrice);
        fee = basePayment.mul(buyFeePercentage).div(10000);
        totalCost = basePayment.add(fee);

        return (basePayment, fee, totalCost);
    }

    /**
     * @dev Buy IUs directly with CEL tokens
     * @param projectId The project ID (token ID) of the IUs
     * @param amount Amount of IUs to buy
     * @return totalCost Total cost paid in CEL tokens
     * @return feePaid Fee amount paid to protocol treasury
     */
    function buyIUs(
        uint256 projectId,
        uint256 amount
    )
        external
        projectExists(projectId)
        nonReentrant
        returns (uint256 totalCost, uint256 feePaid)
    {
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

        // Calculate payment amounts using the new function
        (
            uint256 basePayment,
            uint256 fee,
            uint256 totalCost
        ) = calculateBuyingCost(projectId, amount);
        feePaid = fee;

        // Transfer CEL tokens from buyer to this contract
        celToken.safeTransferFrom(msg.sender, address(this), totalCost);

        // Send fee to protocol treasury
        celToken.safeTransfer(protocolTreasuryAddress, fee);

        // Update project treasury balance
        uint256 previousBalance = projectTreasuryBalances[projectId];
        projectTreasuryBalances[projectId] = previousBalance.add(basePayment);

        emit ProjectTreasuryUpdated(
            projectId,
            previousBalance,
            projectTreasuryBalances[projectId]
        );

        // Handle token minting
        _mint(msg.sender, projectId, amount, "");
        investorsMinted[projectId] = investorsMinted[projectId].add(amount);

        // Track investor information
        if (investorAmounts[projectId][msg.sender] == 0) {
            projectInvestors[projectId].push(msg.sender);
        }
        investorAmounts[projectId][msg.sender] = investorAmounts[projectId][
            msg.sender
        ].add(amount);

        emit IUBought(projectId, msg.sender, amount, project.initialPrice);

        return (totalCost, fee);
    }

    /**
     * @dev Calculate return amount (after fees) for selling a specific amount of IUs
     * @param projectId The project ID (token ID) of the IUs
     * @param amount Amount of IUs to sell
     * @return baseReturn The base return without fees
     * @return fee The fee amount
     * @return netReturn The net return after fees
     */
    function calculateSellingReturn(
        uint256 projectId,
        uint256 amount
    )
        public
        view
        projectExists(projectId)
        returns (uint256 baseReturn, uint256 fee, uint256 netReturn)
    {
        require(amount > 0, "Amount must be greater than 0");

        ProjectData storage project = projects[projectId];

        // Calculate return amounts
        baseReturn = amount.mul(project.initialPrice);
        fee = baseReturn.mul(sellFeePercentage).div(10000);
        netReturn = baseReturn.sub(fee);

        return (baseReturn, fee, netReturn);
    }

    /**
     * @dev Sell IUs for CEL tokens
     * @param projectId The project ID (token ID) of the IUs
     * @param amount Amount of IUs to sell
     * @return amountReceived Amount received in CEL tokens
     * @return feePaid Fee amount paid to protocol treasury
     */
    function sellIUs(
        uint256 projectId,
        uint256 amount
    )
        external
        projectExists(projectId)
        nonReentrant
        returns (uint256 amountReceived, uint256 feePaid)
    {
        require(amount > 0, "Amount must be greater than 0");
        require(
            balanceOf(msg.sender, projectId) >= amount,
            "Insufficient balance"
        );

        // Calculate return amounts using the new function
        (
            uint256 baseReturn,
            uint256 fee,
            uint256 netReturn
        ) = calculateSellingReturn(projectId, amount);
        amountReceived = netReturn;
        feePaid = fee;

        // Ensure project treasury has enough balance
        require(
            projectTreasuryBalances[projectId] >= baseReturn,
            "Insufficient project treasury balance"
        );

        // Update tracking based on seller type
        if (investorAmounts[projectId][msg.sender] > 0) {
            // If the seller is an investor, update their tracking
            investorAmounts[projectId][msg.sender] = investorAmounts[projectId][
                msg.sender
            ] > amount
                ? investorAmounts[projectId][msg.sender].sub(amount)
                : 0;
        } else if (contributorAmounts[projectId][msg.sender] > 0) {
            // If the seller is a contributor, update their tracking
            contributorAmounts[projectId][msg.sender] = contributorAmounts[
                projectId
            ][msg.sender] > amount
                ? contributorAmounts[projectId][msg.sender].sub(amount)
                : 0;
        } else if (creatorShares[projectId][msg.sender] > 0) {
            // If the seller is a creator, track how many IUs they've sold
            creatorSoldAmounts[projectId][msg.sender] = creatorSoldAmounts[
                projectId
            ][msg.sender].add(amount);
        }

        // Update project treasury balance
        uint256 previousBalance = projectTreasuryBalances[projectId];
        projectTreasuryBalances[projectId] = previousBalance.sub(baseReturn);

        emit ProjectTreasuryUpdated(
            projectId,
            previousBalance,
            projectTreasuryBalances[projectId]
        );

        // Send fee to protocol treasury
        celToken.safeTransfer(protocolTreasuryAddress, fee);

        // Send net return to seller
        celToken.safeTransfer(msg.sender, netReturn);

        // Burn the tokens
        _burn(msg.sender, projectId, amount);

        emit IUSold(projectId, msg.sender, amount, netReturn);

        return (amountReceived, feePaid);
    }

    /**
     * @dev Add liquidity to a project treasury
     * @param projectId The project ID (token ID) of the IUs
     * @param amount Amount of CEL tokens to add
     */
    function addLiquidity(
        uint256 projectId,
        uint256 amount
    ) external projectExists(projectId) nonReentrant {
        require(amount > 0, "Amount must be greater than 0");

        // Transfer CEL tokens from provider to this contract
        celToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update project treasury balance
        uint256 previousBalance = projectTreasuryBalances[projectId];
        projectTreasuryBalances[projectId] = previousBalance.add(amount);

        emit ProjectTreasuryUpdated(
            projectId,
            previousBalance,
            projectTreasuryBalances[projectId]
        );

        emit LiquidityAdded(projectId, msg.sender, amount);
    }

    /**
     * @dev Remove liquidity from a project treasury (owner only)
     * @param projectId The project ID
     * @param amount Amount of CEL tokens to remove
     * @param recipient Recipient address
     */
    function removeLiquidity(
        uint256 projectId,
        uint256 amount,
        address recipient
    ) external projectExists(projectId) onlyOwner nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(recipient != address(0), "Invalid recipient address");
        require(
            projectTreasuryBalances[projectId] >= amount,
            "Insufficient project treasury balance"
        );

        // Update project treasury balance
        uint256 previousBalance = projectTreasuryBalances[projectId];
        projectTreasuryBalances[projectId] = previousBalance.sub(amount);

        // Transfer CEL tokens to recipient
        celToken.safeTransfer(recipient, amount);

        emit ProjectTreasuryUpdated(
            projectId,
            previousBalance,
            projectTreasuryBalances[projectId]
        );

        emit LiquidityRemoved(projectId, recipient, amount);
    }

    /**
     * @dev Update the protocol treasury address
     * @param _protocolTreasuryAddress New address for the protocol treasury
     */
    function setProtocolTreasuryAddress(
        address _protocolTreasuryAddress
    ) external onlyOwner {
        require(
            _protocolTreasuryAddress != address(0),
            "Invalid treasury address"
        );

        address oldTreasury = protocolTreasuryAddress;
        protocolTreasuryAddress = _protocolTreasuryAddress;

        emit ProtocolTreasuryUpdated(oldTreasury, _protocolTreasuryAddress);
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
            uint256 treasuryBalance,
            string memory name
        )
    {
        ProjectData storage project = projects[projectId];
        return (
            project.totalSupply,
            project.initialPrice,
            project.creatorsAllocatedPercentage,
            project.contributorsReservePercentage,
            project.investorsReservePercentage,
            projectTreasuryBalances[projectId],
            project.name
        );
    }

    /**
     * @dev Returns the project name
     * @param projectId The project ID to query
     * @return name The name of the project
     */
    function getProjectName(
        uint256 projectId
    ) external view projectExists(projectId) returns (string memory name) {
        return projects[projectId].name;
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
        uint256 oldFee = sellFeePercentage;
        sellFeePercentage = _sellFeePercentage;
        emit FeeUpdated("sell", oldFee, _sellFeePercentage);
    }

    /**
     * @dev Check if the contract is ready for direct use without Factory
     * @return isReady Whether the contract is fully initialized
     * @return missingComponent What component is missing, if any ("" means all good)
     */
    function isReadyForDirectUse()
        external
        view
        returns (bool isReady, string memory missingComponent)
    {
        if (address(celToken) == address(0)) {
            return (false, "CEL token not set");
        }

        if (protocolTreasuryAddress == address(0)) {
            return (false, "Protocol treasury not set");
        }

        return (true, "");
    }

    /**
     * @dev Rescue CEL tokens accidentally sent to the contract without going through proper functions
     * Will NOT allow removing tokens from project treasuries
     * @param amount Amount to rescue
     * @param recipient Address to send the tokens to
     */
    function rescueCEL(
        uint256 amount,
        address recipient
    ) external onlyOwner nonReentrant {
        require(recipient != address(0), "Invalid recipient");

        // Calculate total treasury balance across all projects
        uint256 totalProjectTreasuries = 0;
        for (uint256 i = 0; i < _projectCounter; i++) {
            if (projects[i].exists) {
                totalProjectTreasuries = totalProjectTreasuries.add(
                    projectTreasuryBalances[i]
                );
            }
        }

        // Calculate excess CEL that can be rescued
        uint256 contractBalance = celToken.balanceOf(address(this));
        require(
            contractBalance > totalProjectTreasuries,
            "No excess CEL to rescue"
        );

        uint256 rescuableAmount = contractBalance.sub(totalProjectTreasuries);
        require(amount <= rescuableAmount, "Cannot rescue treasury CEL");

        // Transfer the tokens
        celToken.safeTransfer(recipient, amount);
    }

    /**
     * @dev Emergency function to withdraw any other token than CEL
     * @param token Address of the token to withdraw
     * @param amount Amount to withdraw
     * @param recipient Address to send the tokens to
     */
    function rescueToken(
        address token,
        uint256 amount,
        address recipient
    ) external onlyOwner nonReentrant {
        require(token != address(celToken), "Use rescueCEL for CEL tokens");
        require(recipient != address(0), "Invalid recipient");

        IERC20(token).safeTransfer(recipient, amount);
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

    /**
     * @dev Get the actual total supply of minted tokens for a specific project
     * @param projectId The project ID to query
     * @return The total number of minted tokens in circulation for this project
     */
    function getTotalSupply(
        uint256 projectId
    ) external view projectExists(projectId) returns (uint256) {
        // Use the built-in totalSupply function from ERC1155Supply
        return totalSupply(projectId);
    }
}
