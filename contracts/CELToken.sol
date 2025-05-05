// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ICELToken.sol";

/**
 * @title CELToken
 * @dev Implementation of the Celystik Hub Token (CEL)
 * CEL is an ERC20 token with additional features:
 * - Minting with authorized minters
 * - Burning with authorized burners
 * - Pausable transfers
 */
contract CELToken is ERC20, Pausable, Ownable, ICELToken {
    // Role-based access control for minters and burners
    mapping(address => bool) private _minters;
    mapping(address => bool) private _burners;

    /**
     * @dev Constructor
     * @param tokenName Name of the token
     * @param tokenSymbol Symbol of the token
     * @param initialSupply Initial token supply to mint to the deployer
     */
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint256 initialSupply
    ) ERC20(tokenName, tokenSymbol) {
        // Initialize sender as minter and burner
        _minters[_msgSender()] = true;
        _burners[_msgSender()] = true;

        // Mint initial supply to owner if greater than 0
        if (initialSupply > 0) {
            _mint(_msgSender(), initialSupply);
        }
    }

    // Override functions to resolve interface conflicts
    function name()
        public
        view
        virtual
        override(ERC20, ICELToken)
        returns (string memory)
    {
        return super.name();
    }

    function symbol()
        public
        view
        virtual
        override(ERC20, ICELToken)
        returns (string memory)
    {
        return super.symbol();
    }

    function decimals()
        public
        view
        virtual
        override(ERC20, ICELToken)
        returns (uint8)
    {
        return super.decimals();
    }

    function owner()
        public
        view
        virtual
        override(Ownable, ICELToken)
        returns (address)
    {
        return super.owner();
    }

    function paused()
        public
        view
        virtual
        override(Pausable, ICELToken)
        returns (bool)
    {
        return super.paused();
    }

    function transferOwnership(
        address newOwner
    ) public virtual override(Ownable, ICELToken) {
        super.transferOwnership(newOwner);
    }

    /**
     * @dev Returns the address that has the minter role
     * @return The minter address
     */
    function minter() external view override returns (address) {
        return owner();
    }

    /**
     * @dev See {ICELToken-mint}.
     *
     * Requirements:
     *
     * - the caller must have the {minter} role.
     */
    function mint(address to, uint256 amount) public override returns (bool) {
        require(_minters[_msgSender()], "CELToken: caller is not a minter");
        _mint(to, amount);
        return true;
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
     * @dev Hook that is called before any transfer of tokens.
     * This includes minting and burning.
     *
     * Requirements:
     *
     * - the contract must not be paused.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        require(!paused(), "CELToken: token transfer while paused");
    }
}
