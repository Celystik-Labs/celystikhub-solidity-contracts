// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IProjectFactory
 * @dev Interface for the ProjectFactory that manages project creation and assignment
 */
interface IProjectFactory {
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
    ) external returns (bool);

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
    ) external returns (bool);

    /**
     * @dev Assigns a creator to a project
     * @param projectId ID of the project
     * @param creator Address of the creator
     * @return bool indicating if the assignment was successful
     */
    function assignCreator(
        uint256 projectId,
        address creator
    ) external returns (bool);

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
    ) external returns (bool);

    /**
     * @dev Checks if a project exists
     * @param projectId ID of the project
     * @return bool indicating if the project exists
     */
    function projectExists(uint256 projectId) external view returns (bool);

    /**
     * @dev Returns the number of projects
     * @return uint256 the number of projects
     */
    function getProjectCount() external view returns (uint256);

    /**
     * @dev Project created event
     */
    event ProjectCreated(
        uint256 indexed projectId,
        uint256 creatorShare,
        uint256 contributorShare,
        uint256 investorShare,
        uint256 totalSupply,
        uint256 pricePerUnit,
        uint256 stakeLimit
    );

    /**
     * @dev Project updated event
     */
    event ProjectUpdated(
        uint256 indexed projectId,
        uint256 stakeLimit,
        bool active
    );

    /**
     * @dev Creator assigned event
     */
    event CreatorAssigned(uint256 indexed projectId, address indexed creator);

    /**
     * @dev Contributor assigned event
     */
    event ContributorAssigned(
        uint256 indexed projectId,
        address indexed contributor,
        uint256 amount
    );
}
