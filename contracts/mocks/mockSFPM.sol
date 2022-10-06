// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity 0.7.6;
pragma abicoder v2;

import "../interfaces/ISemiFungiblePositionManager.sol";

contract MockSFPM {
    struct LiquidityAmountsTotal {
        int256 totalAmount0;
        int256 totalAmount1;
        uint256 totalCollectedAmount0;
        uint256 totalCollectedAmount1;
    }

    struct InitParams {
        address token0;
        address token1;
        uint24 fee;
    }

    event TokenizedPositionMinted(
        address indexed recipient,
        uint256 tokenId,
        uint128 numberOfContracts,
        address user
    );

    event TokenizedPositionBurnt(
        address indexed recipient,
        uint256 tokenId,
        uint128 numberOfContracts,
        address user
    );

    event TokenizedPositionRolled(
        address indexed recipient,
        uint256 newTokenId,
        uint256 oldTokenId,
        uint128 numberOfContracts,
        address user
    );

    constructor(address _factory, address _WETH9) {}

    function mintTokenizedPosition(
        uint256 tokenId,
        uint128 numberOfContracts,
        address recipient,
        address user
    ) external payable returns (LiquidityAmountsTotal memory amounts) {
        emit TokenizedPositionMinted(recipient, tokenId, numberOfContracts, user);
    }

    function burnTokenizedPosition(
        uint256 tokenId,
        address recipient,
        address user
    ) external payable returns (LiquidityAmountsTotal memory amounts) {
        emit TokenizedPositionBurnt(recipient, tokenId, 0, user);
    }

    function initializePool(InitParams memory initParams) external {}
}
