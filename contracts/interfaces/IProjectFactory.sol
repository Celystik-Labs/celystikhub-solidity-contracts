// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IProjectFactory
 * @dev Interface for the CelystikHub Project Factory
 */
interface IProjectFactory {
    // Structs
    struct Project {
        uint256 id;
        string name;
        string description;
        address tokenAddress;
        uint256 totalSupply;
        uint256 pricePerUnit;
        uint256 creatorShare;
        uint256 contributorReserve;
        uint256 investorReserve;
        uint256 createdAt;
        bool active;
    }

    struct Participant {
        uint8 role; // Role of the participant (can be multiple)
        uint256 iuBalance; // Current IU balance
        uint256 totalInvested; // Total CEL tokens invested (for investors)
        uint256 totalContributed; // Total IUs received as contribution
        bool exists; // Whether this participant exists
    }

    // Events
    event ProjectCreated(
        uint256 indexed projectId,
        string name,
        address tokenAddress,
        uint256 totalSupply,
        address[] creators,
        uint256[] creatorShares
    );

    event IUsPurchased(
        uint256 indexed projectId,
        address indexed investor,
        uint256 amount,
        uint256 fee
    );

    event ContributorAllocated(
        uint256 indexed projectId,
        address indexed contributor,
        uint256 amount
    );

    event ProjectPriceUpdated(uint256 indexed projectId, uint256 newPrice);

    event ProjectActiveStatusChanged(uint256 indexed projectId, bool active);

    event IUsSold(
        uint256 indexed projectId,
        address indexed seller,
        uint256 amount,
        uint256 celAmount,
        uint256 fee
    );

    event ProjectLiquidityChanged(
        uint256 indexed projectId,
        uint256 previousLiquidity,
        uint256 newLiquidity
    );

    /**
     * @dev Creates a new project
     * @param name Name of the project
     * @param description Description of the project
     * @param totalSupply Total supply of IUs
     * @param pricePerUnit Price per IU in CEL tokens
     * @param creatorShare Percentage allocated to creators
     * @param contributorReserve Percentage reserved for contributors
     * @param investorReserve Percentage reserved for investors
     * @param creators Array of creator addresses
     * @param creatorShares Array of creator shares
     * @param stakeLimit Maximum stake limit (0 = no limit)
     * @return uint256 The ID of the created project
     */
    function createProject(
        string memory name,
        string memory description,
        uint256 totalSupply,
        uint256 pricePerUnit,
        uint256 creatorShare,
        uint256 contributorReserve,
        uint256 investorReserve,
        address[] memory creators,
        uint256[] memory creatorShares,
        uint256 stakeLimit
    ) external returns (uint256);

    /**
     * @dev Purchases IUs for a project
     * @param projectId ID of the project
     * @param amount Amount of CEL tokens to invest
     * @return bool indicating if the purchase was successful
     */
    function purchaseIUs(
        uint256 projectId,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Allocates IUs to a contributor
     * @param projectId ID of the project
     * @param contributor Address of the contributor
     * @param amount Amount of IUs to allocate
     * @return bool indicating if the allocation was successful
     */
    function allocateToContributor(
        uint256 projectId,
        address contributor,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Updates a project's price per IU
     * @param projectId ID of the project
     * @param newPrice New price per IU
     * @return bool indicating if the update was successful
     */
    function updateProjectPrice(
        uint256 projectId,
        uint256 newPrice
    ) external returns (bool);

    /**
     * @dev Sets a project's active state
     * @param projectId ID of the project
     * @param active New active state
     * @return bool indicating if the update was successful
     */
    function setProjectActive(
        uint256 projectId,
        bool active
    ) external returns (bool);

    /**
     * @dev Returns a project's data
     * @param projectId ID of the project
     * @return Project The project data
     */
    function getProject(
        uint256 projectId
    ) external view returns (Project memory);

    /**
     * @dev Returns a project's creators
     * @param projectId ID of the project
     * @return address[] Array of creator addresses
     */
    function getProjectCreators(
        uint256 projectId
    ) external view returns (address[] memory);

    /**
     * @dev Returns a project's contributors
     * @param projectId ID of the project
     * @return address[] Array of contributor addresses
     */
    function getProjectContributors(
        uint256 projectId
    ) external view returns (address[] memory);

    /**
     * @dev Returns a project's investors
     * @param projectId ID of the project
     * @return address[] Array of investor addresses
     */
    function getProjectInvestors(
        uint256 projectId
    ) external view returns (address[] memory);

    /**
     * @dev Checks if an address is a creator for a project
     * @param projectId ID of the project
     * @param creator Address to check
     * @return bool True if the address is a creator
     */
    function isProjectCreator(
        uint256 projectId,
        address creator
    ) external view returns (bool);

    /**
     * @dev Checks if an address is a contributor for a project
     * @param projectId ID of the project
     * @param contributor Address to check
     * @return bool True if the address is a contributor
     */
    function isProjectContributor(
        uint256 projectId,
        address contributor
    ) external view returns (bool);

    /**
     * @dev Checks if an address is an investor for a project
     * @param projectId ID of the project
     * @param investor Address to check
     * @return bool True if the address is an investor
     */
    function isProjectInvestor(
        uint256 projectId,
        address investor
    ) external view returns (bool);

    /**
     * @dev Returns a participant's data for a project
     * @param projectId ID of the project
     * @param participant Address of the participant
     * @return Participant The participant's data
     */
    function getProjectParticipant(
        uint256 projectId,
        address participant
    ) external view returns (Participant memory);

    /**
     * @dev Returns a project's liquidity
     * @param projectId ID of the project
     * @return uint256 The project's liquidity in CEL tokens
     */
    function getProjectLiquidity(
        uint256 projectId
    ) external view returns (uint256);

    /**
     * @dev Returns allocated and available contributor reserve for a project
     * @param projectId ID of the project
     * @return allocated The IUs allocated to contributors so far
     * @return total The total IUs reserved for contributors
     * @return available The IUs still available for contributors
     */
    function getContributorReserveInfo(
        uint256 projectId
    )
        external
        view
        returns (uint256 allocated, uint256 total, uint256 available);

    /**
     * @dev Returns allocated and available investor reserve for a project
     * @param projectId ID of the project
     * @return allocated The IUs allocated to investors so far
     * @return total The total IUs reserved for investors
     * @return available The IUs still available for investors
     */
    function getInvestorReserveInfo(
        uint256 projectId
    )
        external
        view
        returns (uint256 allocated, uint256 total, uint256 available);

    /**
     * @dev Sells IUs for a project
     * @param projectId ID of the project
     * @param amount Amount of IUs to sell
     * @return bool indicating if the sale was successful
     */
    function sellIUs(uint256 projectId, uint256 amount) external returns (bool);
}
