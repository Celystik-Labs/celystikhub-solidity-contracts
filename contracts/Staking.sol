// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IStaking.sol";
import "./interfaces/ICELToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title Staking
 * @dev Implementation of the Staking contract that manages CEL token staking
 */
contract Staking is IStaking, Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    // Constants
    uint256 private constant PRECISION = 1e18;

    // CEL Token contract
    ICELToken public celToken;

    // Mapping of projectId to project staking pool
    mapping(uint256 => ProjectStakingPool) public projectPools;

    // Mapping of projectId to user address to user stake
    mapping(uint256 => mapping(address => UserStake)) public userStakes;

    // Mapping of projectId to array of staker addresses
    mapping(uint256 => address[]) private projectStakers;

    // Mapping to track if an address is already a staker for a project
    mapping(uint256 => mapping(address => bool)) private isStaker;

    /**
     * @dev Constructor to initialize the Staking contract
     * @param _celToken Address of the CEL token
     */
    constructor(address _celToken) {
        require(
            _celToken != address(0),
            "Staking: zero address provided for token"
        );
        celToken = ICELToken(_celToken);
    }

    /**
     * @dev Stakes CEL tokens on a project
     * @param projectId ID of the project
     * @param amount Amount of CEL tokens to stake
     * @return bool indicating if the staking was successful
     */
    function stake(
        uint256 projectId,
        uint256 amount
    ) external override nonReentrant returns (bool) {
        require(amount > 0, "Staking: stake amount must be greater than zero");

        ProjectStakingPool storage pool = projectPools[projectId];
        require(
            pool.enabled,
            "Staking: staking is not enabled for this project"
        );

        // Check if staking limit is reached
        if (pool.stakeLimit > 0) {
            require(
                pool.totalStaked.add(amount) <= pool.stakeLimit,
                "Staking: stake limit reached"
            );
        }

        // Transfer CEL tokens from staker to this contract
        require(
            celToken.transferFrom(msg.sender, address(this), amount),
            "Staking: CEL token transfer failed"
        );

        // Update total staked
        pool.totalStaked = pool.totalStaked.add(amount);

        // Update user stake
        UserStake storage userStake = userStakes[projectId][msg.sender];
        if (userStake.amount == 0) {
            // First time staking for this project
            userStake.since = block.timestamp;
            userStake.lastRewardsClaimed = block.timestamp;

            // Add user to stakers list if not already there
            if (!isStaker[projectId][msg.sender]) {
                projectStakers[projectId].push(msg.sender);
                isStaker[projectId][msg.sender] = true;
            }
        }

        userStake.amount = userStake.amount.add(amount);

        emit Staked(projectId, msg.sender, amount, pool.totalStaked);

        return true;
    }

    /**
     * @dev Unstakes CEL tokens from a project
     * @param projectId ID of the project
     * @param amount Amount of CEL tokens to unstake
     * @return bool indicating if the unstaking was successful
     */
    function unstake(
        uint256 projectId,
        uint256 amount
    ) external override nonReentrant returns (bool) {
        require(
            amount > 0,
            "Staking: unstake amount must be greater than zero"
        );

        UserStake storage userStake = userStakes[projectId][msg.sender];
        require(
            userStake.amount >= amount,
            "Staking: unstake amount exceeds staked amount"
        );

        // Check minimum staking period
        uint256 minStakingPeriod = projectPools[projectId].minStakingPeriod;
        if (minStakingPeriod > 0) {
            require(
                block.timestamp.sub(userStake.since) >= minStakingPeriod,
                "Staking: minimum staking period not reached"
            );
        }

        // Update user stake
        userStake.amount = userStake.amount.sub(amount);

        // Update total staked
        ProjectStakingPool storage pool = projectPools[projectId];
        pool.totalStaked = pool.totalStaked.sub(amount);

        // Transfer CEL tokens back to staker
        require(
            celToken.transfer(msg.sender, amount),
            "Staking: CEL token transfer failed"
        );

        emit Unstaked(projectId, msg.sender, amount, pool.totalStaked);

        return true;
    }

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
    ) external override onlyOwner returns (bool) {
        require(projectId > 0, "Staking: project ID must be greater than zero");
        require(
            projectPools[projectId].enabled == false &&
                projectPools[projectId].totalStaked == 0,
            "Staking: staking pool already exists"
        );

        projectPools[projectId] = ProjectStakingPool({
            totalStaked: 0,
            stakeLimit: stakeLimit,
            enabled: true,
            minStakingPeriod: minStakingPeriod
        });

        emit StakingPoolCreated(projectId, stakeLimit, minStakingPeriod);

        return true;
    }

    /**
     * @dev Updates a project's staking pool parameters
     * @param projectId ID of the project
     * @param stakeLimit Maximum amount of CEL that can be staked on the project (0 = no limit)
     * @param enabled Whether staking is enabled for this project
     * @param minStakingPeriod Minimum staking period in seconds
     * @return bool indicating if the update was successful
     */
    function updateStakingPool(
        uint256 projectId,
        uint256 stakeLimit,
        bool enabled,
        uint256 minStakingPeriod
    ) external override onlyOwner returns (bool) {
        require(projectId > 0, "Staking: project ID must be greater than zero");

        ProjectStakingPool storage pool = projectPools[projectId];

        // If stake limit is being reduced, ensure it's not less than current total staked
        if (stakeLimit > 0 && stakeLimit < pool.totalStaked) {
            require(
                stakeLimit >= pool.totalStaked,
                "Staking: new stake limit cannot be less than current total staked"
            );
        }

        pool.stakeLimit = stakeLimit;
        pool.enabled = enabled;
        pool.minStakingPeriod = minStakingPeriod;

        emit StakingPoolUpdated(
            projectId,
            stakeLimit,
            enabled,
            minStakingPeriod
        );

        return true;
    }

    /**
     * @dev Returns the user's staked amount for a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The user's staked amount
     */
    function getStaked(
        address user,
        uint256 projectId
    ) external view override returns (uint256) {
        return userStakes[projectId][user].amount;
    }

    /**
     * @dev Returns the user's staking details for a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return UserStake The user's staking details
     */
    function getUserStake(
        address user,
        uint256 projectId
    ) external view override returns (UserStake memory) {
        return userStakes[projectId][user];
    }

    /**
     * @dev Returns the project's staking pool details
     * @param projectId ID of the project
     * @return ProjectStakingPool The project's staking pool details
     */
    function getProjectStakingPool(
        uint256 projectId
    ) external view override returns (ProjectStakingPool memory) {
        return projectPools[projectId];
    }

    /**
     * @dev Returns the total amount staked on a project
     * @param projectId ID of the project
     * @return uint256 The total staked amount
     */
    function getTotalStaked(
        uint256 projectId
    ) external view override returns (uint256) {
        return projectPools[projectId].totalStaked;
    }

    /**
     * @dev Returns the user's staking share for a project (scaled by PRECISION)
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The user's staking share (percentage)
     */
    function getUserStakeShare(
        address user,
        uint256 projectId
    ) external view override returns (uint256) {
        uint256 userAmount = userStakes[projectId][user].amount;
        uint256 totalAmount = projectPools[projectId].totalStaked;

        if (userAmount == 0 || totalAmount == 0) {
            return 0;
        }

        return userAmount.mul(PRECISION).div(totalAmount);
    }

    /**
     * @dev Returns whether a user can unstake from a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return bool True if the user can unstake
     */
    function canUnstake(
        address user,
        uint256 projectId
    ) external view override returns (bool) {
        UserStake storage userStake = userStakes[projectId][user];
        if (userStake.amount == 0) {
            return false;
        }

        uint256 minStakingPeriod = projectPools[projectId].minStakingPeriod;
        if (minStakingPeriod > 0) {
            return block.timestamp.sub(userStake.since) >= minStakingPeriod;
        }

        return true;
    }

    /**
     * @dev Returns the remaining lock time for a user's stake
     * @param user Address of the user
     * @param projectId ID of the project
     * @return uint256 The remaining lock time in seconds (0 if not locked)
     */
    function getRemainingLockTime(
        address user,
        uint256 projectId
    ) external view override returns (uint256) {
        UserStake storage userStake = userStakes[projectId][user];
        if (userStake.amount == 0) {
            return 0;
        }

        uint256 minStakingPeriod = projectPools[projectId].minStakingPeriod;
        if (minStakingPeriod == 0) {
            return 0;
        }

        uint256 stakedFor = block.timestamp.sub(userStake.since);
        if (stakedFor >= minStakingPeriod) {
            return 0;
        }

        return minStakingPeriod.sub(stakedFor);
    }

    /**
     * @dev Returns the list of stakers for a project
     * @param projectId ID of the project
     * @return address[] Array of staker addresses
     */
    function getStakers(
        uint256 projectId
    ) external view returns (address[] memory) {
        return projectStakers[projectId];
    }

    /**
     * @dev Updates the last rewards claimed timestamp for a user
     * @param user Address of the user
     * @param projectId ID of the project
     * @param timestamp New timestamp
     * @return bool indicating if the update was successful
     */
    function updateLastRewardsClaimed(
        address user,
        uint256 projectId,
        uint256 timestamp
    ) external onlyOwner returns (bool) {
        require(
            userStakes[projectId][user].amount > 0,
            "Staking: user has no stake"
        );

        userStakes[projectId][user].lastRewardsClaimed = timestamp;

        return true;
    }

    /**
     * @dev Allows the owner to transfer CEL tokens in case of an emergency
     * @param to Address to transfer CEL tokens to
     * @param amount Amount of CEL tokens to transfer
     * @return bool indicating if the transfer was successful
     */
    function emergencyWithdraw(
        address to,
        uint256 amount
    ) external onlyOwner returns (bool) {
        require(to != address(0), "Staking: cannot withdraw to zero address");
        require(
            amount > 0,
            "Staking: withdrawal amount must be greater than zero"
        );

        require(
            celToken.transfer(to, amount),
            "Staking: CEL token transfer failed"
        );

        return true;
    }
}
