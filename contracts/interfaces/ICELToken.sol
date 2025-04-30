// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ICELToken
 * @dev Interface for the Celystik Hub Token (CEL) that extends ERC20 functionality
 */
interface ICELToken is IERC20 {
    /**
     * @dev Returns the name of the token
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the number of decimals the token uses
     */
    function decimals() external view returns (uint8);

    /**
     * @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     * - `account` cannot be the zero address.
     * - only the owner or authorized minters can call this function
     */
    function mint(address account, uint256 amount) external;

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     * - only the owner or authorized burners can call this function
     */
    function burn(address account, uint256 amount) external;

    /**
     * @dev Grants or revokes minter role to an account
     * @param account Address to grant/revoke the role to/from
     * @param status True to grant, false to revoke
     */
    function setMinter(address account, bool status) external;

    /**
     * @dev Grants or revokes burner role to an account
     * @param account Address to grant/revoke the role to/from
     * @param status True to grant, false to revoke
     */
    function setBurner(address account, bool status) external;

    /**
     * @dev Checks if an account has minter role
     * @param account Address to check
     * @return True if the account has the role, false otherwise
     */
    function isMinter(address account) external view returns (bool);

    /**
     * @dev Checks if an account has burner role
     * @param account Address to check
     * @return True if the account has the role, false otherwise
     */
    function isBurner(address account) external view returns (bool);



    /**
     * @dev Pauses all token transfers
     */
    function pause() external;

    /**
     * @dev Unpauses all token transfers
     */
    function unpause() external;

    /**
     * @dev Returns true if the contract is paused, and false otherwise
     */
    function paused() external view returns (bool);

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`)
     * Can only be called by the current owner
     */
    function transferOwnership(address newOwner) external;

    /**
     * @dev Returns the address of the current owner
     */
    function owner() external view returns (address);

    /**
     * @dev Emitted when minter role is granted or revoked
     */
    event MinterRoleChanged(address indexed account, bool status);

    /**
     * @dev Emitted when burner role is granted or revoked
     */
    event BurnerRoleChanged(address indexed account, bool status);
}
