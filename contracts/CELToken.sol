// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "./interfaces/ICELToken.sol";

/**
 * @title CELToken
 * @dev Implementation of the Celystik Hub Token (CEL)
 * CEL is an ERC20 token with additional features:
 * - Minting with authorized minters
 * - Burning with authorized burners
 * - Pausable transfers
 */
abstract contract CELToken is Context, ERC20, ERC20Pausable, Ownable, ICELToken {


    // Role-based access control for minters and burners
    mapping(address => bool) private _minters;
    mapping(address => bool) private _burners;

    /**
    
     *
     * All of these values are immutable: they can only be set once during construction.
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
        
    ) ERC20(name, symbol) {


        // Initialize sender as minter and burner
        _minters[_msgSender()] = true;
        _burners[_msgSender()] = true;

        // Mint initial supply to owner if greater than 0
        if (initialSupply > 0) {
            _mint(_msgSender(), initialSupply);
        }
    }

    // Override all the conflicting functions
    function name() public view override(ERC20, ICELToken) returns (string memory) {
        return super.name();
    }

    function symbol() public view override(ERC20, ICELToken) returns (string memory) {
        return super.symbol();
    }

    function decimals() public view override(ERC20, ICELToken) returns (uint8) {
        return super.decimals();
    }

    function owner() public view override(Ownable, ICELToken) returns (address) {
        return super.owner();
    }

    function paused() public view override(Pausable, ICELToken) returns (bool) {
        return super.paused();
    }

    function transferOwnership(address newOwner) public override(Ownable, ICELToken) {
        super.transferOwnership(newOwner);
    }

    

    /**
     * @dev See {ICELToken-mint}.
     *
     * Requirements:
     *
     * - the caller must have the {minter} role.

     */
    function mint(address account, uint256 amount) public override returns(bool){
        require(_minters[_msgSender()], "CELToken: caller is not a minter");

        _mint(account, amount);
        
    }

    /**
     * @dev See {ICELToken-burn}.
     *
     * Requirements:
     *
     * - the caller must have the {burner} role.
     */
    function burn(address account, uint256 amount) public override {
        require(_burners[_msgSender()], "CELToken: caller is not a burner");

        _burn(account, amount);
    }

    /**
     * @dev See {ICELToken-setMinter}.
     *
     * Requirements:
     *
     * - the caller must be the owner.
     */
    function setMinter(address account, bool status) public override onlyOwner {
        _minters[account] = status;
        emit MinterRoleChanged(account, status);
    }

    /**
     * @dev See {ICELToken-setBurner}.
     *
     * Requirements:
     *
     * - the caller must be the owner.
     */
    function setBurner(address account, bool status) public override onlyOwner {
        _burners[account] = status;
        emit BurnerRoleChanged(account, status);
    }

    /**
     * @dev See {ICELToken-isMinter}.
     */
    function isMinter(address account) public view override returns (bool) {
        return _minters[account];
    }

    /**
     * @dev See {ICELToken-isBurner}.
     */
    function isBurner(address account) public view override returns (bool) {
        return _burners[account];
    }

    /**
     * @dev See {ICELToken-pause}.
     *
     * Requirements:
     *
     * - the caller must be the owner.
     */
    function pause() public override onlyOwner {
        _pause();
    }

    /**
     * @dev See {ICELToken-unpause}.
     *
     * Requirements:
     *
     * - the caller must be the owner.
     */
    function unpause() public override onlyOwner {
        _unpause();
    }

    /**
     * @dev See {ERC20Pausable-_beforeTokenTransfer}.
     *
     * Requirements:
     *
     * - the contract must not be paused.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
