// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PoIMVP
 * @author ...
 * @notice A minimal Proof-of-Impact contract for rewarding contributors
 *         with ERC-20 tokens. 
 */
contract PoIMVP is Ownable {
    /// @dev Data structure for each project
    struct Project {
        address sponsor;        // The project sponsor
        IERC20 rewardToken;     // The ERC-20 token used for rewards
        uint256 totalPool;      // Total tokens deposited by the sponsor
        bool active;            // Whether this project is active
    }

    /// @dev Data structure for each contribution
    struct Contribution {
        address contributor;    // Contributor who made the impact
        string metadataURI;     // Off-chain reference (commit hash, PR link, etc.)
        uint256 reward;         // Approved reward amount
        bool isFinalized;       // Whether sponsor/oracle has approved or rejected
        bool isPaid;            // Whether the reward has been withdrawn
    }

    /// @notice Maps project IDs to Project structs
    mapping (uint256 => Project) public projects;

    /// @notice projectID => contributionID => Contribution
    mapping (uint256 => mapping (uint256 => Contribution)) public contributions;

    /// @notice Tracks how many contributions have been created for each project
    mapping (uint256 => uint256) public contributionCount;

    /// @dev Emitted when a new project is created
    event ProjectCreated(
        uint256 indexed projectId,
        address indexed sponsor,
        address indexed rewardToken
    );

    /// @dev Emitted when a sponsor deposits tokens into a project
    event ProjectFunded(
        uint256 indexed projectId,
        address indexed sponsor,
        uint256 amount
    );

    /// @dev Emitted when a new contribution is submitted
    event ContributionSubmitted(
        uint256 indexed projectId,
        uint256 indexed contributionId,
        address indexed contributor,
        string metadataURI
    );

    /// @dev Emitted when a contribution is finalized by the sponsor/oracle
    event ContributionFinalized(
        uint256 indexed projectId,
        uint256 indexed contributionId,
        uint256 reward,
        bool approved
    );

    /// @dev Emitted when a contributor withdraws their reward
    event RewardClaimed(
        uint256 indexed projectId,
        uint256 indexed contributionId,
        address indexed contributor,
        uint256 amount
    );

    /**
     * @notice Creates a new project with a given ID and reward token.
     * @param _projectId   Unique ID for the project (external must ensure uniqueness)
     * @param _rewardToken Address of the ERC-20 token used as reward
     */
    function createProject(uint256 _projectId, IERC20 _rewardToken) external {
        // Basic checks
        require(projects[_projectId].sponsor == address(0), "Project already exists");
        require(address(_rewardToken) != address(0), "Invalid token address");

        // Initialize the project
        projects[_projectId] = Project({
            sponsor: msg.sender,
            rewardToken: _rewardToken,
            totalPool: 0,
            active: true
        });

        emit ProjectCreated(_projectId, msg.sender, address(_rewardToken));
    }

    /**
     * @notice Sponsor deposits reward tokens into a project's pool.
     * @dev Sponsor must `approve` this contract beforehand for the token transfer.
     * @param _projectId The ID of the project to fund
     * @param _amount    The amount of tokens to deposit
     */
    function fundProject(uint256 _projectId, uint256 _amount) external {
        Project storage project = projects[_projectId];
        require(project.active, "Project not active or does not exist");
        require(_amount > 0, "Amount must be > 0");

        // Transfer tokens from sponsor to this contract
        bool success = project.rewardToken.transferFrom(msg.sender, address(this), _amount);
        require(success, "Token transfer failed");

        // Increase the total pool
        project.totalPool += _amount;

        emit ProjectFunded(_projectId, msg.sender, _amount);
    }

    /**
     * @notice Contributor submits a new contribution for a given project.
     * @param _projectId  The ID of the project
     * @param _metadataURI Off-chain reference (e.g., commit hash, PR link)
     */
    function submitContribution(uint256 _projectId, string calldata _metadataURI) external {
        Project storage project = projects[_projectId];
        require(project.active, "Project not active or does not exist");
        
        uint256 currentId = contributionCount[_projectId];
        contributionCount[_projectId]++;

        contributions[_projectId][currentId] = Contribution({
            contributor: msg.sender,
            metadataURI: _metadataURI,
            reward: 0,
            isFinalized: false,
            isPaid: false
        });

        emit ContributionSubmitted(_projectId, currentId, msg.sender, _metadataURI);
    }

    /**
     * @notice Sponsor or an authorized oracle finalizes a contribution,
     *         approving or rejecting it and specifying a reward amount if approved.
     * @param _projectId       The ID of the project
     * @param _contributionId  The ID of the contribution
     * @param _reward          The reward amount (0 if rejecting)
     * @param _approved        True if the contribution is valid, false if rejected
     */
    function finalizeContribution(
        uint256 _projectId,
        uint256 _contributionId,
        uint256 _reward,
        bool _approved
    ) 
        external 
    {
        Project storage project = projects[_projectId];
        require(project.active, "Project not active");
        require(msg.sender == project.sponsor || msg.sender == owner(), 
            "Not authorized to finalize");

        Contribution storage contrib = contributions[_projectId][_contributionId];
        require(!contrib.isFinalized, "Already finalized");

        // If approved, set the reward (capped by project pool)
        if (_approved) {
            require(_reward <= project.totalPool, "Not enough tokens in project pool");
            contrib.reward = _reward;
        }

        // Mark as finalized
        contrib.isFinalized = true;

        emit ContributionFinalized(_projectId, _contributionId, _reward, _approved);
    }

    /**
     * @notice Contributor claims their reward after a contribution has been approved.
     * @param _projectId      The ID of the project
     * @param _contributionId The ID of the contribution
     */
    function claimReward(uint256 _projectId, uint256 _contributionId) external {
        Contribution storage contrib = contributions[_projectId][_contributionId];
        Project storage project = projects[_projectId];

        require(contrib.isFinalized, "Contribution not finalized");
        require(!contrib.isPaid, "Reward already claimed");
        require(contrib.contributor == msg.sender, "Not your contribution");
        require(contrib.reward > 0, "No reward allocated");

        // Transfer the reward to the contributor
        uint256 rewardAmount = contrib.reward;
        contrib.isPaid = true;
        project.totalPool -= rewardAmount; // reduce project pool

        bool success = project.rewardToken.transfer(msg.sender, rewardAmount);
        require(success, "Token transfer failed");

        emit RewardClaimed(_projectId, _contributionId, msg.sender, rewardAmount);
    }

    /**
     * @notice Sponsor or owner can deactivate a project to prevent new contributions.
     *         This does not affect existing contributions but stops new ones.
     * @param _projectId The ID of the project
     */
    function deactivateProject(uint256 _projectId) external {
        Project storage project = projects[_projectId];
        require(project.active, "Project already inactive or doesn't exist");
        require(msg.sender == project.sponsor || msg.sender == owner(),
            "Not authorized to deactivate");

        project.active = false;
    }
}
