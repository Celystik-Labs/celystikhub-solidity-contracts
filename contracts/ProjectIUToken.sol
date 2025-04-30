// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IProjectIUToken.sol";

/**
 * @title ProjectIUToken
 * @dev Implementation of the CelystikHub Innovation Units (IU) as an ERC1155 token
 */
contract ProjectIUToken is ERC1155, ERC1155Supply, Ownable, IProjectIUToken {
    using SafeMath for uint256;

    // Constants
    uint256 private constant PRECISION = 1e18;
    uint256 private constant HUNDRED_PERCENT = 100 * PRECISION;

    // Project metadata
    uint256 public projectId;
    string public name;
    string public description;

    // Tokenomics
    uint256 public totalSupply;
    uint256 public pricePerUnit;
    uint256 public creatorShare; // percentage, scaled by PRECISION
    uint256 public investorReserve; // percentage, scaled by PRECISION
    uint256 public contributorReserve; // percentage, scaled by PRECISION

    // Tracking minted amounts
    uint256 public mintedToCreators;
    uint256 public mintedToContributors;
    uint256 public mintedToInvestors;

    // Protocol fee
    uint256 public protocolFee = 5 * PRECISION; // 5% fee
    address public treasury;

    // Project state
    bool public active = true;

    /**
     * @dev Constructor to initialize the ProjectIUToken contract
     * @param _projectId ID of the project
     * @param _name Name of the project
     * @param _description Description of the project
     * @param _totalSupply Total supply of tokens
     * @param _pricePerUnit Price per IU in CEL tokens
     * @param _creatorShare Percentage allocated to creators
     * @param _contributorReserve Percentage reserved for contributors
     * @param _investorReserve Percentage reserved for investors
     * @param _treasury Address of the treasury contract
     */
    constructor(
        uint256 _projectId,
        string memory _name,
        string memory _description,
        uint256 _totalSupply,
        uint256 _pricePerUnit,
        uint256 _creatorShare,
        uint256 _contributorReserve,
        uint256 _investorReserve,
        address _treasury
    ) ERC1155("") {
        require(
            _treasury != address(0),
            "ProjectIUToken: zero treasury address"
        );
        require(_totalSupply > 0, "ProjectIUToken: supply must be positive");
        require(
            _creatorShare.add(_contributorReserve).add(_investorReserve) ==
                HUNDRED_PERCENT,
            "ProjectIUToken: shares must add up to 100%"
        );

        projectId = _projectId;
        name = _name;
        description = _description;
        totalSupply = _totalSupply;
        pricePerUnit = _pricePerUnit;
        creatorShare = _creatorShare;
        contributorReserve = _contributorReserve;
        investorReserve = _investorReserve;
        treasury = _treasury;

        // Set URI for metadata
        _setURI(
            string(
                abi.encodePacked(
                    "https://celystikhub.com/api/metadata/",
                    _projectId
                )
            )
        );
    }

    /**
     * @dev Mints IUs to creators based on their specified shares
     * @param creators Array of creator addresses
     * @param shares Array of creator shares (must add up to 100%)
     * @return bool indicating if the minting was successful
     */
    function mintToCreators(
        address[] memory creators,
        uint256[] memory shares
    ) external override onlyOwner returns (bool) {
        require(creators.length > 0, "ProjectIUToken: no creators provided");
        require(
            creators.length == shares.length,
            "ProjectIUToken: arrays length mismatch"
        );
        require(
            mintedToCreators == 0,
            "ProjectIUToken: creators already minted"
        );

        // Calculate total creator allocation
        uint256 creatorAllocation = totalSupply.mul(creatorShare).div(
            HUNDRED_PERCENT
        );

        // Validate shares add up to 100%
        uint256 totalShares = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            totalShares = totalShares.add(shares[i]);
        }
        require(
            totalShares == HUNDRED_PERCENT,
            "ProjectIUToken: shares must add up to 100%"
        );

        // Mint tokens to each creator based on their share
        for (uint256 i = 0; i < creators.length; i++) {
            require(
                creators[i] != address(0),
                "ProjectIUToken: zero creator address"
            );

            uint256 creatorAmount = creatorAllocation.mul(shares[i]).div(
                HUNDRED_PERCENT
            );
            _mint(creators[i], projectId, creatorAmount, "");

            mintedToCreators = mintedToCreators.add(creatorAmount);

            emit CreatorMinted(
                projectId,
                creators[i],
                creatorAmount,
                shares[i]
            );
        }

        return true;
    }

    /**
     * @dev Mints IUs to a contributor
     * @param contributor Address of the contributor
     * @param amount Amount of IUs to mint
     * @return bool indicating if the minting was successful
     */
    function mintToContributor(
        address contributor,
        uint256 amount
    ) external override onlyOwner returns (bool) {
        require(
            contributor != address(0),
            "ProjectIUToken: zero contributor address"
        );
        require(amount > 0, "ProjectIUToken: amount must be positive");
        require(active, "ProjectIUToken: project not active");

        // Calculate total contributor allocation
        uint256 contributorAllocation = totalSupply.mul(contributorReserve).div(
            HUNDRED_PERCENT
        );

        // Check if we're within contributor allocation
        require(
            mintedToContributors.add(amount) <= contributorAllocation,
            "ProjectIUToken: exceeds contributor allocation"
        );

        // Mint tokens to contributor
        _mint(contributor, projectId, amount, "");
        mintedToContributors = mintedToContributors.add(amount);

        emit ContributorMinted(projectId, contributor, amount);

        return true;
    }

    /**
     * @dev Allows investors to purchase IUs with CEL tokens
     * @param investor Address of the investor
     * @param amount Amount of CEL tokens to invest
     * @return bool indicating if the purchase was successful
     */
    function mintToInvestor(
        address investor,
        uint256 amount
    ) external override onlyOwner returns (bool) {
        require(
            investor != address(0),
            "ProjectIUToken: zero investor address"
        );
        require(amount > 0, "ProjectIUToken: amount must be positive");
        require(active, "ProjectIUToken: project not active");

        // Calculate IUs to mint based on price
        uint256 iuAmount = amount.div(pricePerUnit);

        // Calculate total investor allocation
        uint256 investorAllocation = totalSupply.mul(investorReserve).div(
            HUNDRED_PERCENT
        );

        // Check if we're within investor allocation
        require(
            mintedToInvestors.add(iuAmount) <= investorAllocation,
            "ProjectIUToken: exceeds investor allocation"
        );

        // Mint tokens to investor
        _mint(investor, projectId, iuAmount, "");
        mintedToInvestors = mintedToInvestors.add(iuAmount);

        emit InvestorMinted(projectId, investor, iuAmount, amount);

        return true;
    }

    /**
     * @dev Updates the price per IU
     * @param newPrice New price per IU
     * @return bool indicating if the update was successful
     */
    function updatePrice(
        uint256 newPrice
    ) external override onlyOwner returns (bool) {
        require(newPrice > 0, "ProjectIUToken: price must be positive");

        uint256 oldPrice = pricePerUnit;
        pricePerUnit = newPrice;

        emit PriceUpdated(projectId, oldPrice, newPrice);

        return true;
    }

    /**
     * @dev Sets the active state of the project
     * @param _active New active state
     * @return bool indicating if the update was successful
     */
    function setActive(
        bool _active
    ) external override onlyOwner returns (bool) {
        active = _active;

        emit ProjectActiveStatusChanged(projectId, _active);

        return true;
    }

    /**
     * @dev Returns the available IUs for contributors
     * @return uint256 The available contributor IUs
     */
    function getAvailableContributorIUs()
        external
        view
        override
        returns (uint256)
    {
        uint256 contributorAllocation = totalSupply.mul(contributorReserve).div(
            HUNDRED_PERCENT
        );
        return contributorAllocation.sub(mintedToContributors);
    }

    /**
     * @dev Returns the available IUs for investors
     * @return uint256 The available investor IUs
     */
    function getAvailableInvestorIUs()
        external
        view
        override
        returns (uint256)
    {
        uint256 investorAllocation = totalSupply.mul(investorReserve).div(
            HUNDRED_PERCENT
        );
        return investorAllocation.sub(mintedToInvestors);
    }

    /**
     * @dev Returns all token holders for the project
     * @return address[] Array of token holder addresses
     */
    function getHolders() external view override returns (address[] memory) {
        // This is a placeholder. In a production environment, you would need
        // to implement a mechanism to track all token holders, as ERC1155
        // doesn't provide this functionality out of the box.
        // For simplicity, we're returning an empty array.
        return new address[](0);
    }

    /**
     * @dev Returns the fee for an investment amount
     * @param amount Investment amount
     * @return uint256 The fee amount
     */
    function calculateFee(
        uint256 amount
    ) public view override returns (uint256) {
        return amount.mul(protocolFee).div(HUNDRED_PERCENT);
    }

    /**
     * @dev Burns IUs from a holder
     * @param holder Address of the IU holder
     * @param amount Amount of IUs to burn
     * @return bool indicating if the burning was successful
     */
    function burn(
        address holder,
        uint256 amount
    ) external override onlyOwner returns (bool) {
        require(holder != address(0), "ProjectIUToken: zero holder address");
        require(amount > 0, "ProjectIUToken: amount must be positive");
        require(active, "ProjectIUToken: project not active");

        // Check if holder has enough balance
        require(
            balanceOf(holder, projectId) >= amount,
            "ProjectIUToken: insufficient balance"
        );

        // Burn tokens from holder
        _burn(holder, projectId, amount);

        emit IUsBurned(projectId, holder, amount);

        return true;
    }

    /**
     * @dev Hook that is called before any token transfer
     */
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override(ERC1155, ERC1155Supply) {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }
}
