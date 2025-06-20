// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IInnovationUnits.sol";
import "./interfaces/IProjectStaking.sol";

/**
 * @title ProjectStaking
 * @dev Contract for staking CEL tokens on projects with time-weighted rewards
 * Users can stake with a lock period between 7 days and 2 years
 * Staking score is calculated based on amount and duration
 */
contract ProjectStaking is IProjectStaking, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Durations (upgradable)
    uint256 public override minLockDuration = 7 days;
    uint256 public override maxLockDuration = 730 days; // ~2 years
    uint256 public constant SCORE_PRECISION = 1e12; // Precision for score calculations

    // Early unstaking penalty rates (in basis points, upgradable)
    uint256 public override maxPenaltyRate = 2000; // 50% in basis points
    uint256 public override minPenaltyRate = 500; // 5% in basis points

    // Multiplier factor (upgradable) - controls how much the score scales with time
    // Default is 2.0, meaning stake score can reach up to 3x (1x base + 2x duration bonus)
    // Can be configured between 1 and 19, resulting in max multipliers from 2x to 20x
    uint256 public override multiplierFactor = 2 * SCORE_PRECISION;
    
    // CEL token and InnovationUnits contract references
    IERC20 public celToken;
    IInnovationUnits public innovationUnits;

    // Address authorized to read scores (e.g., EmissionController)
    address public emissionController;

    // Stake information structure
    struct StakeInfo {
        uint256 amount; // Amount of CEL tokens staked
        uint256 startTime; // When the stake was created
        uint256 unlockTime; // When the stake can be withdrawn
        uint256 lockDuration; // Duration of the lock period
        uint256 score; // Calculated score for this stake
        bool isActive; // Whether the stake is still active
    }

    // Mapping of project ID => user address => array of user's stakes
    mapping(uint256 => mapping(address => StakeInfo[]))
        public projectUserStakes;

    // Mapping of user address => project ID => staking indexes for active stakes
    mapping(address => mapping(uint256 => uint256[]))
        public userProjectStakeIndexes;

    // Mapping of user address => array of project IDs where user has active stakes
    mapping(address => uint256[]) public userStakedProjectIds;

    // Total staked amount and score for each user (across all projects)
    mapping(address => uint256) public override userTotalStaked;
    mapping(address => uint256) public userTotalScore;

    // Total staked amount and score for each project
    mapping(uint256 => uint256) public override projectTotalStaked;
    mapping(uint256 => uint256) public projectTotalScore;

    // Global staking statistics
    uint256 public override totalStaked;
    uint256 public override totalScore;
    bool public paused;

    // Mapping to keep track of all stakers for each project
    mapping(uint256 => address[]) public projectStakers;
    // Mapping to check if a staker is already in the projectStakers array to prevent duplicates
    mapping(uint256 => mapping(address => bool)) public isProjectStaker;

    
    /**
     * @dev Modifier to check if a project exists
     */
    modifier projectExists(uint256 projectId) {
        require(
            innovationUnits.projectIdExists(projectId),
            "Project does not exist"
        );
        _;
    }

    /**
     * @dev Modifier to check if staking is not paused
     */
    modifier notPaused() {
        require(!paused, "Staking is paused");
        _;
    }

    /**
     * @dev Modifier to restrict access to emission controller
     */
    modifier onlyEmissionController() {
        require(msg.sender == emissionController, "Only emission controller");
        _;
    }

    /**
     * @dev Constructor
     * @param _celToken Address of the CEL token
     * @param _innovationUnits Address of the InnovationUnits contract
     */
    constructor(address _celToken, address _innovationUnits) {
        require(_celToken != address(0), "Invalid CEL token address");
        require(
            _innovationUnits != address(0),
            "Invalid InnovationUnits address"
        );

        celToken = IERC20(_celToken);
        innovationUnits = IInnovationUnits(_innovationUnits);
    }

    /**
     * @dev Stake tokens on a project
     * @param projectId ID of the project to stake on
     * @param amount Amount of CEL tokens to stake
     * @param lockDurationDays Duration in days to lock tokens
     */
    function stake(
        uint256 projectId,
        uint256 amount,
        uint256 lockDurationDays
    ) external override nonReentrant notPaused projectExists(projectId) {
        require(amount > 0, "Amount must be greater than 0");

        // Convert days to seconds for consistency
        uint256 lockDuration = lockDurationDays * 1 days;
        require(
            lockDuration >= minLockDuration && lockDuration <= maxLockDuration,
            "Lock duration out of bounds"
        );

        // Calculate unlock time
        uint256 unlockTime = block.timestamp + lockDuration;

        // Calculate the score for this stake
        uint256 score = calculateStakeScore(amount, lockDuration);

        // Transfer tokens from user to contract
        celToken.safeTransferFrom(msg.sender, address(this), amount);

        // Create and store stake
        StakeInfo memory newStake = StakeInfo({
            amount: amount,
            startTime: block.timestamp,
            unlockTime: unlockTime,
            lockDuration: lockDuration,
            score: score,
            isActive: true
        });

        // Add the new stake to the user's stakes for this project
        uint256 stakeIndex = projectUserStakes[projectId][msg.sender].length;
        projectUserStakes[projectId][msg.sender].push(newStake);

        // Track stake index for easier access
        userProjectStakeIndexes[msg.sender][projectId].push(stakeIndex);

        // Check if this project is already in the user's staked projects list
        bool projectExists = false;
        for (uint256 i = 0; i < userStakedProjectIds[msg.sender].length; i++) {
            if (userStakedProjectIds[msg.sender][i] == projectId) {
                projectExists = true;
                break;
            }
        }

        // If not, add it
        if (!projectExists) {
            userStakedProjectIds[msg.sender].push(projectId);
        }

        // Update totals
        userTotalStaked[msg.sender] = userTotalStaked[msg.sender].add(amount);
        userTotalScore[msg.sender] = userTotalScore[msg.sender].add(score);

        projectTotalStaked[projectId] = projectTotalStaked[projectId].add(
            amount
        );
        projectTotalScore[projectId] = projectTotalScore[projectId].add(score);

        totalStaked = totalStaked.add(amount);
        totalScore = totalScore.add(score);

        // Add the staker to the projectStakers array
        if (!isProjectStaker[projectId][msg.sender]) {
            projectStakers[projectId].push(msg.sender);
            isProjectStaker[projectId][msg.sender] = true;
        }

        emit Staked(
            msg.sender,
            projectId,
            amount,
            lockDuration,
            unlockTime,
            score,
            stakeIndex
        );
    }

    /**
     * @dev Unstake tokens from a project
     * @param projectId ID of the project to unstake from
     * @param stakeIndex Index of the stake to unstake
     */
    function unstake(
        uint256 projectId,
        uint256 stakeIndex
    ) external override nonReentrant projectExists(projectId) {
        require(
            stakeIndex < projectUserStakes[projectId][msg.sender].length,
            "Invalid stake index"
        );

        StakeInfo storage userStake = projectUserStakes[projectId][msg.sender][
            stakeIndex
        ];

        require(userStake.isActive, "Stake is not active");
        require(block.timestamp >= userStake.unlockTime, "Tokens still locked");

        // Mark stake as inactive
        userStake.isActive = false;

        // Update totals
        userTotalStaked[msg.sender] = userTotalStaked[msg.sender].sub(
            userStake.amount
        );
        userTotalScore[msg.sender] = userTotalScore[msg.sender].sub(
            userStake.score
        );

        projectTotalStaked[projectId] = projectTotalStaked[projectId].sub(
            userStake.amount
        );
        projectTotalScore[projectId] = projectTotalScore[projectId].sub(
            userStake.score
        );

        totalStaked = totalStaked.sub(userStake.amount);
        totalScore = totalScore.sub(userStake.score);

        // Check if user still has any active stakes in this project
        bool hasActiveStakes = false;
        uint256[] memory indexes = userProjectStakeIndexes[msg.sender][
            projectId
        ];
        for (uint256 i = 0; i < indexes.length; i++) {
            if (
                indexes[i] != stakeIndex &&
                projectUserStakes[projectId][msg.sender][indexes[i]].isActive
            ) {
                hasActiveStakes = true;
                break;
            }
        }

        // If no more active stakes in this project, remove it from the user's staked projects
        if (!hasActiveStakes) {
            uint256 length = userStakedProjectIds[msg.sender].length;
            for (uint256 i = 0; i < length; i++) {
                if (userStakedProjectIds[msg.sender][i] == projectId) {
                    // Replace with the last element and pop
                    userStakedProjectIds[msg.sender][i] = userStakedProjectIds[
                        msg.sender
                    ][length - 1];
                    userStakedProjectIds[msg.sender].pop();
                    break;
                }
            }
        }

        // Transfer tokens back to user
        celToken.safeTransfer(msg.sender, userStake.amount);

        // Remove the staker from the projectStakers array
        if (isProjectStaker[projectId][msg.sender]) {
            uint256 length = projectStakers[projectId].length;
            for (uint256 i = 0; i < length; i++) {
                if (projectStakers[projectId][i] == msg.sender) {
                    // Replace with the last element and pop
                    projectStakers[projectId][i] = projectStakers[projectId][
                        length - 1
                    ];
                    projectStakers[projectId].pop();
                    break;
                }
            }
            isProjectStaker[projectId][msg.sender] = false;
        }

        emit Unstaked(
            msg.sender,
            projectId,
            userStake.amount,
            userStake.score,
            stakeIndex
        );
    }

    /**
     * @dev Unstake tokens early with a penalty
     * @param projectId ID of the project to unstake from
     * @param stakeIndex Index of the stake to unstake
     * @return penaltyAmount The amount of penalty paid
     */
    function earlyUnstake(
        uint256 projectId,
        uint256 stakeIndex
    )
        external
        nonReentrant
        projectExists(projectId)
        returns (uint256 penaltyAmount)
    {
        require(
            stakeIndex < projectUserStakes[projectId][msg.sender].length,
            "Invalid stake index"
        );

        StakeInfo storage userStake = projectUserStakes[projectId][msg.sender][
            stakeIndex
        ];

        require(userStake.isActive, "Stake is not active");
        require(
            block.timestamp < userStake.unlockTime,
            "Use regular unstake for unlocked tokens"
        );

        // Calculate the penalty based on remaining time
        uint256 remainingTime = userStake.unlockTime - block.timestamp;
        uint256 originalLockDuration = userStake.lockDuration;

        // Penalty scales from 50% to 5% based on remaining time
        // 50% if unstaking immediately after staking
        // 5% if unstaking right before unlock time
        uint256 penaltyRate = maxPenaltyRate;
        if (originalLockDuration > 0) {
            // Linear penalty decrease: starts at maxPenaltyRate and ends at minPenaltyRate
            penaltyRate =
                maxPenaltyRate -
                (((maxPenaltyRate - minPenaltyRate) *
                    (originalLockDuration - remainingTime)) /
                    originalLockDuration);
        }

        penaltyAmount = (userStake.amount * penaltyRate) / 10000;
        uint256 returnAmount = userStake.amount - penaltyAmount;

        // Mark stake as inactive
        userStake.isActive = false;

        // Update totals
        userTotalStaked[msg.sender] = userTotalStaked[msg.sender].sub(
            userStake.amount
        );
        userTotalScore[msg.sender] = userTotalScore[msg.sender].sub(
            userStake.score
        );

        projectTotalStaked[projectId] = projectTotalStaked[projectId].sub(
            userStake.amount
        );
        projectTotalScore[projectId] = projectTotalScore[projectId].sub(
            userStake.score
        );

        totalStaked = totalStaked.sub(userStake.amount);
        totalScore = totalScore.sub(userStake.score);

        // Check if user still has any active stakes in this project
        bool hasActiveStakes = false;
        uint256[] memory indexes = userProjectStakeIndexes[msg.sender][
            projectId
        ];
        for (uint256 i = 0; i < indexes.length; i++) {
            if (
                indexes[i] != stakeIndex &&
                projectUserStakes[projectId][msg.sender][indexes[i]].isActive
            ) {
                hasActiveStakes = true;
                break;
            }
        }

        // If no more active stakes in this project, remove it from the user's staked projects
        if (!hasActiveStakes) {
            uint256 length = userStakedProjectIds[msg.sender].length;
            for (uint256 i = 0; i < length; i++) {
                if (userStakedProjectIds[msg.sender][i] == projectId) {
                    // Replace with the last element and pop
                    userStakedProjectIds[msg.sender][i] = userStakedProjectIds[
                        msg.sender
                    ][length - 1];
                    userStakedProjectIds[msg.sender].pop();
                    break;
                }
            }
        }

        // Remove the staker from the projectStakers array if they have no more active stakes
        if (!hasActiveStakes && isProjectStaker[projectId][msg.sender]) {
            uint256 length = projectStakers[projectId].length;
            for (uint256 i = 0; i < length; i++) {
                if (projectStakers[projectId][i] == msg.sender) {
                    // Replace with the last element and pop
                    projectStakers[projectId][i] = projectStakers[projectId][
                        length - 1
                    ];
                    projectStakers[projectId].pop();
                    break;
                }
            }
            isProjectStaker[projectId][msg.sender] = false;
        }

        // Transfer penalty to the InnovationUnits contract's project treasury
        if (penaltyAmount > 0) {
            // First approve the InnovationUnits contract to spend penalty amount of CEL tokens
            celToken.approve(address(innovationUnits), penaltyAmount);

            // Then call addLiquidity which will use safeTransferFrom to pull the tokens
            // and properly update the project's treasury balance
            innovationUnits.addLiquidity(projectId, penaltyAmount);
        }

        // Transfer remaining tokens back to user
        if (returnAmount > 0) {
            celToken.safeTransfer(msg.sender, returnAmount);
        }

        // Emit the early unstaking event
        emit EarlyUnstaked(
            msg.sender,
            projectId,
            userStake.amount,
            userStake.score,
            stakeIndex,
            penaltyAmount,
            remainingTime
        );

        return penaltyAmount;
    }

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
    ) external override nonReentrant onlyOwner projectExists(projectId) {
        require(
            stakeIndex < projectUserStakes[projectId][user].length,
            "Invalid stake index"
        );

        StakeInfo storage userStake = projectUserStakes[projectId][user][
            stakeIndex
        ];
        require(userStake.isActive, "Stake is not active");

        // Mark stake as inactive
        userStake.isActive = false;

        // Update totals
        userTotalStaked[user] = userTotalStaked[user].sub(userStake.amount);
        userTotalScore[user] = userTotalScore[user].sub(userStake.score);

        projectTotalStaked[projectId] = projectTotalStaked[projectId].sub(
            userStake.amount
        );
        projectTotalScore[projectId] = projectTotalScore[projectId].sub(
            userStake.score
        );

        totalStaked = totalStaked.sub(userStake.amount);
        totalScore = totalScore.sub(userStake.score);

        // Check if user still has any active stakes in this project
        bool hasActiveStakes = false;
        uint256[] memory indexes = userProjectStakeIndexes[user][projectId];
        for (uint256 i = 0; i < indexes.length; i++) {
            if (
                indexes[i] != stakeIndex &&
                projectUserStakes[projectId][user][indexes[i]].isActive
            ) {
                hasActiveStakes = true;
                break;
            }
        }

        // If no more active stakes in this project, remove it from the user's staked projects
        if (!hasActiveStakes) {
            uint256 length = userStakedProjectIds[user].length;
            for (uint256 i = 0; i < length; i++) {
                if (userStakedProjectIds[user][i] == projectId) {
                    // Replace with the last element and pop
                    userStakedProjectIds[user][i] = userStakedProjectIds[user][
                        length - 1
                    ];
                    userStakedProjectIds[user].pop();
                    break;
                }
            }
        }

        // Transfer tokens back to user
        celToken.safeTransfer(user, userStake.amount);

        // Remove the staker from the projectStakers array
        if (isProjectStaker[projectId][user]) {
            uint256 length = projectStakers[projectId].length;
            for (uint256 i = 0; i < length; i++) {
                if (projectStakers[projectId][i] == user) {
                    // Replace with the last element and pop
                    projectStakers[projectId][i] = projectStakers[projectId][
                        length - 1
                    ];
                    projectStakers[projectId].pop();
                    break;
                }
            }
            isProjectStaker[projectId][user] = false;
        }

        emit EmergencyUnstaked(user, projectId, userStake.amount, stakeIndex);
    }

    /**
     * @dev Calculate score for a stake based on amount and lock duration
     * Score formula: amount * (1 + durationFactor * multiplierFactor/SCORE_PRECISION)
     * where durationFactor scales from 0 to 1 (min to max duration)
     * and multiplierFactor determines the steepness of the curve
     * This gives 1x to (1 + multiplierFactor/SCORE_PRECISION)x multiplier effect
     */
    function calculateStakeScore(
        uint256 amount,
        uint256 lockDuration
    ) public view override returns (uint256) {
        // Base multiplier is 1.0
        uint256 baseMultiplier = SCORE_PRECISION;

        // Calculate duration factor (scales from 0 to 1.0)
        uint256 durationFactor = (lockDuration.sub(minLockDuration))
            .mul(SCORE_PRECISION)
            .div(maxLockDuration.sub(minLockDuration));

        // Calculate duration bonus using the multiplier factor
        uint256 durationBonus = durationFactor.mul(multiplierFactor).div(
            SCORE_PRECISION
        );

        // Total multiplier (1.0 to 1.0 + multiplierFactor/SCORE_PRECISION)
        uint256 multiplier = baseMultiplier.add(durationBonus);

        // Calculate score
        return amount.mul(multiplier).div(SCORE_PRECISION);
    }

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
    ) external view override returns (bool canUnstake, uint256 unlockTime) {
        if (stakeIndex >= projectUserStakes[projectId][user].length) {
            return (false, 0);
        }

        StakeInfo storage userStake = projectUserStakes[projectId][user][
            stakeIndex
        ];

        if (!userStake.isActive) {
            return (false, 0);
        }

        return (block.timestamp >= userStake.unlockTime, userStake.unlockTime);
    }

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
        override
        returns (
            uint256[] memory indexes,
            uint256[] memory amounts,
            uint256[] memory startTimes,
            uint256[] memory unlockTimes,
            uint256[] memory lockDurations,
            uint256[] memory scores
        )
    {
        uint256[] memory stakeIndexes = userProjectStakeIndexes[user][
            projectId
        ];
        uint256 activeStakesCount = 0;

        // First count active stakes
        for (uint256 i = 0; i < stakeIndexes.length; i++) {
            if (projectUserStakes[projectId][user][stakeIndexes[i]].isActive) {
                activeStakesCount++;
            }
        }

        // Initialize arrays with the correct size
        indexes = new uint256[](activeStakesCount);
        amounts = new uint256[](activeStakesCount);
        startTimes = new uint256[](activeStakesCount);
        unlockTimes = new uint256[](activeStakesCount);
        lockDurations = new uint256[](activeStakesCount);
        scores = new uint256[](activeStakesCount);

        // Fill arrays with active stakes
        uint256 arrayIndex = 0;
        for (uint256 i = 0; i < stakeIndexes.length; i++) {
            uint256 stakeIndex = stakeIndexes[i];
            StakeInfo storage stake = projectUserStakes[projectId][user][
                stakeIndex
            ];

            if (stake.isActive) {
                indexes[arrayIndex] = stakeIndex;
                amounts[arrayIndex] = stake.amount;
                startTimes[arrayIndex] = stake.startTime;
                unlockTimes[arrayIndex] = stake.unlockTime;
                lockDurations[arrayIndex] = stake.lockDuration;
                scores[arrayIndex] = stake.score;
                arrayIndex++;
            }
        }

        return (
            indexes,
            amounts,
            startTimes,
            unlockTimes,
            lockDurations,
            scores
        );
    }

    /**
     * @dev Get all project IDs where a user has active stakes
     * @param user Address of the user
     * @return Array of project IDs where the user has active stakes
     */
    function getUserStakedProjects(
        address user
    ) external view override returns (uint256[] memory) {
        return userStakedProjectIds[user];
    }

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
        override
        returns (
            uint256[] memory projectIds,
            uint256[] memory stakeIndexes,
            uint256[] memory amounts,
            uint256[] memory unlockTimes
        )
    {
        // Get projects where user has active stakes
        uint256[] memory projects = userStakedProjectIds[user];

        // Count total active stakes across all projects
        uint256 totalStakes = 0;
        for (uint256 i = 0; i < projects.length; i++) {
            uint256 projectId = projects[i];
            uint256[] memory indexes = userProjectStakeIndexes[user][projectId];

            for (uint256 j = 0; j < indexes.length; j++) {
                if (projectUserStakes[projectId][user][indexes[j]].isActive) {
                    totalStakes++;
                }
            }
        }

        // Initialize return arrays
        projectIds = new uint256[](totalStakes);
        stakeIndexes = new uint256[](totalStakes);
        amounts = new uint256[](totalStakes);
        unlockTimes = new uint256[](totalStakes);

        // Fill arrays with stake data
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < projects.length; i++) {
            uint256 projectId = projects[i];
            uint256[] memory indexes = userProjectStakeIndexes[user][projectId];

            for (uint256 j = 0; j < indexes.length; j++) {
                uint256 stakeIndex = indexes[j];
                StakeInfo storage stake = projectUserStakes[projectId][user][
                    stakeIndex
                ];

                if (stake.isActive) {
                    projectIds[currentIndex] = projectId;
                    stakeIndexes[currentIndex] = stakeIndex;
                    amounts[currentIndex] = stake.amount;
                    unlockTimes[currentIndex] = stake.unlockTime;
                    currentIndex++;
                }
            }
        }

        return (projectIds, stakeIndexes, amounts, unlockTimes);
    }

    /**
     * @dev Get user score for a specific project (for emissions)
     * @param projectId ID of the project
     * @param user Address of the user
     */
    function getUserProjectScore(
        uint256 projectId,
        address user
    ) external view override returns (uint256 score) {
        uint256[] memory stakeIndexes = userProjectStakeIndexes[user][
            projectId
        ];
        uint256 totalScore = 0;

        for (uint256 i = 0; i < stakeIndexes.length; i++) {
            StakeInfo storage stake = projectUserStakes[projectId][user][
                stakeIndexes[i]
            ];
            if (stake.isActive) {
                totalScore = totalScore.add(stake.score);
            }
        }

        return totalScore;
    }

    /**
     * @dev Get total score for a user across all projects
     * @param user Address of the user
     */
    function getUserTotalScore(
        address user
    ) external view override returns (uint256) {
        return userTotalScore[user];
    }

    /**
     * @dev Get total score for a project
     * @param projectId ID of the project
     */
    function getProjectScore(
        uint256 projectId
    ) external view override returns (uint256) {
        return projectTotalScore[projectId];
    }

    /**
     * @dev Set the emission controller address
     * @param _emissionController Address of the new emission controller
     */
    function setEmissionController(
        address _emissionController
    ) external override onlyOwner {
        require(
            _emissionController != address(0),
            "Invalid emission controller address"
        );
        emissionController = _emissionController;
        emit EmissionControllerUpdated(_emissionController);
    }

    /**
     * @dev Pause or unpause staking
     * @param _paused New pause state
     */
    function setPaused(bool _paused) external override onlyOwner {
        paused = _paused;
        emit StakingPaused(_paused);
    }

    /**
     * @dev Rescue tokens accidentally sent to the contract
     * @param tokenAddress Address of the token to rescue
     * @param amount Amount of tokens to rescue
     */
    function rescueTokens(
        address tokenAddress,
        uint256 amount
    ) external onlyOwner {
        // Don't allow rescuing CEL tokens that are actually staked
        if (tokenAddress == address(celToken)) {
            uint256 stakedCEL = totalStaked;
            uint256 contractBalance = celToken.balanceOf(address(this));
            require(contractBalance > stakedCEL, "No excess CEL to rescue");

            // Only allow rescuing excess tokens
            uint256 rescuableAmount = contractBalance.sub(stakedCEL);
            require(amount <= rescuableAmount, "Cannot rescue staked CEL");
        }

        IERC20(tokenAddress).safeTransfer(owner(), amount);
    }

    /**
     * @dev Update the minimum lock duration
     * @param _minLockDuration New minimum lock duration in seconds
     */
    function setMinLockDuration(
        uint256 _minLockDuration
    ) external override onlyOwner {
        require(_minLockDuration > 0, "Min duration must be greater than 0");
        require(
            _minLockDuration < maxLockDuration,
            "Min duration must be less than max duration"
        );

        uint256 oldMinDuration = minLockDuration;
        minLockDuration = _minLockDuration;

        emit LockDurationUpdated("min", oldMinDuration, _minLockDuration);
    }

    /**
     * @dev Update the maximum lock duration
     * @param _maxLockDuration New maximum lock duration in seconds
     */
    function setMaxLockDuration(
        uint256 _maxLockDuration
    ) external override onlyOwner {
        require(
            _maxLockDuration > minLockDuration,
            "Max duration must be greater than min duration"
        );
        // Reasonable upper limit check: ~10 years
        require(_maxLockDuration <= 3650 days, "Max duration too high");

        uint256 oldMaxDuration = maxLockDuration;
        maxLockDuration = _maxLockDuration;

        emit LockDurationUpdated("max", oldMaxDuration, _maxLockDuration);
    }

    /**
     * @dev Update the multiplier factor that controls score scaling
     * @param _multiplierFactor New multiplier factor (in SCORE_PRECISION units)
     */
    function setMultiplierFactor(
        uint256 _multiplierFactor
    ) external override onlyOwner {
        

        uint256 oldMultiplierFactor = multiplierFactor;
        multiplierFactor = _multiplierFactor;

        emit MultiplierFactorUpdated(oldMultiplierFactor, _multiplierFactor);
    }

    /**
     * @dev Update the minimum penalty rate for early unstaking
     * @param _minPenaltyRate New minimum penalty rate (in basis points: 100 = 1%)
     */
    function setMinPenaltyRate(
        uint256 _minPenaltyRate
    ) external override onlyOwner {
        require(_minPenaltyRate <= 3000, "Min penalty rate too high: max 30%");
        require(_minPenaltyRate < maxPenaltyRate, "Min must be less than max");

        uint256 oldRate = minPenaltyRate;
        minPenaltyRate = _minPenaltyRate;

        emit PenaltyRateUpdated("min", oldRate, _minPenaltyRate);
    }

    /**
     * @dev Update the maximum penalty rate for early unstaking
     * @param _maxPenaltyRate New maximum penalty rate (in basis points: 100 = 1%)
     */
    function setMaxPenaltyRate(
        uint256 _maxPenaltyRate
    ) external override onlyOwner {
        require(_maxPenaltyRate <= 7000, "Max penalty rate too high: max 70%");
        require(
            _maxPenaltyRate > minPenaltyRate,
            "Max must be greater than min"
        );

        uint256 oldRate = maxPenaltyRate;
        maxPenaltyRate = _maxPenaltyRate;

        emit PenaltyRateUpdated("max", oldRate, _maxPenaltyRate);
    }

    /**
     * @dev Get all stakers for a specific project
     * @param projectId ID of the project
     * @return stakers Array of staker addresses with active stakes in the project
     * @return amounts Array of total staked amounts for each staker
     */
    function getProjectStakers(
        uint256 projectId
    )
        external
        view
        projectExists(projectId)
        returns (address[] memory stakers, uint256[] memory amounts)
    {
        // Get all stakers for this project from our tracking array
        address[] storage projectStakerList = projectStakers[projectId];
        amounts = new uint256[](projectStakerList.length);

        // Get the staked amount for each staker
        for (uint256 i = 0; i < projectStakerList.length; i++) {
            address staker = projectStakerList[i];
            // Get the user's staked amount across all active stakes
            uint256[] memory stakeIndexes = userProjectStakeIndexes[staker][
                projectId
            ];
            uint256 totalAmount = 0;

            for (uint256 j = 0; j < stakeIndexes.length; j++) {
                StakeInfo storage stake = projectUserStakes[projectId][staker][
                    stakeIndexes[j]
                ];
                if (stake.isActive) {
                    totalAmount = totalAmount.add(stake.amount);
                }
            }

            amounts[i] = totalAmount;
        }

        return (projectStakerList, amounts);
    }
}
