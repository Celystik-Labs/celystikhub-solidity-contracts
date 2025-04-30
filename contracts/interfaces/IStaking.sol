// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IStaking
 * @dev Interface for the Staking contract that manages CEL token staking
 */
interface IStaking {
    /**
     * @dev Struct to represent a user's stake
     */
    struct UserStake {
        uint256 amount; // Amount of CEL tokens staked
        uint256 since; // Timestamp when the stake was created
        uint256 lockPeriod;
        uint256 unlockTime;
        uint256 lastRewardsClaimed; // Timestamp of the last rewards claim
    }

    /**
     * @dev Struct to represent a project's staking pool
     */
    struct ProjectStakingPool {
        uint256 totalStaked; // Total CEL tokens staked on the project
        uint256 stakeLimit; // Maximum amount of CEL that can be staked on the project (0 = no limit)
        bool enabled; // Whether staking is enabled for this project
        uint256 minStakingPeriod; // Minimum staking period in seconds
        uint256 maxStakingPeriod; // Maximum staking period in seconds
    }

    /**
     * @dev Stakes CEL tokens on a project
     * @param projectId ID of the project
     * @param amount Amount of CEL tokens to stake
     * @param lockPeriod Period to lock the stake (in seconds)
     * @return bool indicating if the staking was successful
     */
    function stake(
        uint256 projectId,
        uint256 amount,
        uint256 lockPeriod
    ) external returns (bool);

    /**
     * @dev Unstakes CEL tokens from a project
     * @param projectId ID of the project
     * @param amount Amount of CEL tokens to unstake
     * @return bool indicating if the unstaking was successful
     */
    function unstake(uint256 projectId, uint256 amount) external returns (bool);

    /**
     * @dev Creates a staking pool for a project
     * @param projectId ID of the project
     * @param stakeLimit Maximum amount of CEL that can be staked on the project (0 = no limit)
     * @param minStakingPeriod Minimum staking period in seconds
     * @return bool indicating if the creation was successful
     */
    function createStakingPool(
        uint256 projectId,
        uint256 stakeLimit,
        uint256 minStakingPeriod
    ) external returns (bool);

    /**
     * @dev Updates a project's staking pool parameters
     * @param projectId ID of the project
     * @param stakeLimit Maximum amount of CEL that can be staked on the project (0 = no limit)
     * @param enabled Whether staking is enabled for this project
     * @param minStakingPeriod Minimum staking period in seconds
     * @param maxStakingPeriod Maximum staking period in seconds
     * @return bool indicating if the update was successful
     */
    function updateStakingPool(
        uint256 projectId,
        uint256 stakeLimit,
        bool enabled,
        uint256 minStakingPeriod,
        uint256 maxStakingPeriod
    ) external returns (bool);

    /**
     * @dev Returns the user's staked amount for a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The user's staked amount
     */
    function getStaked(
        address user,
        uint256 projectId
    ) external view returns (uint256);

    /**
     * @dev Returns the user's staking details for a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return UserStake The user's staking details
     */
    function getUserStake(
        address user,
        uint256 projectId
    ) external view returns (UserStake memory);

    /**
     * @dev Returns the project's staking pool details
     * @param projectId ID of the project
     * @return ProjectStakingPool The project's staking pool details
     */
    function getProjectStakingPool(
        uint256 projectId
    ) external view returns (ProjectStakingPool memory);

    /**
     * @dev Returns the total amount staked on a project
     * @param projectId ID of the project
     * @return uint256 The total staked amount
     */
    function getTotalStaked(uint256 projectId) external view returns (uint256);

    /**
     * @dev Returns the user's staking share for a project (scaled by PRECISION)
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The user's staking share (percentage)
     */
    function getUserStakeShare(
        address user,
        uint256 projectId
    ) external view returns (uint256);

    /**
     * @dev Calculates the staking score for a user
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The user's staking score
     */
    function calculateStakingScore(
        address user,
        uint256 projectId
    ) external view returns (uint256);

    /**
     * @dev Returns whether a user can unstake from a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return bool True if the user can unstake
     */
    function canUnstake(
        address user,
        uint256 projectId
    ) external view returns (bool);

    /**
     * @dev Returns the remaining lock time for a user's stake
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The remaining lock time in seconds (0 if not locked)
     */
    function getRemainingLockTime(
        address user,
        uint256 projectId
    ) external view returns (uint256);

    /**
     * @dev Returns the list of stakers for a project
     * @param projectId ID of the project
     * @return address[] Array of staker addresses
     */
    function getStakers(
        uint256 projectId
    ) external view returns (address[] memory);

    /**
     * @dev Emitted when CEL tokens are staked on a project
     */
    event Staked(
        uint256 indexed projectId,
        address indexed user,
        uint256 amount,
        uint256 totalStaked,
        uint256 lockPeriod
    );

    /**
     * @dev Emitted when CEL tokens are unstaked from a project
     */
    event Unstaked(
        uint256 indexed projectId,
        address indexed user,
        uint256 amount,
        uint256 totalStaked
    );

    /**
     * @dev Emitted when a staking pool is created for a project
     */
    event StakingPoolCreated(
        uint256 indexed projectId,
        uint256 stakeLimit,
        uint256 minStakingPeriod,
        uint256 maxStakingPeriod
    );

    /**
     * @dev Emitted when a staking pool is updated
     */
    event StakingPoolUpdated(
        uint256 indexed projectId,
        uint256 stakeLimit,
        bool enabled,
        uint256 minStakingPeriod,
        uint256 maxStakingPeriod
    );
}
