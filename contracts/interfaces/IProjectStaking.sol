// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IProjectStaking
 * @dev Interface for the ProjectStaking contract
 * Defines external functions that other contracts can call
 */
interface IProjectStaking {
    /**
     * @dev Stake tokens on a project
     * @param projectId ID of the project to stake on
     * @param amount Amount of CEL tokens to stake
     * @param lockDurationDays Duration in days to lock tokens (min 7, max 730)
     */
    function stake(
        uint256 projectId,
        uint256 amount,
        uint256 lockDurationDays
    ) external;

    /**
     * @dev Unstake tokens from a project
     * @param projectId ID of the project to unstake from
     * @param stakeIndex Index of the stake to unstake
     */
    function unstake(uint256 projectId, uint256 stakeIndex) external;

    /**
     * @dev Emergency unstake (only owner can authorize)
     * @param projectId ID of the project to unstake from
     * @param stakeIndex Index of the stake to unstake
     * @param user Address of the user
     */
    function emergencyUnstake(
        uint256 projectId,
        uint256 stakeIndex,
        address user
    ) external;

    /**
     * @dev Calculate score for a stake based on amount and lock duration
     * @param amount Amount staked
     * @param lockDuration Duration locked in seconds
     * @return score The calculated stake score
     */
    function calculateStakeScore(
        uint256 amount,
        uint256 lockDuration
    ) external view returns (uint256 score);

    /**
     * @dev Check if a stake is available for unstaking
     * @param projectId ID of the project
     * @param user Address of the user
     * @param stakeIndex Index of the stake
     * @return canUnstake True if the stake can be unstaked
     * @return unlockTime The time when the stake will unlock
     */
    function checkUnstakeAvailability(
        uint256 projectId,
        address user,
        uint256 stakeIndex
    ) external view returns (bool canUnstake, uint256 unlockTime);

    /**
     * @dev Get all active stakes for a user on a project
     * @param projectId ID of the project
     * @param user Address of the user
     * @return indexes Array of stake indexes
     * @return amounts Array of staked amounts
     * @return startTimes Array of stake start times
     * @return unlockTimes Array of stake unlock times
     * @return lockDurations Array of stake lock durations
     * @return scores Array of stake scores
     */
    function getUserActiveStakes(
        uint256 projectId,
        address user
    )
        external
        view
        returns (
            uint256[] memory indexes,
            uint256[] memory amounts,
            uint256[] memory startTimes,
            uint256[] memory unlockTimes,
            uint256[] memory lockDurations,
            uint256[] memory scores
        );

    /**
     * @dev Get all project IDs where a user has active stakes
     * @param user Address of the user
     * @return Array of project IDs where the user has active stakes
     */
    function getUserStakedProjects(
        address user
    ) external view returns (uint256[] memory);

    /**
     * @dev Get all active stakes for a user across all projects
     * @param user Address of the user
     * @return projectIds Array of project IDs
     * @return stakeIndexes Array of stake indexes for each project
     * @return amounts Array of staked amounts
     * @return unlockTimes Array of unlock times
     */
    function getAllUserStakes(
        address user
    )
        external
        view
        returns (
            uint256[] memory projectIds,
            uint256[] memory stakeIndexes,
            uint256[] memory amounts,
            uint256[] memory unlockTimes
        );

    /**
     * @dev Get user score for a specific project (for emissions)
     * @param projectId ID of the project
     * @param user Address of the user
     * @return score The user's score for the project
     */
    function getUserProjectScore(
        uint256 projectId,
        address user
    ) external view returns (uint256 score);

    /**
     * @dev Get total score for a user across all projects
     * @param user Address of the user
     * @return score The user's total score
     */
    function getUserTotalScore(
        address user
    ) external view returns (uint256 score);

    /**
     * @dev Get total score for a project
     * @param projectId ID of the project
     * @return score The project's total score
     */
    function getProjectScore(
        uint256 projectId
    ) external view returns (uint256 score);

    /**
     * @dev Set the emission controller address
     * @param _emissionController Address of the new emission controller
     */
    function setEmissionController(address _emissionController) external;

    /**
     * @dev Pause or unpause staking
     * @param _paused New pause state
     */
    function setPaused(bool _paused) external;

    /**
     * @dev Get total staked tokens for a project
     * @param projectId ID of the project
     * @return amount The total staked amount
     */
    function projectTotalStaked(
        uint256 projectId
    ) external view returns (uint256 amount);

