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
    uint256 private constant DAYS_IN_EMISSION_PERIOD = 7; // 1 week period
    uint256 private constant EMISSION_PERIOD_SECONDS =
        SECONDS_IN_DAY * DAYS_IN_EMISSION_PERIOD;
    uint256 private constant PRECISION = 1e18;

    // Alpha and Beta parameters for emission formula
    // E_i = (S_i^α × I_i^β) / Σ(S_j^α × I_j^β)
    uint256 public alpha = 1 * PRECISION; // Weight for staking (1.0 = 100%)
    uint256 public beta = 1 * PRECISION; // Weight for IU holdings (1.0 = 100%)

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

    // Project data structures
    struct ProjectData {
        uint256 poiScore; // PoI score for the project
        uint256 stakingWeight; // Total staking weight
        uint256 iuWeight; // Total IU weight
        uint256 totalEmissions; // Total emissions allocated to this project
    }

    struct UserData {
        uint256 stakingShare; // User's share of staking in a project
        uint256 iuShare; // User's share of IUs in a project
        uint256 pendingRewards; // Unclaimed rewards
        uint256 lastClaimPeriod; // Last period when rewards were claimed
    }

    // Mappings for project and user data
    mapping(uint256 => ProjectData) public projects; // projectId => ProjectData
    mapping(uint256 => mapping(address => UserData)) public userProjects; // projectId => user => UserData
    mapping(uint256 => uint256) public projectEmissionsPerPeriod; // projectId => emissions per period

    // Array of active project IDs
    uint256[] public activeProjects;

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
        projects[projectId].stakingWeight = weight;
        emit StakingWeightUpdated(projectId, weight);

        // Add project to active projects if not already there
        bool projectExists = false;
        for (uint256 i = 0; i < activeProjects.length; i++) {
            if (activeProjects[i] == projectId) {
                projectExists = true;
                break;
            }
        }

        if (!projectExists && weight > 0) {
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
        projects[projectId].iuWeight = weight;
        emit IUWeightUpdated(projectId, weight);

        // Add project to active projects if not already there
        bool projectExists = false;
        for (uint256 i = 0; i < activeProjects.length; i++) {
            if (activeProjects[i] == projectId) {
                projectExists = true;
                break;
            }
        }

        if (!projectExists && weight > 0) {
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
     * @dev Distributes emissions to projects based on the formula
     * E_i = (S_i^α × I_i^β) / Σ(S_j^α × I_j^β)
     */
    function distributeEmissions() external onlyOwner {
        // Ensure we're in a new period
        updateEmissionPeriod();

        // Calculate total project weights
        uint256 totalWeight = 0;
        for (uint256 i = 0; i < activeProjects.length; i++) {
            uint256 projectId = activeProjects[i];
            ProjectData storage project = projects[projectId];

            // Skip projects with zero weights
            if (project.stakingWeight == 0 || project.iuWeight == 0) continue;

            // Calculate project weight using the formula: (S_i^α × I_i^β)
            uint256 stakingFactor = (project.stakingWeight **
                (alpha / PRECISION));
            uint256 iuFactor = (project.iuWeight ** (beta / PRECISION));
            uint256 projectWeight = (stakingFactor * iuFactor) / PRECISION;

            // Add to total weight
            totalWeight = totalWeight.add(projectWeight);
        }

        // Skip if no projects have weight
        if (totalWeight == 0) return;

        // Calculate emission per project
        uint256 availableEmission = getAvailableEmission();
        for (uint256 i = 0; i < activeProjects.length; i++) {
            uint256 projectId = activeProjects[i];
            ProjectData storage project = projects[projectId];

            // Skip projects with zero weights
            if (project.stakingWeight == 0 || project.iuWeight == 0) continue;

            // Calculate project weight
            uint256 stakingFactor = (project.stakingWeight **
                (alpha / PRECISION));
            uint256 iuFactor = (project.iuWeight ** (beta / PRECISION));
            uint256 projectWeight = (stakingFactor * iuFactor) / PRECISION;

            // Calculate emission share for this project
            uint256 projectEmission = availableEmission.mul(projectWeight).div(
                totalWeight
            );

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

        // Calculate user's rewards
        uint256 projectEmission = projectEmissionsPerPeriod[projectId];
        uint256 stakingRewards = projectEmission
            .mul(userData.stakingShare)
            .div(PRECISION)
            .div(2); // 50% to stakers
        uint256 iuRewards = projectEmission
            .mul(userData.iuShare)
            .div(PRECISION)
            .div(2); // 50% to IU holders

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
        uint256 newPeriod = timeSinceStart.div(EMISSION_PERIOD_SECONDS);

        if (newPeriod > currentPeriod) {
            // Calculate decay for the new period
            uint256 periodsPassed = newPeriod.sub(currentPeriod);
            uint256 newCap = periodEmissionCap;

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
}
