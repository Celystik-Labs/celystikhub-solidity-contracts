// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IEmissionController
 * @dev Interface for the Emission Controller that manages token emissions
 */
interface IEmissionController {
    /**
     * @dev Emits tokens to an account based on the emission schedule
     * @param account The address to receive the tokens
     * @param amount The amount of tokens to emit
     * @return bool indicating if the emission was successful
     */
    function emitTokens(address account, uint256 amount) external returns (bool);
    
    /**
     * @dev Returns the amount of tokens that can be emitted in the current period
     * @return uint256 the amount of tokens available for emission
     */
    function getAvailableEmission() external view returns (uint256);
    
    /**
     * @dev Returns how many tokens have been emitted in total
     * @return uint256 the total amount of tokens emitted
     */
    function getTotalEmitted() external view returns (uint256);
    
    /**
     * @dev Returns how many tokens have been emitted in the current period
     * @return uint256 the amount of tokens emitted in the current period
     */
    function getCurrentPeriodEmitted() external view returns (uint256);
    
    /**
     * @dev Returns the current emission period
     * @return uint256 the current emission period
     */
    function getCurrentPeriod() external view returns (uint256);
    
    /**
     * @dev Triggers the calculation of a new emission period
     * Should be called at regular intervals to update the emission period
     */
    function updateEmissionPeriod() external;
    
    /**
     * @dev Returns the maximum cap for token supply
     * @return uint256 the maximum cap
     */
    function getMaxCap() external view returns (uint256);
    
    /**
     * @dev Returns the address of the CEL token
     * @return address the CEL token address
     */
    function getCELToken() external view returns (address);
    
    /**
     * @dev Emitted when tokens are emitted to an account
     */
    event TokensEmitted(address indexed to, uint256 amount, uint256 period);
    
    /**
     * @dev Emitted when a new emission period begins
     */
    event NewEmissionPeriod(uint256 indexed period, uint256 allowedEmission);
} 