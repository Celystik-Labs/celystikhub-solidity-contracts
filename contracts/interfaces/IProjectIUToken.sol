// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IProjectIUToken
 * @dev Interface for the CelystikHub Innovation Units (IU) token
 */
interface IProjectIUToken {
    // Events
    event CreatorMinted(
        uint256 indexed projectId,
        address indexed creator,
        uint256 amount,
        uint256 share
    );
    event ContributorMinted(
        uint256 indexed projectId,
        address indexed contributor,
        uint256 amount
    );
    event InvestorMinted(
        uint256 indexed projectId,
        address indexed investor,
        uint256 iuAmount,
        uint256 investmentAmount
    );
    event PriceUpdated(
        uint256 indexed projectId,
        uint256 oldPrice,
        uint256 newPrice
    );
    event ProjectActiveStatusChanged(uint256 indexed projectId, bool active);
    event IUsBurned(
        uint256 indexed projectId,
        address indexed holder,
        uint256 amount
    );

    /**
     * @dev Mints IUs to creators based on their specified shares
     * @param creators Array of creator addresses
     * @param shares Array of creator shares (must add up to 100%)
     * @return bool indicating if the minting was successful
     */
    function mintToCreators(
        address[] memory creators,
        uint256[] memory shares
    ) external returns (bool);

    /**
     * @dev Mints IUs to a contributor
     * @param contributor Address of the contributor
     * @param amount Amount of IUs to mint
     * @return bool indicating if the minting was successful
     */
    function mintToContributor(
        address contributor,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Allows investors to purchase IUs with CEL tokens
     * @param investor Address of the investor
     * @param amount Amount of CEL tokens to invest
     * @return bool indicating if the purchase was successful
     */
    function mintToInvestor(
        address investor,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Updates the price per IU
     * @param newPrice New price per IU
     * @return bool indicating if the update was successful
     */
    function updatePrice(uint256 newPrice) external returns (bool);

    /**
     * @dev Sets the active state of the project
     * @param active New active state
     * @return bool indicating if the update was successful
     */
    function setActive(bool active) external returns (bool);

    /**
     * @dev Returns the available IUs for contributors
     * @return uint256 The available contributor IUs
     */
    function getAvailableContributorIUs() external view returns (uint256);

    /**
     * @dev Returns the available IUs for investors
     * @return uint256 The available investor IUs
     */
    function getAvailableInvestorIUs() external view returns (uint256);

    /**
     * @dev Returns all token holders for the project
     * @return address[] Array of token holder addresses
     */
    function getHolders() external view returns (address[] memory);

    /**
     * @dev Returns the fee for an investment amount
     * @param amount Investment amount
     * @return uint256 The fee amount
     */
    function calculateFee(uint256 amount) external view returns (uint256);

    /**
     * @dev Burns IUs from a holder
     * @param holder Address of the IU holder
     * @param amount Amount of IUs to burn
     * @return bool indicating if the burning was successful
     */
    function burn(address holder, uint256 amount) external returns (bool);
}
