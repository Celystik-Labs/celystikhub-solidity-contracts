// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title ProtocolTreasury
 * @dev Simple contract to collect and manage protocol fees
 */
contract ProtocolTreasury is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // CEL token address
    IERC20 public celToken;

    // Accumulated fees
    uint256 public totalFees;

    event FeesReceived(uint256 amount, uint256 timestamp);
    event FeesSent(address indexed to, uint256 amount);
    event EmergencyWithdrawal(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    /**
     * @dev Constructor
     * @param _celToken Address of the CEL token
     */
    constructor(address _celToken) {
        require(_celToken != address(0), "Invalid CEL token address");
        celToken = IERC20(_celToken);
    }

    /**
     * @dev Receive fees into the Protocol Treasury
     * @param amount Amount of fees to receive
     */
    function receiveFees(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");

        // Transfer tokens from sender to this contract
        celToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update total fees
        totalFees = totalFees.add(amount);

        emit FeesReceived(amount, block.timestamp);
    }

    /**
     * @dev Send fees to a specified address (only owner)
     * @param to Address to send fees to
     * @param amount Amount of fees to send
     */
    function sendFees(
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be greater than 0");
        require(
            amount <= celToken.balanceOf(address(this)),
            "Insufficient balance"
        );

        // Transfer tokens to the specified address
        celToken.safeTransfer(to, amount);

        emit FeesSent(to, amount);
    }

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
    ) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be greater than 0");

        if (token == address(0)) {
            // Handle ETH withdrawal
            require(
                address(this).balance >= amount,
                "Insufficient ETH balance"
            );
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            // Handle ERC20 token withdrawal
            IERC20 tokenContract = IERC20(token);
            require(
                tokenContract.balanceOf(address(this)) >= amount,
                "Insufficient token balance"
            );
            tokenContract.safeTransfer(to, amount);
        }

        emit EmergencyWithdrawal(token, to, amount);
    }

    /**
     * @dev Get the current balance of CEL tokens
     * @return The balance of CEL tokens in the Protocol Treasury
     */
    function getBalance() external view returns (uint256) {
        return celToken.balanceOf(address(this));
    }

    /**
     * @dev Function to receive ETH
     */
    receive() external payable {}

    /**
     * @dev Fallback function
     */
    fallback() external payable {}
}
