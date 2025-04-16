// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IInnovationUnits
 * @dev Interface for the Innovation Units (IU) contract that manages project tokens
 */
interface IInnovationUnits {
    /**
     * @dev Struct to represent a project's IU configuration
     */
    struct ProjectIUConfig {
        uint256 totalSupply; // Total supply of IUs for this project
        uint256 creatorShare; // Percentage of IUs allocated to creator (scaled by PRECISION)
        uint256 contributorReserve; // Percentage of IUs reserved for contributors (scaled by PRECISION)
        uint256 investorReserve; // Percentage of IUs reserved for investors (scaled by PRECISION)
        uint256 pricePerUnit; // Price per IU in CEL tokens
        uint256 mintedToCreator; // Amount of IUs already minted to creator
        uint256 mintedToContributors; // Amount of IUs already minted to contributors
        uint256 mintedToInvestors; // Amount of IUs already minted to investors
        bool isActive; // Whether the project is active
    }

    /**
     * @dev Creates a new project with IU configuration
     * @param projectId ID of the project
     * @param totalSupply Total supply of IUs for the project
     * @param creatorShare Percentage of IUs allocated to creator
     * @param contributorReserve Percentage of IUs reserved for contributors
     * @param investorReserve Percentage of IUs reserved for investors
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
    ) external returns (bool);

    /**
     * @dev Allocates IUs to a creator after project creation
     * @param creator Address of the creator
     * @param projectId ID of the project
     * @return bool indicating if the allocation was successful
     */
    function allocateToCreator(
        address creator,
        uint256 projectId
    ) external returns (bool);

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
    ) external returns (bool);

    /**
     * @dev Allows a user to purchase IUs with CEL tokens
     * @param projectId ID of the project
     * @param amount Amount of IUs to purchase
     * @return bool indicating if the purchase was successful
     */
    function purchaseIUs(
        uint256 projectId,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Returns the IU balance of a user for a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The user's IU balance
     */
    function balanceOf(
        address user,
        uint256 projectId
    ) external view returns (uint256);

    /**
     * @dev Returns the list of IU holders for a project
     * @param projectId ID of the project
     * @return address[] Array of IU holder addresses
     */
    function getHolders(
        uint256 projectId
    ) external view returns (address[] memory);

    /**
     * @dev Returns the ownership share of a user in a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The user's ownership percentage (scaled by PRECISION)
     */
    function getOwnershipShare(
        address user,
        uint256 projectId
    ) external view returns (uint256);

    /**
     * @dev Returns the project's IU configuration
     * @param projectId ID of the project
     * @return ProjectIUConfig The project's IU configuration
     */
    function getProjectConfig(
        uint256 projectId
    ) external view returns (ProjectIUConfig memory);

    /**
     * @dev Returns if a project has IUs configured
     * @param projectId ID of the project
     * @return bool True if the project has IUs configured
     */
    function projectExists(uint256 projectId) external view returns (bool);

    /**
     * @dev Returns the amount of IUs available for contributors
     * @param projectId ID of the project
     * @return uint256 The amount of IUs available for contributors
     */
    function getAvailableContributorIUs(
        uint256 projectId
    ) external view returns (uint256);

    /**
     * @dev Returns the amount of IUs available for investors
     * @param projectId ID of the project
     * @return uint256 The amount of IUs available for investors
     */
    function getAvailableInvestorIUs(
        uint256 projectId
    ) external view returns (uint256);

    /**
     * @dev Returns the total amount of IUs minted for a project
     * @param projectId ID of the project
     * @return uint256 The total amount of minted IUs
     */
    function getTotalMinted(uint256 projectId) external view returns (uint256);

    /**
     * @dev Returns the price of IUs in CEL tokens
     * @param projectId ID of the project
     * @return uint256 The price per IU
     */
    function getPricePerUnit(uint256 projectId) external view returns (uint256);

    /**
     * @dev Updates the price per IU for a project
     * @param projectId ID of the project
     * @param newPrice New price per IU in CEL tokens
     * @return bool indicating if the update was successful
     */
    function updatePricePerUnit(
        uint256 projectId,
        uint256 newPrice
    ) external returns (bool);

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
    ) external returns (bool);

    /**
     * @dev Activates or deactivates a project
     * @param projectId ID of the project
     * @param active Whether the project should be active
     * @return bool indicating if the update was successful
     */
    function setProjectActive(
        uint256 projectId,
        bool active
    ) external returns (bool);

    /**
     * @dev Emitted when a new project is created with IU configuration
     */
    event ProjectCreated(
        uint256 indexed projectId,
        uint256 totalSupply,
        uint256 creatorShare,
        uint256 contributorReserve,
        uint256 investorReserve,
        uint256 pricePerUnit
    );

    /**
     * @dev Emitted when IUs are allocated to a contributor
     */
    event ContributorAllocation(
        uint256 indexed projectId,
        address indexed contributor,
        uint256 amount
    );

    /**
     * @dev Emitted when IUs are purchased by an investor
     */
    event IUsPurchased(
        uint256 indexed projectId,
        address indexed investor,
        uint256 amount,
        uint256 celPaid
    );

    /**
     * @dev Emitted when IUs are transferred between users
     */
    event IUsTransferred(
        uint256 indexed projectId,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    /**
     * @dev Emitted when the price per IU is updated
     */
    event PriceUpdated(
        uint256 indexed projectId,
        uint256 oldPrice,
        uint256 newPrice
    );
}
