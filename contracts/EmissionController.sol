// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IEmissionController.sol";
import "./interfaces/ICELToken.sol";
import "./interfaces/IInnovationUnits.sol";
import "./interfaces/IStaking.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title EmissionController
 * @dev Implementation of the Emission Controller that manages token emissions
 * Controls the emission of CEL tokens based on PoI scores and staking amounts
 */
contract EmissionController is IEmissionController, Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    // Constants for emission calculations
    uint256 private constant SECONDS_IN_DAY = 86400;
    uint256 private constant PRECISION = 1e18;

    // Emission period configuration
    uint256 public daysInEmissionPeriod = 7; // Default: 1 week period (configurable)
    uint256 public emissionPeriodSeconds = SECONDS_IN_DAY * 7; // Calculated based on daysInEmissionPeriod

    // Distribution parameters
    uint256 public iuHolderShare = (80 * PRECISION) / 100; // 80% to IU holders (configurable)
    uint256 public stakerShare = (20 * PRECISION) / 100; // 20% to stakers (configurable)

    // Impact score calculation parameters
    uint256 public stakingScoreWeight = PRECISION / 2; // 50% weight for staking score (configurable)
    uint256 public metricsScoreWeight = PRECISION / 2; // 50% weight for metrics score (configurable)

    // Platform emission calculation parameters
    uint256 public platformStakingWeight = PRECISION / 2; // 50% weight for platform staking (configurable)
    uint256 public platformMetricsWeight = PRECISION / 2; // 50% weight for platform metrics (configurable)

    // Alpha and Beta parameters for emission formula (now used for staking score calculation)
    uint256 public alpha = 1 * PRECISION; // Weight for stake amount (1.0 = 100%)
    uint256 public beta = 1 * PRECISION; // Weight for stake duration (1.0 = 100%)

    // CEL Token contract
    ICELToken public celToken;

    // Innovation Units contract
    IInnovationUnits public innovationUnits;

    // Staking contract
    IStaking public staking;

    // Emission parameters
    uint256 public emissionStartTime;
    uint256 public currentPeriod;
    uint256 public periodEmissionCap; // Maximum emission per period
    uint256 public totalEmitted;
    uint256 public currentPeriodEmitted;
    uint256 public emissionDecayRate; // Rate at which emissions decrease (percentage, scaled by PRECISION)
    uint256 public lastUpdateTime;

    // Project management
    mapping(uint256 => bool) public projectRegistry; // projectId => exists
    uint256 public projectCount;

    // Project data structures
    struct ProjectData {
        uint256 poiScore; // Proof of Impact score for the project
        uint256 stakingScore; // Total staking score (time-weighted)
        uint256 metricsScore; // Score based on project metrics
        uint256 impactScore; // Combined score from staking and metrics
        uint256 totalEmissions; // Total emissions allocated to this project
        uint256 contributorCount; // Number of contributors
        uint256 investorCount; // Number of investors
        uint256 totalStaked; // Total CEL tokens staked on the project
    }

    struct UserData {
        uint256 stakingScore; // User's staking score (time-weighted)
        uint256 stakingShare; // User's share of staking in a project
        uint256 iuShare; // User's share of IUs in a project
        uint256 pendingRewards; // Unclaimed rewards
        uint256 lastClaimPeriod; // Last period when rewards were claimed
    }

    // Mappings for project and user data
    mapping(uint256 => ProjectData) public projects; // projectId => ProjectData
    mapping(uint256 => mapping(address => UserData)) public userProjects; // projectId => user => UserData
    mapping(uint256 => uint256) public projectEmissionsPerPeriod; // projectId => emissions per period

    // Platform metrics
    uint256 public platformTotalStakingScore;
    uint256 public platformMetricsScore;
    uint256 public platformImpactScore;

    // Array of active project IDs
    uint256[] public activeProjects;

    // Additional events for new functionality
    event EmissionPeriodUpdated(uint256 daysInPeriod, uint256 periodSeconds);
    event ImpactScoreWeightsUpdated(
        uint256 stakingWeight,
        uint256 metricsWeight
    );
    event PlatformEmissionWeightsUpdated(
        uint256 stakingWeight,
        uint256 metricsWeight
    );
    event StakingScoreParametersUpdated(uint256 alpha, uint256 beta);
    event ProjectImpactScoreUpdated(
        uint256 indexed projectId,
        uint256 impactScore
    );
    event ProjectMetricsScoreUpdated(
        uint256 indexed projectId,
        uint256 metricsScore
    );
    event ProjectStakingScoreUpdated(
        uint256 indexed projectId,
        uint256 stakingScore
    );
    event UserStakingScoreUpdated(
        uint256 indexed projectId,
        address indexed user,
        uint256 stakingScore
    );
    event PlatformImpactScoreUpdated(
        uint256 totalStakingScore,
        uint256 metricsScore,
        uint256 impactScore
    );

    // Events
    event PoIScoreUpdated(uint256 indexed projectId, uint256 newScore);
    event StakingWeightUpdated(uint256 indexed projectId, uint256 newWeight);
    event IUWeightUpdated(uint256 indexed projectId, uint256 newWeight);
    event UserStakingShareUpdated(
        uint256 indexed projectId,
        address indexed user,
        uint256 newShare
    );
    event UserIUShareUpdated(
        uint256 indexed projectId,
        address indexed user,
        uint256 newShare
    );
    event RewardsClaimed(
        uint256 indexed projectId,
        address indexed user,
        uint256 amount
    );
    event EmissionParametersUpdated(
        uint256 periodEmissionCap,
        uint256 decayRate
    );
    event DistributionSharesUpdated(uint256 iuHolderShare, uint256 stakerShare);

    // Project management events
    event ProjectUpdated(
        uint256 indexed projectId,
        uint256 stakeLimit,
        bool active
    );
    event CreatorAssigned(uint256 indexed projectId, address indexed creator);
    event ContributorAssigned(
        uint256 indexed projectId,
        address indexed contributor,
        uint256 amount
    );
    event ProjectCreated(
        uint256 indexed projectId,
        string name,
        string description
    );

    /**
     * @dev Constructor to initialize the Emission Controller
     * @param _celToken Address of the CEL token
     * @param _periodEmissionCap Maximum emission per period
     * @param _emissionDecayRate Rate at which emissions decrease
     */
    constructor(
        address _celToken,
        uint256 _periodEmissionCap,
        uint256 _emissionDecayRate
    ) {
        require(
            _celToken != address(0),
            "EmissionController: zero address provided for token"
        );
        require(
            _periodEmissionCap > 0,
            "EmissionController: emission cap must be greater than zero"
        );

        celToken = ICELToken(_celToken);
        periodEmissionCap = _periodEmissionCap;
        emissionDecayRate = _emissionDecayRate;
        emissionStartTime = block.timestamp;
        lastUpdateTime = block.timestamp;
        currentPeriod = 0;
    }

    /**
     * @dev Sets the address of the InnovationUnits contract
     * @param _innovationUnitsAddress Address of the InnovationUnits contract
     */
    function setInnovationUnitsAddress(
        address _innovationUnitsAddress
    ) external onlyOwner {
        require(
            _innovationUnitsAddress != address(0),
            "EmissionController: invalid address"
        );
        innovationUnits = IInnovationUnits(_innovationUnitsAddress);
    }

    /**
     * @dev Sets the address of the Staking contract
     * @param _stakingAddress Address of the Staking contract
     */
    function setStakingAddress(address _stakingAddress) external onlyOwner {
        require(
            _stakingAddress != address(0),
            "EmissionController: invalid address"
        );
        staking = IStaking(_stakingAddress);
    }

    /**
     * @dev Updates the PoI score for a project
     * @param projectId The ID of the project
     * @param score The new PoI score
     */
    function updatePoI(uint256 projectId, uint256 score) external onlyOwner {
        projects[projectId].poiScore = score;
        emit PoIScoreUpdated(projectId, score);
    }

    /**
     * @dev Updates the staking weight for a project
     * @param projectId The ID of the project
     * @param weight The new staking weight
     */
    function updateStakingWeight(
        uint256 projectId,
        uint256 weight
    ) external onlyOwner {
        projects[projectId].stakingScore = weight;
        emit StakingWeightUpdated(projectId, weight);

        // Add project to active projects if not already there
        bool isProjectExisting = false;
        for (uint256 i = 0; i < activeProjects.length; i++) {
            if (activeProjects[i] == projectId) {
                isProjectExisting = true;
                break;
            }
        }

        if (!isProjectExisting && weight > 0) {
            activeProjects.push(projectId);
        }
    }

    /**
     * @dev Updates the IU weight for a project
     * @param projectId The ID of the project
     * @param weight The new IU weight
     */
    function updateIUWeight(
        uint256 projectId,
        uint256 weight
    ) external onlyOwner {
        projects[projectId].metricsScore = weight;
        emit IUWeightUpdated(projectId, weight);

        // Add project to active projects if not already there
        bool isProjectExisting = false;
        for (uint256 i = 0; i < activeProjects.length; i++) {
            if (activeProjects[i] == projectId) {
                isProjectExisting = true;
                break;
            }
        }

        if (!isProjectExisting && weight > 0) {
            activeProjects.push(projectId);
        }
    }

    /**
     * @dev Updates a user's staking share in a project
     * @param projectId The ID of the project
     * @param user The address of the user
     * @param share The new staking share
     */
    function updateUserStakingShare(
        uint256 projectId,
        address user,
        uint256 share
    ) external onlyOwner {
        userProjects[projectId][user].stakingShare = share;
        emit UserStakingShareUpdated(projectId, user, share);
    }

    /**
     * @dev Updates a user's IU share in a project
     * @param projectId The ID of the project
     * @param user The address of the user
     * @param share The new IU share
     */
    function updateUserIUShare(
        uint256 projectId,
        address user,
        uint256 share
    ) external onlyOwner {
        userProjects[projectId][user].iuShare = share;
        emit UserIUShareUpdated(projectId, user, share);
    }

    /**
     * @dev Updates the distribution shares between IU holders and stakers
     * @param _iuHolderShare Percentage share for IU holders (scaled by PRECISION)
     * @param _stakerShare Percentage share for stakers (scaled by PRECISION)
     */
    function updateDistributionShares(
        uint256 _iuHolderShare,
        uint256 _stakerShare
    ) external onlyOwner {
        require(
            _iuHolderShare.add(_stakerShare) == PRECISION,
            "EmissionController: shares must add up to 100%"
        );

        iuHolderShare = _iuHolderShare;
        stakerShare = _stakerShare;

        emit DistributionSharesUpdated(iuHolderShare, stakerShare);
    }

    /**
     * @dev Updates the emission period configuration
     * @param _daysInPeriod Number of days in an emission period
     */
    function updateEmissionPeriodConfig(
        uint256 _daysInPeriod
    ) external onlyOwner {
        require(
            _daysInPeriod > 0,
            "EmissionController: period must be positive"
        );

        daysInEmissionPeriod = _daysInPeriod;
        emissionPeriodSeconds = SECONDS_IN_DAY * _daysInPeriod;

        emit EmissionPeriodUpdated(daysInEmissionPeriod, emissionPeriodSeconds);
    }

    /**
     * @dev Updates the impact score calculation weights
     * @param _stakingWeight Weight for staking score in impact calculation
     * @param _metricsWeight Weight for metrics score in impact calculation
     */
    function updateImpactScoreWeights(
        uint256 _stakingWeight,
        uint256 _metricsWeight
    ) external onlyOwner {
        require(
            _stakingWeight.add(_metricsWeight) == PRECISION,
            "EmissionController: weights must add up to 100%"
        );

        stakingScoreWeight = _stakingWeight;
        metricsScoreWeight = _metricsWeight;

        // Recalculate all project impact scores with new weights
        for (uint256 i = 0; i < activeProjects.length; i++) {
            uint256 projectId = activeProjects[i];
            updateProjectImpactScore(projectId);
        }

        // Update platform impact score
        updatePlatformImpactScore();

        emit ImpactScoreWeightsUpdated(stakingScoreWeight, metricsScoreWeight);
    }

    /**
     * @dev Updates the platform emission calculation weights
     * @param _stakingWeight Weight for platform staking in emission calculation
     * @param _metricsWeight Weight for platform metrics in emission calculation
     */
    function updatePlatformEmissionWeights(
        uint256 _stakingWeight,
        uint256 _metricsWeight
    ) external onlyOwner {
        require(
            _stakingWeight.add(_metricsWeight) == PRECISION,
            "EmissionController: weights must add up to 100%"
        );

        platformStakingWeight = _stakingWeight;
        platformMetricsWeight = _metricsWeight;

        // Update platform impact score
        updatePlatformImpactScore();

        emit PlatformEmissionWeightsUpdated(
            platformStakingWeight,
            platformMetricsWeight
        );
    }

    /**
     * @dev Updates the staking score calculation parameters
     * @param _alpha Weight for stake amount
     * @param _beta Weight for stake duration
     */
    function updateStakingScoreParameters(
        uint256 _alpha,
        uint256 _beta
    ) external onlyOwner {
        alpha = _alpha;
        beta = _beta;

        // Recalculate all staking scores with new parameters
        for (uint256 i = 0; i < activeProjects.length; i++) {
            uint256 projectId = activeProjects[i];
            updateProjectStakingScore(projectId);
        }

        emit StakingScoreParametersUpdated(alpha, beta);
    }

    /**
     * @dev Updates a project's staking score based on staking data
     * @param projectId The ID of the project
     */
    function updateProjectStakingScore(uint256 projectId) public onlyOwner {
        require(
            projectRegistry[projectId],
            "EmissionController: project does not exist"
        );

        // Get staking data from staking contract
        IStaking.ProjectStakingPool memory pool = staking.getProjectStakingPool(
            projectId
        );
        projects[projectId].totalStaked = pool.totalStaked;

        // Get stakers
        address[] memory projectStakers = staking.getStakers(projectId);
        uint256 totalStakingScore = 0;

        // Calculate staking score for each staker
        for (uint256 i = 0; i < projectStakers.length; i++) {
            address staker = projectStakers[i];
            IStaking.UserStake memory userStake = staking.getUserStake(
                staker,
                projectId
            );

            // Calculate staking score using alpha and beta parameters
            // S = amount^alpha * duration^beta
            uint256 stakingScore = 0;
            if (userStake.amount > 0) {
                // Calculate stake duration in days
                uint256 stakeDuration = userStake.lockPeriod.div(
                    SECONDS_IN_DAY
                );

                // Apply weights to amount and duration
                uint256 weightedAmount = userStake.amount **
                    (alpha.div(PRECISION));
                uint256 weightedDuration = stakeDuration **
                    (beta.div(PRECISION));

                // Calculate staking score
                stakingScore = weightedAmount.mul(weightedDuration);

                // Update user staking score
                userProjects[projectId][staker].stakingScore = stakingScore;

                // Emit event
                emit UserStakingScoreUpdated(projectId, staker, stakingScore);
            }

            // Add to total
            totalStakingScore = totalStakingScore.add(stakingScore);
        }

        // Update project staking score
        projects[projectId].stakingScore = totalStakingScore;

        // Update platform total staking score
        platformTotalStakingScore = 0;
        for (uint256 i = 0; i < activeProjects.length; i++) {
            uint256 pId = activeProjects[i];
            platformTotalStakingScore = platformTotalStakingScore.add(
                projects[pId].stakingScore
            );
        }

        // Update project impact score
        updateProjectImpactScore(projectId);

        emit ProjectStakingScoreUpdated(projectId, totalStakingScore);
    }

    /**
     * @dev Updates a project's metrics score based on activity data
     * @param projectId The ID of the project
     * @param contributorCount Number of contributors
     * @param investorCount Number of investors
     * @param additionalMetric Optional additional metric (e.g., external data)
     */
    function updateProjectMetricsScore(
        uint256 projectId,
        uint256 contributorCount,
        uint256 investorCount,
        uint256 additionalMetric
    ) external onlyOwner {
        require(
            projectRegistry[projectId],
            "EmissionController: project does not exist"
        );

        // Store metrics data
        projects[projectId].contributorCount = contributorCount;
        projects[projectId].investorCount = investorCount;

        // Calculate metrics score (example formula)
        uint256 metricsScore = contributorCount
            .mul(1000)
            .add(investorCount.mul(500))
            .add(additionalMetric);
        projects[projectId].metricsScore = metricsScore;

        // Update project impact score
        updateProjectImpactScore(projectId);

        emit ProjectMetricsScoreUpdated(projectId, metricsScore);
    }

    /**
     * @dev Updates a project's impact score based on staking and metrics scores
     * @param projectId The ID of the project
     */
    function updateProjectImpactScore(uint256 projectId) public {
        ProjectData storage project = projects[projectId];

        // Calculate impact score using weighted average of staking and metrics scores
        uint256 impactScore = project
            .stakingScore
            .mul(stakingScoreWeight)
            .add(project.metricsScore.mul(metricsScoreWeight))
            .div(PRECISION);

        // Update project impact score
        project.impactScore = impactScore;

        // Update platform impact score
        updatePlatformImpactScore();

        emit ProjectImpactScoreUpdated(projectId, impactScore);
    }

    /**
     * @dev Updates the platform metrics score (for global emission control)
     * @param _metricsScore New platform metrics score
     */
    function updatePlatformMetricsScore(
        uint256 _metricsScore
    ) external onlyOwner {
        platformMetricsScore = _metricsScore;

        // Update platform impact score
        updatePlatformImpactScore();
    }

    /**
     * @dev Updates the platform impact score based on staking and metrics
     */
    function updatePlatformImpactScore() public {
        // Calculate platform impact score using weighted average
        platformImpactScore = platformTotalStakingScore
            .mul(platformStakingWeight)
            .add(platformMetricsScore.mul(platformMetricsWeight))
            .div(PRECISION);

        emit PlatformImpactScoreUpdated(
            platformTotalStakingScore,
            platformMetricsScore,
            platformImpactScore
        );
    }

    /**
     * @dev Calculates the emission cap based on platform impact score
     * @return uint256 The calculated emission cap
     */
    function calculateEmissionCap() public view returns (uint256) {
        // If platform impact score is 0, return 0 emissions
        if (platformImpactScore == 0) {
            return 0;
        }

        // Calculate emissions based on impact score and base cap
        // This is a simple linear formula; can be adjusted as needed
        return periodEmissionCap.mul(platformImpactScore).div(1e6);
    }

    /**
     * @dev Distributes emissions to projects based on their impact scores
     */
    function distributeEmissions() external onlyOwner {
        // Ensure we're in a new period
        updateEmissionPeriod();

        // Calculate total impact score across all projects
        uint256 totalImpactScore = 0;
        for (uint256 i = 0; i < activeProjects.length; i++) {
            uint256 projectId = activeProjects[i];
            ProjectData storage project = projects[projectId];

            // Skip projects with zero impact score
            if (project.impactScore == 0) continue;

            // Add to total impact score
            totalImpactScore = totalImpactScore.add(project.impactScore);
        }

        // Skip if no projects have impact score
        if (totalImpactScore == 0) return;

        // Calculate emission per project based on impact score proportion
        uint256 availableEmission = getAvailableEmission();
        for (uint256 i = 0; i < activeProjects.length; i++) {
            uint256 projectId = activeProjects[i];
            ProjectData storage project = projects[projectId];

            // Skip projects with zero impact score
            if (project.impactScore == 0) continue;

            // Calculate emission share for this project
            uint256 projectEmission = availableEmission
                .mul(project.impactScore)
                .div(totalImpactScore);

            // Update project emissions
            projectEmissionsPerPeriod[projectId] = projectEmission;
        }
    }

    /**
     * @dev Claims rewards for a user from a project
     * @param projectId The ID of the project
     */
    function claimRewards(uint256 projectId) external nonReentrant {
        UserData storage userData = userProjects[projectId][msg.sender];
        ProjectData storage project = projects[projectId];

        // Calculate user's rewards
        uint256 projectEmission = projectEmissionsPerPeriod[projectId];

        // Calculate staking rewards based on staking score proportion
        uint256 stakingRewards = 0;
        if (project.stakingScore > 0 && userData.stakingScore > 0) {
            stakingRewards = projectEmission
                .mul(userData.stakingScore)
                .div(project.stakingScore)
                .mul(stakerShare)
                .div(PRECISION);
        }

        // Calculate IU holder rewards based on IU holdings proportion
        uint256 iuRewards = projectEmission
            .mul(userData.iuShare)
            .div(PRECISION)
            .mul(iuHolderShare)
            .div(PRECISION);

        uint256 totalRewards = stakingRewards.add(iuRewards);
        require(totalRewards > 0, "EmissionController: no rewards to claim");

        // Reset pending rewards and update last claim period
        userData.pendingRewards = 0;
        userData.lastClaimPeriod = currentPeriod;

        // Emit tokens to the user
        bool success = emitTokens(msg.sender, totalRewards);
        require(success, "EmissionController: emission failed");

        emit RewardsClaimed(projectId, msg.sender, totalRewards);
    }

    /**
     * @dev Returns the project emissions per period
     * @param projectId The ID of the project
     * @return uint256 The emissions per period
     */
    function getProjectEmissions(
        uint256 projectId
    ) external view returns (uint256) {
        return projectEmissionsPerPeriod[projectId];
    }

    /**
     * @dev Emits tokens to an account based on the emission schedule
     * @param account The address to receive the tokens
     * @param amount The amount of tokens to emit
     * @return bool indicating if the emission was successful
     */
    function emitTokens(
        address account,
        uint256 amount
    ) public override onlyOwner returns (bool) {
        require(
            account != address(0),
            "EmissionController: cannot emit to zero address"
        );
        require(amount > 0, "EmissionController: amount must be positive");

        // Ensure amount doesn't exceed available emission
        uint256 availableEmission = getAvailableEmission();
        require(
            amount <= availableEmission,
            "EmissionController: exceeds available emission"
        );

        // Update emission tracking
        currentPeriodEmitted = currentPeriodEmitted.add(amount);
        totalEmitted = totalEmitted.add(amount);

        // Mint tokens to the account
        celToken.mint(account, amount);

        emit TokensEmitted(account, amount, currentPeriod);

        return true;
    }

    /**
     * @dev Returns the amount of tokens that can be emitted in the current period
     * @return uint256 the amount of tokens available for emission
     */
    function getAvailableEmission() public view override returns (uint256) {
        return periodEmissionCap.sub(currentPeriodEmitted);
    }

    /**
     * @dev Returns how many tokens have been emitted in total
     * @return uint256 the total amount of tokens emitted
     */
    function getTotalEmitted() external view override returns (uint256) {
        return totalEmitted;
    }

    /**
     * @dev Returns how many tokens have been emitted in the current period
     * @return uint256 the amount of tokens emitted in the current period
     */
    function getCurrentPeriodEmitted()
        external
        view
        override
        returns (uint256)
    {
        return currentPeriodEmitted;
    }

    /**
     * @dev Returns the current emission period
     * @return uint256 the current emission period
     */
    function getCurrentPeriod() external view override returns (uint256) {
        return currentPeriod;
    }

    /**
     * @dev Triggers the calculation of a new emission period
     * Should be called at regular intervals to update the emission period
     */
    function updateEmissionPeriod() public override {
        uint256 timeSinceStart = block.timestamp.sub(emissionStartTime);
        uint256 newPeriod = timeSinceStart.div(emissionPeriodSeconds);

        if (newPeriod > currentPeriod) {
            // Calculate decay for the new period
            uint256 periodsPassed = newPeriod.sub(currentPeriod);
            uint256 newCap = calculateEmissionCap(); // Use dynamic cap calculation

            // Apply decay for each period passed
            for (uint256 i = 0; i < periodsPassed; i++) {
                newCap = newCap.mul(PRECISION.sub(emissionDecayRate)).div(
                    PRECISION
                );
            }

            // Reset current period emitted and update cap
            currentPeriodEmitted = 0;
            periodEmissionCap = newCap;
            currentPeriod = newPeriod;

            emit NewEmissionPeriod(currentPeriod, periodEmissionCap);
        }
    }

    /**
     * @dev Updates emission parameters
     * @param _periodEmissionCap New maximum emission per period
     * @param _emissionDecayRate New rate at which emissions decrease
     */
    function updateEmissionParameters(
        uint256 _periodEmissionCap,
        uint256 _emissionDecayRate
    ) external onlyOwner {
        require(
            _periodEmissionCap > 0,
            "EmissionController: emission cap must be greater than zero"
        );
        require(
            _emissionDecayRate < PRECISION,
            "EmissionController: decay rate must be less than 100%"
        );

        periodEmissionCap = _periodEmissionCap;
        emissionDecayRate = _emissionDecayRate;

        emit EmissionParametersUpdated(periodEmissionCap, emissionDecayRate);
    }

    /**
     * @dev Updates alpha and beta parameters for the emission formula
     * @param _alpha New alpha value
     * @param _beta New beta value
     */
    function updateWeightParameters(
        uint256 _alpha,
        uint256 _beta
    ) external onlyOwner {
        alpha = _alpha;
        beta = _beta;
    }

    /**
     * @dev Returns the maximum cap for token supply
     * @return uint256 the maximum cap
     */
    function getMaxCap() external view override returns (uint256) {
        return celToken.cap();
    }

    /**
     * @dev Returns the address of the CEL token
     * @return address the CEL token address
     */
    function getCELToken() external view override returns (address) {
        return address(celToken);
    }

    ///////////////////////////////////////////////////////////////////////////////////
    //////////////////////////PROJECT CREATION AND MANAGEMENT//////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////

    /**
     * @dev Creates a new project
     * @param projectId ID of the project
     * @param name Name of the project
     * @param description Description of the project
     * @param totalSupply Total supply of IUs for the project
     * @param creatorShare Percentage of IUs allocated to creator (scaled by PRECISION)
     * @param contributorReserve Percentage of IUs reserved for contributors (scaled by PRECISION)
     * @param investorReserve Percentage of IUs reserved for investors (scaled by PRECISION)
     * @param pricePerUnit Price per IU in CEL tokens
     * @param stakeLimit Maximum stake limit for the project (0 = no limit)
     * @return bool indicating if the creation was successful
     */
    function InitializeProject(
        uint256 projectId,
        string memory name,
        string memory description,
        uint256 totalSupply,
        uint256 creatorShare,
        uint256 contributorReserve,
        uint256 investorReserve,
        uint256 pricePerUnit,
        uint256 stakeLimit
    ) external onlyOwner returns (bool) {
        require(
            !projectRegistry[projectId],
            "EmissionController: project already exists"
        );

        // Create project IUs
        bool iuCreated = innovationUnits.createProject(
            projectId,
            totalSupply,
            creatorShare,
            contributorReserve,
            investorReserve,
            pricePerUnit
        );
        require(iuCreated, "EmissionController: failed to create IUs");

        // Create staking pool with minimum staking period
        uint256 minStakingPeriod = 7 days; // Default minimum staking period
        bool stakingCreated = staking.createStakingPool(
            projectId,
            stakeLimit,
            minStakingPeriod
        );
        require(
            stakingCreated,
            "EmissionController: failed to create staking pool"
        );

        // Register project
        projectRegistry[projectId] = true;
        projectCount++;

        emit ProjectCreated(projectId, name, description);

        return true;
    }

    /**
     * @dev Updates an existing project (currently only staking parameters can be updated)
     * @param projectId ID of the project
     * @param stakeLimit Maximum stake limit for the project (0 = no limit)
     * @param active Whether the project should be active
     * @return bool indicating if the update was successful
     */
    function updateProject(
        uint256 projectId,
        uint256 stakeLimit,
        bool active
    ) external onlyOwner returns (bool) {
        require(
            projectRegistry[projectId],
            "EmissionController: project does not exist"
        );

        // Update staking pool parameters
        bool stakingUpdated = staking.updateStakingPool(
            projectId,
            stakeLimit,
            active,
            7 days, // Default minimum staking period
            730 days // Default maximum staking period (2 years)
        );
        require(
            stakingUpdated,
            "EmissionController: failed to update staking pool"
        );

        // Get and update project config in Innovation Units
        IInnovationUnits.ProjectIUConfig memory config = innovationUnits
            .getProjectConfig(projectId);

        // Using a direct check for isActive rather than calling setProjectActive
        if (config.isActive != active) {
            // Need to implement our own solution to make IU active/inactive
            // We could create an updatePricePerUnit call with a price of 0 to effectively disable it
            // or handle in a different way depending on business requirements
            if (!active) {
                // Set price to 0 to effectively disable purchases
                innovationUnits.updatePricePerUnit(projectId, 0);
            } else {
                // Restore original price or set a default price
                // This is a placeholder - in a real implementation you'd store the original price
                innovationUnits.updatePricePerUnit(projectId, 1e16); // 0.01 tokens
            }
        }

        emit ProjectUpdated(projectId, stakeLimit, active);

        return true;
    }

    /**
     * @dev Assigns a creator to a project
     * @param projectId ID of the project
     * @param creator Address of the creator
     * @return bool indicating if the assignment was successful
     */
    function assignCreator(
        uint256 projectId,
        address creator
    ) external onlyOwner returns (bool) {
        require(
            projectRegistry[projectId],
            "EmissionController: project does not exist"
        );
        require(
            creator != address(0),
            "EmissionController: cannot assign to zero address"
        );

        // Get project configuration to determine creator share
        IInnovationUnits.ProjectIUConfig memory config = innovationUnits
            .getProjectConfig(projectId);

        // Calculate how many IUs the creator should get
        uint256 creatorAmount = config.totalSupply.mul(config.creatorShare).div(
            100 * PRECISION
        );

        // Allocate IUs to creator using allocateToContributor function instead
        // Since allocateToCreator doesn't exist in the interface
        bool success = innovationUnits.allocateToContributor(
            creator,
            projectId,
            creatorAmount
        );
        require(success, "EmissionController: failed to assign creator");

        emit CreatorAssigned(projectId, creator);

        return true;
    }

    /**
     * @dev Assigns a contributor to a project
     * @param projectId ID of the project
     * @param contributor Address of the contributor
     * @param amount Amount of IUs to allocate
     * @return bool indicating if the assignment was successful
     */
    function assignContributor(
        uint256 projectId,
        address contributor,
        uint256 amount
    ) external onlyOwner returns (bool) {
        require(
            projectRegistry[projectId],
            "EmissionController: project does not exist"
        );
        require(
            contributor != address(0),
            "EmissionController: cannot assign to zero address"
        );
        require(
            amount > 0,
            "EmissionController: amount must be greater than zero"
        );

        // Allocate IUs to contributor
        bool success = innovationUnits.allocateToContributor(
            contributor,
            projectId,
            amount
        );
        require(success, "EmissionController: failed to assign contributor");

        emit ContributorAssigned(projectId, contributor, amount);

        return true;
    }

    /**
     * @dev Checks if a project exists
     * @param projectId ID of the project
     * @return bool indicating if the project exists
     */
    function projectExists(uint256 projectId) external view returns (bool) {
        return projectRegistry[projectId];
    }

    /**
     * @dev Returns the number of projects
     * @return uint256 the number of projects
     */
    function getProjectCount() external view returns (uint256) {
        return projectCount;
    }
}
