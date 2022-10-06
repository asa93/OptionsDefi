// SPDX-License-Identifier: GPL-2.0-or-late
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

contract Token is ERC20 {
    string private _name;
    string private _symbol;
    uint8 private _decimals;

    constructor() ERC20(_name, _symbol) {}

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
        console.log("balanceOf", balanceOf(account));
    }
}
