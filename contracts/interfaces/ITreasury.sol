// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ITreasury
 * @dev Interface for the simple Treasury contract that collects protocol fees
 */
interface ITreasury {
    /**
     * @dev Receive fees into the Treasury
     * @param amount Amount of fees to receive
     */
    function receiveFees(uint256 amount) external;

    /**
     * @dev Send fees to a specified address (only owner)
     * @param to Address to send fees to
     * @param amount Amount of fees to send
     */
    function sendFees(address to, uint256 amount) external;

    /**
     * @dev Withdraw tokens in case of emergency (only owner)
     * @param token Token address (use zero address for ETH)
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external;

    /**
     * @dev Get the current balance of CEL tokens
     * @return The balance of CEL tokens in the Treasury
     */
    function getBalance() external view returns (uint256);

    /**
     * @dev Get total accumulated fees
     */
    function totalFees() external view returns (uint256);

    /**
     * @dev Emitted when fees are received
     */
    event FeesReceived(uint256 amount, uint256 timestamp);

    /**
     * @dev Emitted when fees are sent
     */
    event FeesSent(address indexed to, uint256 amount);

    /**
     * @dev Emitted when an emergency withdrawal is executed
     */
    event EmergencyWithdrawal(
        address indexed token,
        address indexed to,
        uint256 amount
    );
}
