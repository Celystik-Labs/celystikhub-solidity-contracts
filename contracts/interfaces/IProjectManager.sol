// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IProjectManager
 * @dev Interface for the Project Manager contract that handles project operations
 */
interface IProjectManager {
    /**
     * @dev Struct to represent a project
     */
    struct Project {
        uint256 id;
        string name;
        string description;
        address owner;
        uint256 fundingGoal;
        uint256 currentFunding;
        uint256 stakingAmount;
        uint256 rewardsAllocated;
        bool isActive;
        uint256 createdAt;
        uint256 completedAt;
    }

    /**
     * @dev Struct to represent a task within a project
     */
    struct Task {
        uint256 id;
        uint256 projectId;
        string title;
        string description;
        uint256 reward;
        address assignee;
        bool isCompleted;
        uint256 createdAt;
        uint256 completedAt;
    }

    /**
     * @dev Struct to represent a stake in a project
     */
    struct Stake {
        address staker;
        uint256 projectId;
        uint256 amount;
        uint256 timestamp;
    }

    /**
     * @dev Creates a new project
     * @param name Name of the project
     * @param description Description of the project
     * @param fundingGoal Funding goal in tokens
     * @return uint256 The ID of the newly created project
     */
    function createProject(
        string calldata name,
        string calldata description,
        uint256 fundingGoal
    ) external returns (uint256);

    /**
     * @dev Funds a project with tokens
     * @param projectId ID of the project to fund
     * @param amount Amount of tokens to fund
     * @return bool indicating if the funding was successful
     */
    function fundProject(
        uint256 projectId,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Stakes tokens on a project
     * @param projectId ID of the project to stake on
     * @param amount Amount of tokens to stake
     * @return bool indicating if the staking was successful
     */
    function stakeOnProject(
        uint256 projectId,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Unstakes tokens from a project
     * @param projectId ID of the project to unstake from
     * @param amount Amount of tokens to unstake
     * @return bool indicating if the unstaking was successful
     */
    function unstakeFromProject(
        uint256 projectId,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Creates a new task in a project
     * @param projectId ID of the project
     * @param title Title of the task
     * @param description Description of the task
     * @param reward Reward amount for completing the task
     * @return uint256 The ID of the newly created task
     */
    function createTask(
        uint256 projectId,
        string calldata title,
        string calldata description,
        uint256 reward
    ) external returns (uint256);

    /**
     * @dev Assigns a task to an address
     * @param taskId ID of the task
     * @param assignee Address to assign the task to
     * @return bool indicating if the assignment was successful
     */
    function assignTask(
        uint256 taskId,
        address assignee
    ) external returns (bool);

    /**
     * @dev Marks a task as completed
     * @param taskId ID of the task
     * @return bool indicating if the completion was successful
     */
    function completeTask(uint256 taskId) external returns (bool);

    /**
     * @dev Marks a project as completed
     * @param projectId ID of the project
     * @return bool indicating if the completion was successful
     */
    function completeProject(uint256 projectId) external returns (bool);

    /**
     * @dev Gets a project by ID
     * @param projectId ID of the project
     * @return Project struct containing project details
     */
    function getProject(
        uint256 projectId
    ) external view returns (Project memory);

    /**
     * @dev Gets a task by ID
     * @param taskId ID of the task
     * @return Task struct containing task details
     */
    function getTask(uint256 taskId) external view returns (Task memory);

    /**
     * @dev Gets staking info for a user on a project
     * @param user Address of the user
     * @param projectId ID of the project
     * @return Stake struct containing staking details
     */
    function getStake(
        address user,
        uint256 projectId
    ) external view returns (Stake memory);

    /**
     * @dev Gets the total number of projects
     * @return uint256 The total number of projects
     */
    function getProjectCount() external view returns (uint256);

    /**
     * @dev Gets the total number of tasks for a project
     * @param projectId ID of the project
     * @return uint256 The total number of tasks
     */
    function getTaskCount(uint256 projectId) external view returns (uint256);

    /**
     * @dev Gets the tasks for a project
     * @param projectId ID of the project
     * @return Task[] Array of tasks for the project
     */
    function getProjectTasks(
        uint256 projectId
    ) external view returns (Task[] memory);

    /**
     * @dev Emitted when a new project is created
     */
    event ProjectCreated(
        uint256 indexed projectId,
        address indexed owner,
        string name,
        uint256 fundingGoal
    );

    /**
     * @dev Emitted when a project is funded
     */
    event ProjectFunded(
        uint256 indexed projectId,
        address indexed funder,
        uint256 amount
    );

    /**
     * @dev Emitted when tokens are staked on a project
     */
    event ProjectStaked(
        uint256 indexed projectId,
        address indexed staker,
        uint256 amount
    );

    /**
     * @dev Emitted when tokens are unstaked from a project
     */
    event ProjectUnstaked(
        uint256 indexed projectId,
        address indexed staker,
        uint256 amount
    );

    /**
     * @dev Emitted when a new task is created
     */
    event TaskCreated(
        uint256 indexed taskId,
        uint256 indexed projectId,
        string title,
        uint256 reward
    );

    /**
     * @dev Emitted when a task is assigned
     */
    event TaskAssigned(uint256 indexed taskId, address indexed assignee);

    /**
     * @dev Emitted when a task is completed
     */
    event TaskCompleted(
        uint256 indexed taskId,
        address indexed assignee,
        uint256 reward
    );

    /**
     * @dev Emitted when a project is completed
     */
    event ProjectCompleted(uint256 indexed projectId, address indexed owner);
}
