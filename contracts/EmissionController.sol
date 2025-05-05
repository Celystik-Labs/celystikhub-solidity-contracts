// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IProjectStaking.sol";
import "./interfaces/IInnovationUnits.sol";
import "./interfaces/IEmissionController.sol";
import "./interfaces/ICELToken.sol";

/**
 * @title EmissionController
 * @dev Manages the distribution of CEL token emissions to projects, stakers, and IU holders
 * Emissions are calculated based on impact scores and distributed at the end of each epoch
 * Uses a hybrid approach: mints tokens at epoch processing time and transfers when users claim
 */
contract EmissionController is IEmissionController, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant PRECISION = 10000; // Basis points precision (100.00%)

    // Configurable parameters
    uint256 public epochDuration = 30 days; // Default epoch duration: 30 days
    uint256 public baseEmissionsPerEpoch = 10000 * 1e18; // Default base emissions: 10,000 CEL
    uint256 public maxEmissionsPerEpoch = 100000 * 1e18; // Default max emissions: 100,000 CEL

    // Weight parameters
    uint256 public globalStakingScoreWeight = 5000; // Default 50%
    uint256 public globalMetricsScoreWeight = 5000; // Default 50%

    // Emission distribution parameters
    uint256 public stakingEmissionShare = 2000; // Default 20%
    uint256 public iuHoldersEmissionShare = 8000; // Default 80%

    // Epoch tracking
    uint256 public currentEpoch = 0;
    uint256 public epochStartTimestamp;
    uint256 public epochEndTimestamp;
    bool public epochActive = false;

    // Contract references
    ICELToken public celToken;
    IProjectStaking public stakingContract;
    IInnovationUnits public innovationUnits;

    // Metrics scores (placeholder for now)
    uint256 public globalMetricsScore = 0;
    mapping(uint256 => uint256) public projectMetricsScore;

    // Emission and claim tracking
    mapping(uint256 => uint256) public epochTotalEmissions;
    mapping(uint256 => mapping(uint256 => uint256))
        public epochProjectEmissions;
    mapping(uint256 => mapping(uint256 => uint256))
        public epochProjectStakingEmissions;
    mapping(uint256 => mapping(uint256 => uint256))
        public epochProjectIUHolderEmissions;

    // Claim tracking
    mapping(uint256 => mapping(uint256 => mapping(address => bool)))
        public hasClaimedStakingEmissions;
    mapping(uint256 => mapping(uint256 => mapping(address => bool)))
        public hasClaimedIUHolderEmissions;

    // All events are defined in the IEmissionController interface

    /**
     * @dev Constructor
     * @param _celToken Address of the CEL token
     * @param _stakingContract Address of the staking contract
     * @param _innovationUnits Address of the InnovationUnits contract
     */
    constructor(
        address _celToken,
        address _stakingContract,
        address _innovationUnits
    ) {
        require(_celToken != address(0), "Invalid CEL token address");
        require(_stakingContract != address(0), "Invalid staking contract");
        require(
            _innovationUnits != address(0),
            "Invalid innovation units contract"
        );

        celToken = ICELToken(_celToken);
        stakingContract = IProjectStaking(_stakingContract);
        innovationUnits = IInnovationUnits(_innovationUnits);

        // // Verify this contract has minter permissions
        // require(
        //     celToken.isMinter(address(this)),
        //     "EmissionController must have minter role"
        // );
    }

    /**
     * @dev Start a new emission epoch
     */
    function startEpoch() external override onlyOwner {
        require(!epochActive, "Epoch already active");

        currentEpoch++;
        epochStartTimestamp = block.timestamp;
        epochEndTimestamp = epochStartTimestamp + epochDuration;
        epochActive = true;

        emit EpochStarted(currentEpoch, epochStartTimestamp, epochEndTimestamp);
    }

    /**
     * @dev Process the end of an epoch and calculate emissions
     * Takes a snapshot of all impact scores and calculates emissions
     * Mints the required tokens for the epoch to this contract
     */
    function processEpoch() external override onlyOwner nonReentrant {
        require(epochActive, "No active epoch");
        require(block.timestamp >= epochEndTimestamp, "Epoch not finished yet");

        epochActive = false;

        // Calculate global impact score
        uint256 globalStakingScore = stakingContract.totalScore();
        uint256 globalImpactScore = calculateGlobalImpactScore(
            globalStakingScore,
            globalMetricsScore
        );

        // Calculate total emissions for this epoch
        uint256 totalEmissions = calculateTotalEmissions(globalImpactScore);
        epochTotalEmissions[currentEpoch] = totalEmissions;

        // Calculate emissions for each project
        uint256 totalProjects = innovationUnits.getTotalProjects();
        uint256 totalAllocatedEmissions = 0;

        for (uint256 projectId = 0; projectId < totalProjects; projectId++) {
            if (innovationUnits.projectIdExists(projectId)) {
                // Calculate project impact score
                uint256 projectStakingScore = stakingContract.getProjectScore(
                    projectId
                );
                uint256 projectImpactScore = calculateProjectImpactScore(
                    projectId,
                    projectStakingScore,
                    projectMetricsScore[projectId]
                );

                // Allocate emissions proportional to impact score
                uint256 projectEmissions = totalEmissions
                    .mul(projectImpactScore)
                    .div(globalImpactScore);

                // Calculate staking and IU holder shares
                uint256 projectStakingEmissions = projectEmissions
                    .mul(stakingEmissionShare)
                    .div(PRECISION);
                uint256 projectIUHolderEmissions = projectEmissions
                    .mul(iuHoldersEmissionShare)
                    .div(PRECISION);

                // Store emissions data
                epochProjectEmissions[currentEpoch][
                    projectId
                ] = projectEmissions;
                epochProjectStakingEmissions[currentEpoch][
                    projectId
                ] = projectStakingEmissions;
                epochProjectIUHolderEmissions[currentEpoch][
                    projectId
                ] = projectIUHolderEmissions;

                totalAllocatedEmissions = totalAllocatedEmissions.add(
                    projectEmissions
                );

                emit ProjectEmissionsCalculated(
                    currentEpoch,
                    projectId,
                    projectEmissions,
                    projectStakingEmissions,
                    projectIUHolderEmissions
                );
            }
        }

        // Mint the required tokens for this epoch - Hybrid approach
        if (totalAllocatedEmissions > 0) {
            bool success = celToken.mint(
                address(this),
                totalAllocatedEmissions
            );
            require(success, "Failed to mint CEL tokens for epoch emissions");
            emit EpochTokensMinted(currentEpoch, totalAllocatedEmissions);
        }

        emit EpochProcessed(currentEpoch, totalAllocatedEmissions);
    }

    /**
     * @dev Calculate global impact score based on staking and metrics
     * @param _globalStakingScore The total staking score across all projects
     * @param _globalMetricsScore The global metrics score (placeholder for now)
     * @return The calculated global impact score
     */
    function calculateGlobalImpactScore(
        uint256 _globalStakingScore,
        uint256 _globalMetricsScore
    ) public view override returns (uint256) {
        return
            _globalStakingScore
                .mul(globalStakingScoreWeight)
                .add(_globalMetricsScore.mul(globalMetricsScoreWeight))
                .div(PRECISION);
    }

    /**
     * @dev Calculate project impact score based on staking and metrics
     * @param _projectId The project ID
     * @param _projectStakingScore The project's staking score
     * @param _projectMetricsScore The project's metrics score (placeholder for now)
     * @return The calculated project impact score
     */
    function calculateProjectImpactScore(
        uint256 _projectId,
        uint256 _projectStakingScore,
        uint256 _projectMetricsScore
    ) public view override returns (uint256) {
        return
            _projectStakingScore
                .mul(globalStakingScoreWeight)
                .add(_projectMetricsScore.mul(globalMetricsScoreWeight))
                .div(PRECISION);
    }

    /**
     * @dev Calculate total emissions for the epoch based on impact score
     * @param _globalImpactScore The global impact score
     * @return The calculated total emissions
     */
    function calculateTotalEmissions(
        uint256 _globalImpactScore
    ) public view override returns (uint256) {
        // Simple linear model for now; can be enhanced with more sophisticated models
        // Start with baseEmissions, scale up with impact score, cap at maxEmissions

        // If impact score is 0, return base emissions
        if (_globalImpactScore == 0) {
            return baseEmissionsPerEpoch;
        }

        // Simple scaling based on impact score with artificial ceiling of max emissions
        uint256 calculatedEmissions = baseEmissionsPerEpoch;

        // For example, add 1 CEL per 1000 impact score points
        calculatedEmissions = calculatedEmissions.add(
            _globalImpactScore.div(1000)
        );

        // Cap at max emissions
        if (calculatedEmissions > maxEmissionsPerEpoch) {
            return maxEmissionsPerEpoch;
        }

        return calculatedEmissions;
    }

    /**
     * @dev Set metrics score for a project (placeholder for now)
     * @param projectId The project ID
     * @param score The metrics score to set
     */
    function setProjectMetricsScore(
        uint256 projectId,
        uint256 score
    ) external override onlyOwner {
        projectMetricsScore[projectId] = score;
    }

    /**
     * @dev Set global metrics score (placeholder for now)
     * @param score The global metrics score to set
     */
    function setGlobalMetricsScore(uint256 score) external override onlyOwner {
        globalMetricsScore = score;
    }

    /**
     * @dev Claim staking emissions for a specific epoch and project
     * @param epochNumber The epoch number to claim for
     * @param projectId The project ID to claim for
     */
    function claimStakingEmissions(
        uint256 epochNumber,
        uint256 projectId
    ) external override nonReentrant {
        require(epochNumber > 0 && epochNumber < currentEpoch, "Invalid epoch");
        require(
            innovationUnits.projectIdExists(projectId),
            "Project does not exist"
        );
        require(
            !hasClaimedStakingEmissions[epochNumber][projectId][msg.sender],
            "Already claimed"
        );

        // Get staking data from the end of the epoch
        uint256 projectStakingEmissions = epochProjectStakingEmissions[
            epochNumber
        ][projectId];

        // If no emissions for this project, return early
        if (projectStakingEmissions == 0) {
            return;
        }

        // Calculate user's share based on their staking score at epoch end
        uint256 userScore = stakingContract.getUserProjectScore(
            projectId,
            msg.sender
        );
        uint256 projectScore = stakingContract.getProjectScore(projectId);

        // If project has no score, or user has no score, return early
        if (projectScore == 0 || userScore == 0) {
            return;
        }

        // Calculate user's emissions share
        uint256 userEmissions = projectStakingEmissions.mul(userScore).div(
            projectScore
        );

        // Mark as claimed
        hasClaimedStakingEmissions[epochNumber][projectId][msg.sender] = true;

        // Transfer emissions to user
        if (userEmissions > 0) {
            // Using SafeERC20 wrapper for the transfer
            IERC20(address(celToken)).safeTransfer(msg.sender, userEmissions);
            emit StakingEmissionsClaimed(
                epochNumber,
                projectId,
                msg.sender,
                userEmissions
            );
        }
    }

    /**
     * @dev Claim IU holder emissions for a specific epoch and project
     * @param epochNumber The epoch number to claim for
     * @param projectId The project ID to claim for
     */
    function claimIUHolderEmissions(
        uint256 epochNumber,
        uint256 projectId
    ) external override nonReentrant {
        require(epochNumber > 0 && epochNumber < currentEpoch, "Invalid epoch");
        require(
            innovationUnits.projectIdExists(projectId),
            "Project does not exist"
        );
        require(
            !hasClaimedIUHolderEmissions[epochNumber][projectId][msg.sender],
            "Already claimed"
        );

        // Get IU holder emissions for this project in this epoch
        uint256 projectIUHolderEmissions = epochProjectIUHolderEmissions[
            epochNumber
        ][projectId];

        // If no emissions for this project, return early
        if (projectIUHolderEmissions == 0) {
            return;
        }

        // Calculate user's share based on their IU holdings at epoch end
        uint256 userIUs = innovationUnits.balanceOf(msg.sender, projectId);
        uint256 totalProjectIUs = 0;

        // Get total supply of IUs for this project
        // Note: We need to track or calculate total IUs at the end of the epoch
        // For simplicity, we're using current total, but a snapshot mechanism would be more accurate
        (, uint256[] memory amounts) = innovationUnits.getInvestorsInfo(
            projectId
        );
        for (uint256 i = 0; i < amounts.length; i++) {
            totalProjectIUs = totalProjectIUs.add(amounts[i]);
        }

        // If no IUs in circulation or user has none, return early
        if (totalProjectIUs == 0 || userIUs == 0) {
            return;
        }

        // Calculate user's emissions share
        uint256 userEmissions = projectIUHolderEmissions.mul(userIUs).div(
            totalProjectIUs
        );

        // Mark as claimed
        hasClaimedIUHolderEmissions[epochNumber][projectId][msg.sender] = true;

        // Transfer emissions to user
        if (userEmissions > 0) {
            // Using SafeERC20 wrapper for the transfer
            IERC20(address(celToken)).safeTransfer(msg.sender, userEmissions);
            emit IUHolderEmissionsClaimed(
                epochNumber,
                projectId,
                msg.sender,
                userEmissions
            );
        }
    }

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
    ) external view override returns (bool hasUnclaimed, uint256 amount) {
        if (
            epochNumber == 0 ||
            epochNumber >= currentEpoch ||
            !innovationUnits.projectIdExists(projectId) ||
            hasClaimedStakingEmissions[epochNumber][projectId][user]
        ) {
            return (false, 0);
        }

        uint256 projectStakingEmissions = epochProjectStakingEmissions[
            epochNumber
        ][projectId];

        if (projectStakingEmissions == 0) {
            return (false, 0);
        }

        uint256 userScore = stakingContract.getUserProjectScore(
            projectId,
            user
        );
        uint256 projectScore = stakingContract.getProjectScore(projectId);

        if (projectScore == 0 || userScore == 0) {
            return (false, 0);
        }

        uint256 userEmissions = projectStakingEmissions.mul(userScore).div(
            projectScore
        );

        return (userEmissions > 0, userEmissions);
    }

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
    ) external view override returns (bool hasUnclaimed, uint256 amount) {
        if (
            epochNumber == 0 ||
            epochNumber >= currentEpoch ||
            !innovationUnits.projectIdExists(projectId) ||
            hasClaimedIUHolderEmissions[epochNumber][projectId][user]
        ) {
            return (false, 0);
        }

        uint256 projectIUHolderEmissions = epochProjectIUHolderEmissions[
            epochNumber
        ][projectId];

        if (projectIUHolderEmissions == 0) {
            return (false, 0);
        }

        uint256 userIUs = innovationUnits.balanceOf(user, projectId);
        uint256 totalProjectIUs = 0;

        // Get total supply of IUs for this project
        // Note: We need to track or calculate total IUs at the end of the epoch
        // For simplicity, we're using current total, but a snapshot mechanism would be more accurate
        (, uint256[] memory amounts) = innovationUnits.getInvestorsInfo(
            projectId
        );
        for (uint256 i = 0; i < amounts.length; i++) {
            totalProjectIUs = totalProjectIUs.add(amounts[i]);
        }

        if (totalProjectIUs == 0 || userIUs == 0) {
            return (false, 0);
        }

        uint256 userEmissions = projectIUHolderEmissions.mul(userIUs).div(
            totalProjectIUs
        );

        return (userEmissions > 0, userEmissions);
    }

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
        override
        returns (
            uint256 currentEpochNumber,
            bool isActive,
            uint256 startTime,
            uint256 endTime
        )
    {
        return (
            currentEpoch,
            epochActive,
            epochStartTimestamp,
            epochEndTimestamp
        );
    }

    /**
     * @dev Get emissions data for a specific epoch and project
     * @param epochNumber The epoch number to query
     * @param projectId The project ID to query
     * @return totalEmissions Total emissions for the project in this epoch
     * @return stakingEmissions Emissions allocated to stakers
     * @return iuHolderEmissions Emissions allocated to IU holders
     */
    function getEpochProjectEmissions(
        uint256 epochNumber,
        uint256 projectId
    )
        external
        view
        override
        returns (
            uint256 totalEmissions,
            uint256 stakingEmissions,
            uint256 iuHolderEmissions
        )
    {
        totalEmissions = epochProjectEmissions[epochNumber][projectId];
        stakingEmissions = epochProjectStakingEmissions[epochNumber][projectId];
        iuHolderEmissions = epochProjectIUHolderEmissions[epochNumber][
            projectId
        ];

        return (totalEmissions, stakingEmissions, iuHolderEmissions);
    }

    // Configuration functions

    /**
     * @dev Update epoch duration
     * @param _epochDuration New epoch duration in seconds
     */
    function setEpochDuration(
        uint256 _epochDuration
    ) external override onlyOwner {
        require(
            _epochDuration >= 1 days && _epochDuration <= 90 days,
            "Invalid duration"
        );

        uint256 oldDuration = epochDuration;
        epochDuration = _epochDuration;

        emit EpochDurationUpdated(oldDuration, _epochDuration);
    }

    /**
     * @dev Update base emissions per epoch
     * @param _baseEmissions New base emissions per epoch
     */
    function setBaseEmissionsPerEpoch(
        uint256 _baseEmissions
    ) external override onlyOwner {
        require(
            _baseEmissions > 0 && _baseEmissions <= maxEmissionsPerEpoch,
            "Invalid amount"
        );

        uint256 oldEmissions = baseEmissionsPerEpoch;
        baseEmissionsPerEpoch = _baseEmissions;

        emit BaseEmissionsUpdated(oldEmissions, _baseEmissions);
    }

    /**
     * @dev Update maximum emissions per epoch
     * @param _maxEmissions New maximum emissions per epoch
     */
    function setMaxEmissionsPerEpoch(
        uint256 _maxEmissions
    ) external override onlyOwner {
        require(
            _maxEmissions >= baseEmissionsPerEpoch,
            "Must be >= base emissions"
        );

        uint256 oldEmissions = maxEmissionsPerEpoch;
        maxEmissionsPerEpoch = _maxEmissions;

        emit MaxEmissionsUpdated(oldEmissions, _maxEmissions);
    }

    /**
     * @dev Update global weights for staking and metrics scores
     * @param _stakingWeight New weight for staking score
     * @param _metricsWeight New weight for metrics score
     */
    function setGlobalWeights(
        uint256 _stakingWeight,
        uint256 _metricsWeight
    ) external override onlyOwner {
        require(
            _stakingWeight.add(_metricsWeight) == PRECISION,
            "Weights must sum to 100%"
        );

        globalStakingScoreWeight = _stakingWeight;
        globalMetricsScoreWeight = _metricsWeight;

        emit GlobalWeightsUpdated(_stakingWeight, _metricsWeight);
    }

    /**
     * @dev Update emission shares between stakers and IU holders
     * @param _stakingShare New share for stakers
     * @param _iuHoldersShare New share for IU holders
     */
    function setEmissionShares(
        uint256 _stakingShare,
        uint256 _iuHoldersShare
    ) external override onlyOwner {
        require(
            _stakingShare.add(_iuHoldersShare) == PRECISION,
            "Shares must sum to 100%"
        );

        stakingEmissionShare = _stakingShare;
        iuHoldersEmissionShare = _iuHoldersShare;

        emit EmissionSharesUpdated(_stakingShare, _iuHoldersShare);
    }

    /**
     * @dev Withdraw tokens in case of emergency
     * @param token Address of the token to withdraw
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external override onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}
