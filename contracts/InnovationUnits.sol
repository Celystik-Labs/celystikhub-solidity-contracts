// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IInnovationUnits.sol";
import "./interfaces/ICELToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title InnovationUnits
 * @dev Implementation of the Innovation Units (IU) contract that manages project tokens
 */
contract InnovationUnits is IInnovationUnits, Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    // Constants
    uint256 private constant PRECISION = 1e18;
    uint256 private constant HUNDRED_PERCENT = 100 * PRECISION;

    // CEL Token contract
    ICELToken public celToken;

    // Mapping of projectId to ProjectIUConfig
    mapping(uint256 => ProjectIUConfig) public projectConfigs;

    // Mapping of projectId to user address to IU balance
    mapping(uint256 => mapping(address => uint256)) private balances;

    // Mapping of projectId to array of holder addresses
    mapping(uint256 => address[]) private projectHolders;

    // Mapping to track if an address is already a holder for a project
    mapping(uint256 => mapping(address => bool)) private isHolder;

    /**
     * @dev Constructor to initialize the InnovationUnits contract
     * @param _celToken Address of the CEL token
     */
    constructor(address _celToken) {
        require(
            _celToken != address(0),
            "InnovationUnits: zero address provided for token"
        );
        celToken = ICELToken(_celToken);
    }

    /**
     * @dev Creates a new project with IU configuration
     * @param projectId ID of the project
     * @param totalSupply Total supply of IUs for the project
     * @param creatorShare Percentage of IUs allocated to creator (scaled by PRECISION)
     * @param contributorReserve Percentage of IUs reserved for contributors (scaled by PRECISION)
     * @param investorReserve Percentage of IUs reserved for investors (scaled by PRECISION)
     * @param pricePerUnit Price per IU in CEL tokens
     * @return bool indicating if the creation was successful
     */
    function createProject(
        uint256 projectId,
        uint256 totalSupply,
        uint256 creatorShare,
        uint256 contributorReserve,
        uint256 investorReserve,
        uint256 pricePerUnit
    ) external override onlyOwner returns (bool) {
        require(
            projectId > 0,
            "InnovationUnits: project ID must be greater than zero"
        );
        require(
            !projectExists(projectId),
            "InnovationUnits: project already exists"
        );
        require(
            totalSupply > 0,
            "InnovationUnits: total supply must be greater than zero"
        );
        require(
            creatorShare.add(contributorReserve).add(investorReserve) ==
                HUNDRED_PERCENT,
            "InnovationUnits: shares must add up to 100%"
        );
        require(
            pricePerUnit > 0,
            "InnovationUnits: price per unit must be greater than zero"
        );

        // Create project configuration
        projectConfigs[projectId] = ProjectIUConfig({
            totalSupply: totalSupply,
            creatorShare: creatorShare,
            contributorReserve: contributorReserve,
            investorReserve: investorReserve,
            pricePerUnit: pricePerUnit,
            mintedToCreator: 0,
            mintedToContributors: 0,
            mintedToInvestors: 0,
            isActive: true
        });

        emit ProjectCreated(
            projectId,
            totalSupply,
            creatorShare,
            contributorReserve,
            investorReserve,
            pricePerUnit
        );

        return true;
    }

    /**
     * @dev Allocates IUs to a creator after project creation
     * @param creator Address of the creator
     * @param projectId ID of the project
     * @return bool indicating if the allocation was successful
     */
    function allocateToCreator(
        address creator,
        uint256 projectId
    ) external onlyOwner returns (bool) {
        require(
            projectExists(projectId),
            "InnovationUnits: project does not exist"
        );
        require(
            creator != address(0),
            "InnovationUnits: cannot allocate to zero address"
        );

        ProjectIUConfig storage config = projectConfigs[projectId];
        require(config.isActive, "InnovationUnits: project is not active");
        require(
            config.mintedToCreator == 0,
            "InnovationUnits: creator allocation already done"
        );

        uint256 creatorAmount = config.totalSupply.mul(config.creatorShare).div(
            HUNDRED_PERCENT
        );
        require(
            creatorAmount > 0,
            "InnovationUnits: creator allocation amount is zero"
        );

        // Update project configuration
        config.mintedToCreator = creatorAmount;

        // Allocate IUs to creator
        _mint(creator, projectId, creatorAmount);

        return true;
    }

    /**
     * @dev Allocates IUs to a contributor for completing a task
     * @param contributor Address of the contributor
     * @param projectId ID of the project
     * @param amount Amount of IUs to allocate
     * @return bool indicating if the allocation was successful
     */
    function allocateToContributor(
        address contributor,
        uint256 projectId,
        uint256 amount
    ) external override onlyOwner returns (bool) {
        require(
            projectExists(projectId),
            "InnovationUnits: project does not exist"
        );
        require(
            contributor != address(0),
            "InnovationUnits: cannot allocate to zero address"
        );
        require(
            amount > 0,
            "InnovationUnits: allocation amount must be greater than zero"
        );

        ProjectIUConfig storage config = projectConfigs[projectId];
        require(config.isActive, "InnovationUnits: project is not active");

        uint256 contributorReserveAmount = config
            .totalSupply
            .mul(config.contributorReserve)
            .div(HUNDRED_PERCENT);
        require(
            config.mintedToContributors.add(amount) <= contributorReserveAmount,
            "InnovationUnits: contributor reserve limit exceeded"
        );

        // Update project configuration
        config.mintedToContributors = config.mintedToContributors.add(amount);

        // Allocate IUs to contributor
        _mint(contributor, projectId, amount);

        emit ContributorAllocation(projectId, contributor, amount);

        return true;
    }

    /**
     * @dev Allows a user to purchase IUs with CEL tokens
     * @param projectId ID of the project
     * @param amount Amount of IUs to purchase
     * @return bool indicating if the purchase was successful
     */
    function purchaseIUs(
        uint256 projectId,
        uint256 amount
    ) external override nonReentrant returns (bool) {
        require(
            projectExists(projectId),
            "InnovationUnits: project does not exist"
        );
        require(
            amount > 0,
            "InnovationUnits: purchase amount must be greater than zero"
        );

        ProjectIUConfig storage config = projectConfigs[projectId];
        require(config.isActive, "InnovationUnits: project is not active");

        uint256 investorReserveAmount = config
            .totalSupply
            .mul(config.investorReserve)
            .div(HUNDRED_PERCENT);
        require(
            config.mintedToInvestors.add(amount) <= investorReserveAmount,
            "InnovationUnits: investor reserve limit exceeded"
        );

        // Calculate CEL token amount required for purchase
        uint256 celAmount = amount.mul(config.pricePerUnit);

        // Transfer CEL tokens from the buyer to this contract
        require(
            celToken.transferFrom(msg.sender, address(this), celAmount),
            "InnovationUnits: CEL token transfer failed"
        );

        // Update project configuration
        config.mintedToInvestors = config.mintedToInvestors.add(amount);

        // Allocate IUs to investor
        _mint(msg.sender, projectId, amount);

        emit IUsPurchased(projectId, msg.sender, amount, celAmount);

        return true;
    }

    /**
     * @dev Returns the IU balance of a user for a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The user's IU balance
     */
    function balanceOf(
        address user,
        uint256 projectId
    ) external view override returns (uint256) {
        return balances[projectId][user];
    }

    /**
     * @dev Returns the list of IU holders for a project
     * @param projectId ID of the project
     * @return address[] Array of IU holder addresses
     */
    function getHolders(
        uint256 projectId
    ) external view override returns (address[] memory) {
        return projectHolders[projectId];
    }

    /**
     * @dev Returns the ownership share of a user in a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The user's ownership percentage (scaled by PRECISION)
     */
    function getOwnershipShare(
        address user,
        uint256 projectId
    ) external view override returns (uint256) {
        if (!projectExists(projectId)) return 0;
        if (balances[projectId][user] == 0) return 0;

        ProjectIUConfig storage config = projectConfigs[projectId];
        uint256 totalMinted = getTotalMinted(projectId);

        if (totalMinted == 0) return 0;

        return balances[projectId][user].mul(PRECISION).div(totalMinted);
    }

    /**
     * @dev Returns the project's IU configuration
     * @param projectId ID of the project
     * @return ProjectIUConfig The project's IU configuration
     */
    function getProjectConfig(
        uint256 projectId
    ) external view override returns (ProjectIUConfig memory) {
        return projectConfigs[projectId];
    }

    /**
     * @dev Returns if a project has IUs configured
     * @param projectId ID of the project
     * @return bool True if the project has IUs configured
     */
    function projectExists(
        uint256 projectId
    ) public view override returns (bool) {
        return projectConfigs[projectId].totalSupply > 0;
    }

    /**
     * @dev Returns the amount of IUs available for contributors
     * @param projectId ID of the project
     * @return uint256 The amount of IUs available for contributors
     */
    function getAvailableContributorIUs(
        uint256 projectId
    ) external view override returns (uint256) {
        if (!projectExists(projectId)) return 0;

        ProjectIUConfig storage config = projectConfigs[projectId];
        uint256 contributorReserveAmount = config
            .totalSupply
            .mul(config.contributorReserve)
            .div(HUNDRED_PERCENT);

        return contributorReserveAmount.sub(config.mintedToContributors);
    }

    /**
     * @dev Returns the amount of IUs available for investors
     * @param projectId ID of the project
     * @return uint256 The amount of IUs available for investors
     */
    function getAvailableInvestorIUs(
        uint256 projectId
    ) external view override returns (uint256) {
        if (!projectExists(projectId)) return 0;

        ProjectIUConfig storage config = projectConfigs[projectId];
        uint256 investorReserveAmount = config
            .totalSupply
            .mul(config.investorReserve)
            .div(HUNDRED_PERCENT);

        return investorReserveAmount.sub(config.mintedToInvestors);
    }

    /**
     * @dev Returns the total amount of IUs minted for a project
     * @param projectId ID of the project
     * @return uint256 The total amount of minted IUs
     */
    function getTotalMinted(
        uint256 projectId
    ) public view override returns (uint256) {
        ProjectIUConfig storage config = projectConfigs[projectId];
        return
            config.mintedToCreator.add(config.mintedToContributors).add(
                config.mintedToInvestors
            );
    }

    /**
     * @dev Returns the price of IUs in CEL tokens
     * @param projectId ID of the project
     * @return uint256 The price per IU
     */
    function getPricePerUnit(
        uint256 projectId
    ) external view override returns (uint256) {
        return projectConfigs[projectId].pricePerUnit;
    }

    /**
     * @dev Updates the price per IU for a project
     * @param projectId ID of the project
     * @param newPrice New price per IU in CEL tokens
     * @return bool indicating if the update was successful
     */
    function updatePricePerUnit(
        uint256 projectId,
        uint256 newPrice
    ) external override onlyOwner returns (bool) {
        require(
            projectExists(projectId),
            "InnovationUnits: project does not exist"
        );
        require(
            newPrice > 0,
            "InnovationUnits: price per unit must be greater than zero"
        );

        ProjectIUConfig storage config = projectConfigs[projectId];
        require(config.isActive, "InnovationUnits: project is not active");

        uint256 oldPrice = config.pricePerUnit;
        config.pricePerUnit = newPrice;

        emit PriceUpdated(projectId, oldPrice, newPrice);

        return true;
    }

    /**
     * @dev Transfers IUs from one user to another
     * @param from Address to transfer from
     * @param to Address to transfer to
     * @param projectId ID of the project
     * @param amount Amount of IUs to transfer
     * @return bool indicating if the transfer was successful
     */
    function transferIUs(
        address from,
        address to,
        uint256 projectId,
        uint256 amount
    ) external override returns (bool) {
        require(
            from != address(0),
            "InnovationUnits: transfer from the zero address"
        );
        require(
            to != address(0),
            "InnovationUnits: transfer to the zero address"
        );
        require(
            projectExists(projectId),
            "InnovationUnits: project does not exist"
        );
        require(
            amount > 0,
            "InnovationUnits: transfer amount must be greater than zero"
        );

        // If the sender is not the owner, check that they are transferring their own IUs
        if (msg.sender != owner()) {
            require(
                from == msg.sender,
                "InnovationUnits: can only transfer own IUs"
            );
        }

        ProjectIUConfig storage config = projectConfigs[projectId];
        require(config.isActive, "InnovationUnits: project is not active");
        require(
            balances[projectId][from] >= amount,
            "InnovationUnits: transfer amount exceeds balance"
        );

        // Update balances
        balances[projectId][from] = balances[projectId][from].sub(amount);
        balances[projectId][to] = balances[projectId][to].add(amount);

        // Add 'to' address to holders if not already there
        if (!isHolder[projectId][to]) {
            projectHolders[projectId].push(to);
            isHolder[projectId][to] = true;
        }

        emit IUsTransferred(projectId, from, to, amount);

        return true;
    }

    /**
     * @dev Activates or deactivates a project
     * @param projectId ID of the project
     * @param active Whether the project should be active
     * @return bool indicating if the update was successful
     */
    function setProjectActive(
        uint256 projectId,
        bool active
    ) external onlyOwner returns (bool) {
        require(
            projectExists(projectId),
            "InnovationUnits: project does not exist"
        );

        projectConfigs[projectId].isActive = active;

        return true;
    }

    /**
     * @dev Withdraws CEL tokens from the contract to the owner
     * @param amount Amount of CEL tokens to withdraw
     * @return bool indicating if the withdrawal was successful
     */
    function withdrawCEL(uint256 amount) external onlyOwner returns (bool) {
        require(
            amount > 0,
            "InnovationUnits: withdrawal amount must be greater than zero"
        );
        require(
            celToken.transfer(owner(), amount),
            "InnovationUnits: CEL token transfer failed"
        );

        return true;
    }

    /**
     * @dev Internal function to mint IUs to a user
     * @param to Address to mint IUs to
     * @param projectId ID of the project
     * @param amount Amount of IUs to mint
     */
    function _mint(address to, uint256 projectId, uint256 amount) internal {
        require(to != address(0), "InnovationUnits: mint to the zero address");

        // Update the user's balance
        balances[projectId][to] = balances[projectId][to].add(amount);

        // Add the user to the list of holders if not already there
        if (!isHolder[projectId][to]) {
            projectHolders[projectId].push(to);
            isHolder[projectId][to] = true;
        }
    }
}