    /**
     * @dev Get total staked tokens for a user
     * @param user Address of the user
     * @return amount The total staked amount
     */
    function userTotalStaked(
        address user
    ) external view returns (uint256 amount);

    /**
     * @dev Get global total staked amount
     * @return amount The total staked amount across all projects
     */
    function totalStaked() external view returns (uint256 amount);

    /**
     * @dev Get global total score
     * @return score The total score across all projects
     */
    function totalScore() external view returns (uint256 score);

    /**
     * @dev Update the minimum lock duration
     * @param _minLockDuration New minimum lock duration in seconds
     */
    function setMinLockDuration(uint256 _minLockDuration) external;

    /**
     * @dev Update the maximum lock duration
     * @param _maxLockDuration New maximum lock duration in seconds
     */
    function setMaxLockDuration(uint256 _maxLockDuration) external;

    /**
     * @dev Get the current minimum lock duration
     * @return duration The minimum duration in seconds
     */
    function minLockDuration() external view returns (uint256 duration);

    /**
     * @dev Get the current maximum lock duration
     * @return duration The maximum duration in seconds
     */
    function maxLockDuration() external view returns (uint256 duration);

    /**
     * @dev Update the multiplier factor that controls score scaling
     * @param _multiplierFactor New multiplier factor (in SCORE_PRECISION units)
     */
    function setMultiplierFactor(uint256 _multiplierFactor) external;

    /**
     * @dev Get the current multiplier factor
     * @return factor The current multiplier factor
     */
    function multiplierFactor() external view returns (uint256 factor);

    /**
     * @dev Get the current minimum penalty rate for early unstaking
     * @return rate The current minimum penalty rate (in basis points)
     */
    function minPenaltyRate() external view returns (uint256 rate);

    /**
     * @dev Get the current maximum penalty rate for early unstaking
     * @return rate The current maximum penalty rate (in basis points)
     */
    function maxPenaltyRate() external view returns (uint256 rate);

    /**
     * @dev Update the minimum penalty rate for early unstaking
     * @param _minPenaltyRate New minimum penalty rate (in basis points: 100 = 1%)
     */
    function setMinPenaltyRate(uint256 _minPenaltyRate) external;

    /**
     * @dev Update the maximum penalty rate for early unstaking
     * @param _maxPenaltyRate New maximum penalty rate (in basis points: 100 = 1%)
     */
    function setMaxPenaltyRate(uint256 _maxPenaltyRate) external;

    /**
     * @dev Duration parameter updated event
     */
    event LockDurationUpdated(
        string durationType,
        uint256 oldValue,
        uint256 newValue
    );

    /**
     * @dev Multiplier factor updated event
     */
    event MultiplierFactorUpdated(uint256 oldValue, uint256 newValue);

    /**
     * @dev Penalty rate updated event
     */
    event PenaltyRateUpdated(
        string rateType,
        uint256 oldValue,
        uint256 newValue
    );

    /**
     * @dev Staking event
     */
    event Staked(
        address indexed user,
        uint256 indexed projectId,
        uint256 amount,
        uint256 lockDuration,
        uint256 unlockTime,
        uint256 score,
        uint256 stakeIndex
    );

    /**
     * @dev Unstaking event
     */
    event Unstaked(
        address indexed user,
        uint256 indexed projectId,
        uint256 amount,
        uint256 score,
        uint256 stakeIndex
    );

    /**
     * @dev Emergency unstaking event
     */
    event EmergencyUnstaked(
        address indexed user,
        uint256 indexed projectId,
        uint256 amount,
        uint256 stakeIndex
    );

    /**
     * @dev Staking pause state changed event
     */
    event StakingPaused(bool paused);

    /**
     * @dev Emission controller updated event
     */
    event EmissionControllerUpdated(address indexed controller);

    /**
     * @dev Unstake tokens early with a penalty
     * @param projectId ID of the project to unstake from
     * @param stakeIndex Index of the stake to unstake
     * @return penaltyAmount The amount of penalty paid
     */
    function earlyUnstake(
        uint256 projectId,
        uint256 stakeIndex
    ) external returns (uint256 penaltyAmount);

    /**
     * @dev Early unstaking event
     */
    event EarlyUnstaked(
        address indexed user,
        uint256 indexed projectId,
        uint256 amount,
        uint256 score,
        uint256 stakeIndex,
        uint256 penaltyAmount,
        uint256 remainingTime
    );
}
