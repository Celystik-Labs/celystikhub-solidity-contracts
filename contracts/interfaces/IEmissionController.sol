// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IEmissionController
 * @dev Interface for the EmissionController contract
 * Defines functions for managing emission epochs and token distributions
 */
interface IEmissionController {
    /**
     * @dev Start a new emission epoch
     */
    function startEpoch() external;

    /**
     * @dev Process the end of an epoch and calculate emissions
     * Takes a snapshot of all impact scores and calculates emissions
     */
    function processEpoch() external;

    /**
     * @dev Force stop the current epoch without processing it (for debugging only)
     * This function should only be used in development environments for testing
     */
    function forceStopEpoch() external;

    /**
     * @dev Calculate global impact score based on staking and metrics
     * @param _globalStakingScore The total staking score across all projects
     * @param _globalMetricsScore The global metrics score
     * @return The calculated global impact score
     */
    function calculateGlobalImpactScore(
        uint256 _globalStakingScore,
        uint256 _globalMetricsScore
    ) external view returns (uint256);

    /**
     * @dev Calculate project impact score based on staking and metrics
     * @param _projectId The project ID
     * @param _projectStakingScore The project's staking score
     * @param _projectMetricsScore The project's metrics score
     * @return The calculated project impact score
     */
    function calculateProjectImpactScore(
        uint256 _projectId,
        uint256 _projectStakingScore,
        uint256 _projectMetricsScore
    ) external view returns (uint256);

    /**
     * @dev Set metrics score for a project (placeholder for now)
     * @param projectId The project ID
     * @param score The metrics score to set
     */
    function setProjectMetricsScore(uint256 projectId, uint256 score) external;

    /**
     * @dev Set global metrics score (placeholder for now)
     * @param score The global metrics score to set
     */
    function setGlobalMetricsScore(uint256 score) external;

    /**
     * @dev Claim staking emissions for a specific epoch and project
     * @param epochNumber The epoch number to claim for
     * @param projectId The project ID to claim for
     */
    function claimStakingEmissions(
        uint256 epochNumber,
        uint256 projectId
    ) external;

    /**
     * @dev Claim IU holder emissions for a specific epoch and project
     * @param epochNumber The epoch number to claim for
     * @param projectId The project ID to claim for
     */
    function claimIUHolderEmissions(
        uint256 epochNumber,
        uint256 projectId
    ) external;

    /**
     * @dev Check if a user has unclaimed staking emissions
     * @param epochNumber The epoch number to check
     * @param projectId The project ID to check
     * @param user The user address to check
     * @return hasUnclaimed Whether the user has unclaimed emissions
     * @return amount The amount of emissions that can be claimed
     */
    function checkUnclaimedStakingEmissions(
        uint256 epochNumber,
        uint256 projectId,
        address user
    ) external view returns (bool hasUnclaimed, uint256 amount);

    /**
     * @dev Check if a user has unclaimed IU holder emissions
     * @param epochNumber The epoch number to check
     * @param projectId The project ID to check
     * @param user The user address to check
     * @return hasUnclaimed Whether the user has unclaimed emissions
     * @return amount The amount of emissions that can be claimed
     */
    function checkUnclaimedIUHolderEmissions(
        uint256 epochNumber,
        uint256 projectId,
        address user
    ) external view returns (bool hasUnclaimed, uint256 amount);

    /**
     * @dev Update epoch duration
     * @param _epochDuration New epoch duration in seconds
     */
    function setEpochDuration(uint256 _epochDuration) external;

    /**
     * @dev Update emissions per epoch
     * @param _emissionsPerEpoch New constant emissions per epoch
     */
    function setEmissionsPerEpoch(uint256 _emissionsPerEpoch) external;

    /**
     * @dev Update global weights for staking and metrics scores
     * @param _stakingWeight New weight for staking score
     * @param _metricsWeight New weight for metrics score
     */
    function setGlobalWeights(
        uint256 _stakingWeight,
        uint256 _metricsWeight
    ) external;

    /**
     * @dev Update emission shares between stakers and IU holders
     * @param _stakingShare New share for stakers
     * @param _iuHoldersShare New share for IU holders
     * @param _projectTreasuryShare New share for project treasury
     */
    function setEmissionShares(
        uint256 _stakingShare,
        uint256 _iuHoldersShare,
        uint256 _projectTreasuryShare
    ) external;

