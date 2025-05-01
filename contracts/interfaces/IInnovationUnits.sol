// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/**
 * @title IInnovationUnits
 * @dev Interface for the Innovation Units (IUs) ERC-1155 token contract
 * Each token ID represents a different project
 */
interface IInnovationUnits is IERC1155 {
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
        address _treasuryAddress
    ) external returns (uint256 projectId);

    /**
     * @dev Returns project data for the specified project ID
     * @param projectId The project ID to query
     */
    function getProjectData(
        uint256 projectId
    )
        external
        view
        returns (
            uint256 totalSupply,
            uint256 initialPrice,
            uint256 creatorsAllocatedPercentage,
            uint256 contributorsReservePercentage,
            uint256 investorsReservePercentage,
            address treasuryAddress
        );

    /**
     * @dev Check if a project exists
     * @param projectId The project ID to check
     * @return True if the project exists
     */
    function projectIdExists(uint256 projectId) external view returns (bool);

    /**
     * @dev Get total number of projects registered
     * @return The total number of projects
     */
    function getTotalProjects() external view returns (uint256);

    /**
     * @dev Mints IUs to creators based on their specified shares
     * @param projectId The project ID (token ID) of the IUs
     */
    function mintToCreators(uint256 projectId) external;

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
    ) external;

    /**
     * @dev Buy IUs as an investor
     * @param projectId The project ID (token ID) of the IUs
     * @param investor Address of the investor
     * * @param amount Amount of IUs to buy
     * @return basePayment The base amount required for the purchase (goes to project treasury)
     * @return fee The fee amount (goes to platform treasury)
     */
    function mintIUsForTokens(
        uint256 projectId,
        address investor,
        uint256 amount
    ) external returns (uint256 basePayment, uint256 fee);

    /**
     * @dev Sell IUs
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
    ) external returns (uint256 baseReturn, uint256 fee);

    /**
     * @dev Update the treasury address for a project
     * @param projectId The project ID to update
     * @param _treasuryAddress New address for the treasury
     */
    function setTreasuryAddress(
        uint256 projectId,
        address _treasuryAddress
    ) external;

    /**
     * @dev Returns the remaining allocation for contributors
     * @param projectId The project ID to query
     */
    function remainingContributorAllocation(
        uint256 projectId
    ) external view returns (uint256);

    /**
     * @dev Returns the remaining allocation for investors
     * @param projectId The project ID to query
     */
    function remainingInvestorAllocation(
        uint256 projectId
    ) external view returns (uint256);

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
        returns (address[] memory _creators, uint256[] memory _shares);

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
        returns (address[] memory _creators, uint256[] memory _soldAmounts);

    /**
     * @dev Returns information about how many IUs a specific creator has sold
     * @param projectId The project ID to query
     * @param creator Address of the creator to query
     * @return soldAmount The amount of IUs the creator has sold
     */
    function getCreatorSoldAmount(
        uint256 projectId,
        address creator
    ) external view returns (uint256 soldAmount);

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
        returns (
            uint256 share,
            uint256 allocation,
            uint256 soldAmount,
            uint256 currentBalance
        );

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
        returns (address[] memory _contributors, uint256[] memory _amounts);

    /**
     * @dev Returns contributor information for a specific address
     * @param projectId The project ID to query
     * @param contributor Address of the contributor to query
     * @return amount The amount of IUs the contributor has received
     */
    function getContributorInfo(
        uint256 projectId,
        address contributor
    ) external view returns (uint256 amount);

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
        returns (address[] memory _investors, uint256[] memory _amounts);

    /**
     * @dev Returns investor information for a specific address
     * @param projectId The project ID to query
     * @param investor Address of the investor to query
     * @return amount The amount of IUs the investor has purchased
     */
    function getInvestorInfo(
        uint256 projectId,
        address investor
    ) external view returns (uint256 amount);

    /**
     * @dev Update the buy fee percentage
     * @param _buyFeePercentage New buy fee percentage (in basis points: 100 = 1%)
     */
    function updateBuyFeePercentage(uint256 _buyFeePercentage) external;

    /**
     * @dev Update the sell fee percentage
     * @param _sellFeePercentage New sell fee percentage (in basis points: 100 = 1%)
     */
    function updateSellFeePercentage(uint256 _sellFeePercentage) external;

    /**
     * @dev Emitted when a fee is updated
     */
    event FeeUpdated(string feeType, uint256 oldValue, uint256 newValue);

    /**
     * @dev Emitted when a new project is registered
     */
    event ProjectRegistered(
        uint256 indexed projectId,
        address indexed admin,
        uint256 totalSupply
    );

    /**
     * @dev Emitted when IUs are minted
     */
    event IUMinted(
        uint256 indexed projectId,
        address indexed to,
        uint256 amount
    );

    /**
     * @dev Emitted when IUs are sold
     */
    event IUSold(
        uint256 indexed projectId,
        address indexed from,
        uint256 amount,
        uint256 returnAmount
    );

    /**
     * @dev Emitted when IUs are bought
     */
    event IUBought(
        uint256 indexed projectId,
        address indexed buyer,
        uint256 amount,
        uint256 price
    );

    /**
     * @dev Emitted when the price is updated
     */
    event PriceUpdated(
        uint256 indexed projectId,
        uint256 oldPrice,
        uint256 newPrice
    );
}
