// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IProjectFactory.sol";
import "./interfaces/IInnovationUnits.sol";
import "./interfaces/IStaking.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ProjectFactory
 * @dev Implementation of the Project Factory that manages project creation and assignment
 */
contract ProjectFactory is IProjectFactory, Ownable, ReentrancyGuard {
    // Innovation Units contract
    IInnovationUnits public innovationUnits;

    // Staking contract
    IStaking public staking;

    // Track the number of projects
    uint256 private projectCount;

    // Track project existence
    mapping(uint256 => bool) private projectRegistry;

    /**
     * @dev Constructor to initialize the ProjectFactory contract
     * @param _innovationUnitsAddress Address of the InnovationUnits contract
     * @param _stakingAddress Address of the Staking contract
     */
    constructor(address _innovationUnitsAddress, address _stakingAddress) {
        require(
            _innovationUnitsAddress != address(0),
            "ProjectFactory: zero address provided for innovation units"
        );
        require(
            _stakingAddress != address(0),
            "ProjectFactory: zero address provided for staking"
        );

        innovationUnits = IInnovationUnits(_innovationUnitsAddress);
        staking = IStaking(_stakingAddress);
        projectCount = 0;
    }

    /**
     * @dev Creates a new project across all contracts
     * @param projectId ID of the project
     * @param creatorShare Percentage of IUs allocated to creator (in basis points, 1% = 100)
     * @param contributorShare Percentage of IUs reserved for contributors (in basis points)
     * @param investorShare Percentage of IUs reserved for investors (in basis points)
     * @param totalSupply Total supply of IUs for the project
     * @param pricePerUnit Price per IU in CEL tokens
     * @param stakeLimit Maximum stake limit for the project (0 = no limit)
     * @return bool indicating if the creation was successful
     */
    function createProject(
        uint256 projectId,
        uint256 creatorShare,
        uint256 contributorShare,
        uint256 investorShare,
        uint256 totalSupply,
        uint256 pricePerUnit,
        uint256 stakeLimit
    ) external override onlyOwner returns (bool) {
        require(
            projectId > 0,
            "ProjectFactory: project ID must be greater than zero"
        );
        require(
            !projectRegistry[projectId],
            "ProjectFactory: project already exists"
        );
        require(
            creatorShare + contributorShare + investorShare == 10000,
            "ProjectFactory: shares must add up to 10000 basis points (100%)"
        );

        // Create project in InnovationUnits contract
        bool iuSuccess = innovationUnits.createProject(
            projectId,
            totalSupply,
            creatorShare,
            contributorShare,
            investorShare,
            pricePerUnit
        );
        require(
            iuSuccess,
            "ProjectFactory: failed to create project in InnovationUnits"
        );

        // Create staking pool for the project
        bool stakingSuccess = staking.createStakingPool(
            projectId,
            stakeLimit,
            7 days // Default minimum staking period
        );
        require(
            stakingSuccess,
            "ProjectFactory: failed to create staking pool"
        );

        // Register the project
        projectRegistry[projectId] = true;
        projectCount++;

        emit ProjectCreated(
            projectId,
            creatorShare,
            contributorShare,
            investorShare,
            totalSupply,
            pricePerUnit,
            stakeLimit
        );

        return true;
    }

    /**
     * @dev Updates an existing project (currently only staking parameters can be updated)
     * @param projectId ID of the project
     * @param stakeLimit Maximum stake limit for the project (0 = no limit)
     * @param active Whether the project should be active
     * @return bool indicating if the update was successful
     */
    function updateProject(
        uint256 projectId,
        uint256 stakeLimit,
        bool active
    ) external override onlyOwner returns (bool) {
        require(
            projectRegistry[projectId],
            "ProjectFactory: project does not exist"
        );

        // Update staking pool parameters
        bool stakingUpdated = staking.updateStakingPool(
            projectId,
            stakeLimit,
            active,
            7 days // Default minimum staking period
        );
        require(
            stakingUpdated,
            "ProjectFactory: failed to update staking pool"
        );

        // Set project active/inactive in InnovationUnits if needed
        bool iuUpdated = innovationUnits.setProjectActive(projectId, active);
        require(
            iuUpdated,
            "ProjectFactory: failed to update project status in InnovationUnits"
        );

        emit ProjectUpdated(projectId, stakeLimit, active);

        return true;
    }

    /**
     * @dev Assigns a creator to a project
     * @param projectId ID of the project
     * @param creator Address of the creator
     * @return bool indicating if the assignment was successful
     */
    function assignCreator(
        uint256 projectId,
        address creator
    ) external override onlyOwner returns (bool) {
        require(
            projectRegistry[projectId],
            "ProjectFactory: project does not exist"
        );
        require(
            creator != address(0),
            "ProjectFactory: cannot assign to zero address"
        );

        // Allocate IUs to creator
        bool success = innovationUnits.allocateToCreator(creator, projectId);
        require(success, "ProjectFactory: failed to assign creator");

        emit CreatorAssigned(projectId, creator);

        return true;
    }

    /**
     * @dev Assigns a contributor to a project
     * @param projectId ID of the project
     * @param contributor Address of the contributor
     * @param amount Amount of IUs to allocate
     * @return bool indicating if the assignment was successful
     */
    function assignContributor(
        uint256 projectId,
        address contributor,
        uint256 amount
    ) external override onlyOwner returns (bool) {
        require(
            projectRegistry[projectId],
            "ProjectFactory: project does not exist"
        );
        require(
            contributor != address(0),
            "ProjectFactory: cannot assign to zero address"
        );
        require(amount > 0, "ProjectFactory: amount must be greater than zero");

        // Allocate IUs to contributor
        bool success = innovationUnits.allocateToContributor(
            contributor,
            projectId,
            amount
        );
        require(success, "ProjectFactory: failed to assign contributor");

        emit ContributorAssigned(projectId, contributor, amount);

        return true;
    }

    /**
     * @dev Checks if a project exists
     * @param projectId ID of the project
     * @return bool indicating if the project exists
     */
    function projectExists(
        uint256 projectId
    ) external view override returns (bool) {
        return projectRegistry[projectId];
    }

    /**
     * @dev Returns the number of projects
     * @return uint256 the number of projects
     */
    function getProjectCount() external view override returns (uint256) {
        return projectCount;
    }

    /**
     * @dev Updates the address of the InnovationUnits contract
     * Only the contract owner can call this function
     * @param _innovationUnitsAddress New address of the InnovationUnits contract
     */
    function setInnovationUnitsAddress(
        address _innovationUnitsAddress
    ) external onlyOwner {
        require(
            _innovationUnitsAddress != address(0),
            "ProjectFactory: zero address provided"
        );
        innovationUnits = IInnovationUnits(_innovationUnitsAddress);
    }

    /**
     * @dev Updates the address of the Staking contract
     * Only the contract owner can call this function
     * @param _stakingAddress New address of the Staking contract
     */
    function setStakingAddress(address _stakingAddress) external onlyOwner {
        require(
            _stakingAddress != address(0),
            "ProjectFactory: zero address provided"
        );
        staking = IStaking(_stakingAddress);
    }
}
