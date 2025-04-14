// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ITokenVesting
 * @dev Interface for the Token Vesting contract that handles token vesting schedules
 */
interface ITokenVesting {
    /**
     * @dev Struct to represent a vesting schedule
     */
    struct VestingSchedule {
        address beneficiary; // Address of the beneficiary
        uint256 start; // Start timestamp of the vesting period
        uint256 cliff; // Timestamp when cliff period ends
        uint256 duration; // Duration of the vesting period
        uint256 slicePeriodSeconds; // Duration of a slice period for the vesting
        uint256 amountTotal; // Total amount of tokens to be vested
        uint256 released; // Amount of tokens already released
        bool revocable; // Whether the vesting is revocable
        bool revoked; // Whether the vesting has been revoked
    }

    /**
     * @dev Creates a new vesting schedule for a beneficiary
     * @param _beneficiary Address of the beneficiary
     * @param _start Start timestamp of the vesting period
     * @param _cliff Cliff period in seconds
     * @param _duration Duration of the vesting in seconds
     * @param _slicePeriodSeconds Duration of a slice period in seconds
     * @param _amount Total amount of tokens to be vested
     * @param _revocable Whether the vesting is revocable or not
     */
    function createVestingSchedule(
        address _beneficiary,
        uint256 _start,
        uint256 _cliff,
        uint256 _duration,
        uint256 _slicePeriodSeconds,
        uint256 _amount,
        bool _revocable
    ) external;

    /**
     * @dev Revokes a vesting schedule
     * @param _vestingScheduleId ID of the vesting schedule
     */
    function revoke(bytes32 _vestingScheduleId) external;

    /**
     * @dev Releases vested tokens for a specific vesting schedule
     * @param _vestingScheduleId ID of the vesting schedule
     * @param _amount Amount of tokens to release
     */
    function release(bytes32 _vestingScheduleId, uint256 _amount) external;

    /**
     * @dev Releases vested tokens for a specific vesting schedule to a different address
     * @param _vestingScheduleId ID of the vesting schedule
     * @param _amount Amount of tokens to release
     * @param _recipient Address that will receive the tokens
     */
    function releaseToAddress(
        bytes32 _vestingScheduleId,
        uint256 _amount,
        address _recipient
    ) external;

    /**
     * @dev Withdraws tokens that are not used in any vesting schedule
     * @param _amount Amount of tokens to withdraw
     */
    function withdraw(uint256 _amount) external;

    /**
     * @dev Gets the vesting schedule information for a given identifier
     * @param _vestingScheduleId ID of the vesting schedule
     * @return VestingSchedule Information about the vesting schedule
     */
    function getVestingSchedule(
        bytes32 _vestingScheduleId
    ) external view returns (VestingSchedule memory);

    /**
     * @dev Gets the vesting schedule ID for a beneficiary and an index
     * @param _beneficiary Address of the beneficiary
     * @param _index Index of the vesting schedule
     * @return bytes32 The vesting schedule ID
     */
    function getVestingScheduleIdAtIndex(
        address _beneficiary,
        uint256 _index
    ) external view returns (bytes32);

    /**
     * @dev Gets the number of vesting schedules for a beneficiary
     * @param _beneficiary Address of the beneficiary
     * @return uint256 The number of vesting schedules
     */
    function getVestingSchedulesCountByBeneficiary(
        address _beneficiary
    ) external view returns (uint256);

    /**
     * @dev Gets the total number of vesting schedules
     * @return uint256 The number of vesting schedules
     */
    function getVestingSchedulesCount() external view returns (uint256);

    /**
     * @dev Gets the address of the token being vested
     * @return address The token address
     */
    function getToken() external view returns (address);

    /**
     * @dev Gets the amount of tokens already vested for a schedule
     * @param _vestingScheduleId ID of the vesting schedule
     * @return uint256 Amount of tokens already vested
     */
    function computeReleasableAmount(
        bytes32 _vestingScheduleId
    ) external view returns (uint256);

    /**
     * @dev Gets the total amount of tokens that can be vested for a schedule
     * @param _vestingScheduleId ID of the vesting schedule
     * @return uint256 Total amount of tokens for the vesting schedule
     */
    function getVestingScheduleTotalAmount(
        bytes32 _vestingScheduleId
    ) external view returns (uint256);

    /**
     * @dev Emitted when a vesting schedule is created
     */
    event VestingScheduleCreated(
        address indexed beneficiary,
        bytes32 vestingScheduleId,
        uint256 start,
        uint256 cliff,
        uint256 duration,
        uint256 slicePeriodSeconds,
        uint256 amount,
        bool revocable
    );

    /**
     * @dev Emitted when a vesting schedule is revoked
     */
    event VestingScheduleRevoked(bytes32 vestingScheduleId);

    /**
     * @dev Emitted when tokens are released
     */
    event TokensReleased(
        bytes32 indexed vestingScheduleId,
        address indexed beneficiary,
        uint256 amount
    );

    /**
     * @dev Emitted when tokens are withdrawn from the contract
     */
    event TokensWithdrawn(address indexed recipient, uint256 amount);
}
