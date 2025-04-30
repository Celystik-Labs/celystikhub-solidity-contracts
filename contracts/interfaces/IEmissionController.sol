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
    function emitTokens(
        address account,
        uint256 amount
    ) external returns (bool);

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
     * @dev Distributes emissions to projects based on their impact scores
     */
    function distributeEmissions() external;

    /**
     * @dev Claims rewards for a user from a project
     * @param projectId The ID of the project
     */
    function claimRewards(uint256 projectId) external;

    /**
     * @dev Updates the emission period configuration
     * @param daysInPeriod Number of days in an emission period
     */
    function updateEmissionPeriodConfig(uint256 daysInPeriod) external;

    /**
     * @dev Updates the impact score calculation weights
     * @param stakingWeight Weight for staking score in impact calculation
     * @param metricsWeight Weight for metrics score in impact calculation
     */
    function updateImpactScoreWeights(
        uint256 stakingWeight,
        uint256 metricsWeight
    ) external;

    /**
     * @dev Updates the platform emission calculation weights
     * @param stakingWeight Weight for platform staking in emission calculation
     * @param metricsWeight Weight for platform metrics in emission calculation
     */
    function updatePlatformEmissionWeights(
        uint256 stakingWeight,
        uint256 metricsWeight
    ) external;

    /**
     * @dev Updates the staking score calculation parameters
     * @param alpha Weight for stake amount
     * @param beta Weight for stake duration
     */
    function updateStakingScoreParameters(uint256 alpha, uint256 beta) external;

    /**
     * @dev Updates the distribution shares between IU holders and stakers
     * @param iuHolderShare Percentage share for IU holders
     * @param stakerShare Percentage share for stakers
     */
    function updateDistributionShares(
        uint256 iuHolderShare,
        uint256 stakerShare
    ) external;

    /**
     * @dev Emitted when tokens are emitted to an account
     */
    event TokensEmitted(address indexed to, uint256 amount, uint256 period);

    /**
     * @dev Emitted when a new emission period begins
     */
    event NewEmissionPeriod(uint256 indexed period, uint256 allowedEmission);

    /**
     * @dev Emitted when the emission period configuration is updated
     */
    event EmissionPeriodUpdated(uint256 daysInPeriod, uint256 periodSeconds);

    /**
     * @dev Emitted when impact score weights are updated
     */
    event ImpactScoreWeightsUpdated(
        uint256 stakingWeight,
        uint256 metricsWeight
    );

    /**
     * @dev Emitted when platform emission weights are updated
     */
    event PlatformEmissionWeightsUpdated(
        uint256 stakingWeight,
        uint256 metricsWeight
    );

    /**
     * @dev Emitted when staking score parameters are updated
     */
    event StakingScoreParametersUpdated(uint256 alpha, uint256 beta);

    /**
     * @dev Emitted when distribution shares are updated
     */
    event DistributionSharesUpdated(uint256 iuHolderShare, uint256 stakerShare);

    /**
     * @dev Emitted when a user claims rewards
     */
    event RewardsClaimed(
        uint256 indexed projectId,
        address indexed user,
        uint256 amount
    );

    /**
     * @dev Emitted when a project's impact score is updated
     */
    event ProjectImpactScoreUpdated(
        uint256 indexed projectId,
        uint256 impactScore
    );
}
