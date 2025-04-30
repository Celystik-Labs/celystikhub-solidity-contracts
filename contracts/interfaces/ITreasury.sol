// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ITreasury
 * @dev Interface for the CelystikHub Treasury
 */
interface ITreasury {
    /**
     * @dev Adds a fee collector
     * @param collector Address of the collector to add
     */
    function addFeeCollector(address collector) external;
    
    /**
     * @dev Removes a fee collector
     * @param collector Address of the collector to remove
     */
    function removeFeeCollector(address collector) external;
    
    /**
     * @dev Collects fees from a sender
     * @param amount Amount of CEL tokens to collect as fee
     * @return bool indicating if the collection was successful
     */
    function collectFee(uint256 amount) external returns (bool);
    
    /**
     * @dev Withdraws CEL tokens from the treasury
     * @param recipient Address to receive the tokens
     * @param amount Amount of CEL tokens to withdraw
     * @return bool indicating if the withdrawal was successful
     */
    function withdraw(address recipient, uint256 amount) external returns (bool);
    
    /**
     * @dev Returns the balance of CEL tokens in the treasury
     * @return uint256 The balance of CEL tokens
     */
    function getBalance() external view returns (uint256);
    
    /**
     * @dev Checks if an address is a fee collector
     * @param collector Address to check
     * @return bool True if the address is a fee collector
     */
    function isFeeCollector(address collector) external view returns (bool);
    
    /**
     * @dev Returns the total fees collected by a collector
     * @param collector Address of the collector
     * @return uint256 The total fees collected
     */
    function getCollectedFees(address collector) external view returns (uint256);
} 