    /**
     * @dev Withdraw tokens in case of emergency
     * @param token Address of the token to withdraw
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external;

    /**
     * @dev Get current epoch information
     * @return currentEpochNumber The current epoch number
     * @return isActive Whether the epoch is active
     * @return startTime Start timestamp of the current/last epoch
     * @return endTime End timestamp of the current/last epoch
     */
    function getCurrentEpochInfo()
        external
        view
        returns (
            uint256 currentEpochNumber,
            bool isActive,
            uint256 startTime,
            uint256 endTime
        );

    /**
     * @dev Get emissions data for a specific epoch and project
     * @param epochNumber The epoch number to query
     * @param projectId The project ID to query
     * @return totalEmissions Total emissions for the project in this epoch
     * @return stakingEmissions Emissions allocated to stakers
     * @return iuHolderEmissions Emissions allocated to IU holders
     * @return treasuryEmissions Emissions allocated to project treasury
     */
    function getEpochProjectEmissions(
        uint256 epochNumber,
        uint256 projectId
    )
        external
        view
        returns (
            uint256 totalEmissions,
            uint256 stakingEmissions,
            uint256 iuHolderEmissions,
            uint256 treasuryEmissions
        );

    /**
     * @dev Manually add project treasury emissions for a specific epoch and project
     * This function can be used if automatic addition fails for some reason
     * @param epochNumber The epoch number to add treasury emissions for
     * @param projectId The project ID to add treasury emissions for
     */
    function manuallyAddProjectTreasuryEmissions(
        uint256 epochNumber,
        uint256 projectId
    ) external;

    // Events

    /**
     * @dev Emitted when a new epoch is started
     */
    event EpochStarted(
        uint256 indexed epochNumber,
        uint256 startTimestamp,
        uint256 endTimestamp
    );

    /**
     * @dev Emitted when an epoch is processed and emissions are calculated
     */
    event EpochProcessed(uint256 indexed epochNumber, uint256 totalEmissions);

    /**
     * @dev Emitted when an epoch is forcefully stopped without processing (debugging only)
     */
    event EpochForceStopped(uint256 indexed epochNumber, uint256 timestamp);

    /**
     * @dev Emitted when project emissions are calculated
     */
    event ProjectEmissionsCalculated(
        uint256 indexed epochNumber,
        uint256 indexed projectId,
        uint256 totalEmissions,
        uint256 stakingEmissions,
        uint256 iuHolderEmissions,
        uint256 treasuryEmissions
    );

    /**
     * @dev Emitted when a user claims staking emissions
     */
    event StakingEmissionsClaimed(
        uint256 indexed epochNumber,
        uint256 indexed projectId,
        address indexed staker,
        uint256 amount
    );

    /**
     * @dev Emitted when a user claims IU holder emissions
     */
    event IUHolderEmissionsClaimed(
        uint256 indexed epochNumber,
        uint256 indexed projectId,
        address indexed holder,
        uint256 amount
    );

    /**
     * @dev Emitted when epoch duration is updated
     */
    event EpochDurationUpdated(uint256 oldDuration, uint256 newDuration);

    /**
     * @dev Emitted when emissions per epoch are updated
     */
    event EmissionsPerEpochUpdated(uint256 oldEmissions, uint256 newEmissions);

    /**
     * @dev Emitted when global weights are updated
     */
    event GlobalWeightsUpdated(uint256 stakingWeight, uint256 metricsWeight);

    /**
     * @dev Emitted when emission shares are updated
     */
    event EmissionSharesUpdated(
        uint256 stakingShare,
        uint256 iuHoldersShare,
        uint256 projectTreasuryShare
    );

    /**
     * @dev Emitted when tokens are minted for an epoch's emissions
     */
    event EpochTokensMinted(uint256 indexed epochNumber, uint256 amount);

    /**
     * @dev Emitted when project treasury emissions are added to the project treasury
     */
    event ProjectTreasuryEmissionsAdded(
        uint256 indexed epochNumber,
        uint256 indexed projectId,
        uint256 amount
    );
}
