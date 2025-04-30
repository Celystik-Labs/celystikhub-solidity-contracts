// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/ITreasury.sol";
import "./interfaces/ICELToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title Treasury
 * @dev Treasury contract for CelystikHub platform
 * Collects and manages protocol fees
 */
contract Treasury is ITreasury, Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    // CEL token contract
    ICELToken public celToken;

    // Fee collectors (addresses authorized to collect fees)
    mapping(address => bool) public feeCollectors;

    // Fee statistics
    uint256 public totalFees;
    mapping(address => uint256) public collectedFees; // collector => amount

    // Events
    event FeeCollectorAdded(address indexed collector);
    event FeeCollectorRemoved(address indexed collector);
    event FeeCollected(address indexed collector, uint256 amount);
    event FeeWithdrawn(address indexed recipient, uint256 amount);

    /**
     * @dev Constructor to initialize the Treasury contract
     * @param _celToken Address of the CEL token
     */
    constructor(address _celToken) {
        require(_celToken != address(0), "Treasury: zero CEL token address");
        celToken = ICELToken(_celToken);

        // Add deployer as fee collector
        feeCollectors[msg.sender] = true;
        emit FeeCollectorAdded(msg.sender);
    }

    /**
     * @dev Adds a fee collector
     * @param collector Address of the collector to add
     */
    function addFeeCollector(address collector) external override onlyOwner {
        require(collector != address(0), "Treasury: zero collector address");
        require(!feeCollectors[collector], "Treasury: already a collector");

        feeCollectors[collector] = true;
        emit FeeCollectorAdded(collector);
    }

    /**
     * @dev Removes a fee collector
     * @param collector Address of the collector to remove
     */
    function removeFeeCollector(address collector) external override onlyOwner {
        require(feeCollectors[collector], "Treasury: not a collector");

        feeCollectors[collector] = false;
        emit FeeCollectorRemoved(collector);
    }

    /**
     * @dev Collects fees from a sender
     * @param amount Amount of CEL tokens to collect as fee
     * @return bool indicating if the collection was successful
     */
    function collectFee(uint256 amount) external override returns (bool) {
        require(
            feeCollectors[msg.sender],
            "Treasury: not authorized to collect fees"
        );
        require(amount > 0, "Treasury: zero amount");

        // Update fee statistics
        totalFees = totalFees.add(amount);
        collectedFees[msg.sender] = collectedFees[msg.sender].add(amount);

        emit FeeCollected(msg.sender, amount);

        return true;
    }

    /**
     * @dev Withdraws CEL tokens from the treasury
     * @param recipient Address to receive the tokens
     * @param amount Amount of CEL tokens to withdraw
     * @return bool indicating if the withdrawal was successful
     */
    function withdraw(
        address recipient,
        uint256 amount
    ) external override onlyOwner nonReentrant returns (bool) {
        require(recipient != address(0), "Treasury: zero recipient address");
        require(amount > 0, "Treasury: zero amount");

        uint256 balance = celToken.balanceOf(address(this));
        require(amount <= balance, "Treasury: insufficient balance");

        // Transfer CEL tokens to recipient
        require(
            celToken.transfer(recipient, amount),
            "Treasury: transfer failed"
        );

        emit FeeWithdrawn(recipient, amount);

        return true;
    }

    /**
     * @dev Returns the balance of CEL tokens in the treasury
     * @return uint256 The balance of CEL tokens
     */
    function getBalance() external view override returns (uint256) {
        return celToken.balanceOf(address(this));
    }

    /**
     * @dev Checks if an address is a fee collector
     * @param collector Address to check
     * @return bool True if the address is a fee collector
     */
    function isFeeCollector(
        address collector
    ) external view override returns (bool) {
        return feeCollectors[collector];
    }

    /**
     * @dev Returns the total fees collected by a collector
     * @param collector Address of the collector
     * @return uint256 The total fees collected
     */
    function getCollectedFees(
        address collector
    ) external view override returns (uint256) {
        return collectedFees[collector];
    }
}
