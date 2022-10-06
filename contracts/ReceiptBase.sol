// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// This contract is used for printing IOU tokens
contract ReceiptBase is ERC20 {
    address public underlyingToken;
    string public constant DETAILS = "panoptic.xyz";
    string public constant prefix = "PAN-";
    address private _owner;
    uint8 private _decimals;

    string private myName;
    string private mySymbol;

    constructor() ERC20("PAN", "PAN") {}

    function startToken(address underlyingAddress) public {
        require(underlyingToken == address(0), "Token already configured");
        require(underlyingAddress != address(0), "Token address not valid");
        underlyingToken = underlyingAddress;
        _owner = msg.sender;
        _decimals = ERC20(underlyingAddress).decimals();
        myName = string(abi.encodePacked(prefix, ERC20(underlyingAddress).name()));
        mySymbol = string(abi.encodePacked(prefix, ERC20(underlyingAddress).symbol()));
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function name() public view override returns (string memory) {
        return myName;
    }

    function symbol() public view override returns (string memory) {
        return mySymbol;
    }

    /**
     * @notice Mint new receipt tokens to some user
     * @param to Address of the user that gets the receipt tokens
     * @param amount Amount of receipt tokens that will get minted
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Burn receipt tokens from some user
     * @param from Address of the user that gets the receipt tokens burn
     * @param amount Amount of receipt tokens that will get burned
     */
    function burn(address from, uint256 amount) public onlyOwner {
        _burn(from, amount);
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, "Ownable: caller is not the owner");
        _;
    }
}
