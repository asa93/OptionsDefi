// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface ISemiFungiblePositionManager is IERC1155 {
    struct LiquidityAmountsTotal {
        int256 totalAmount0;
        int256 totalAmount1;
        uint256 totalCollectedAmount0;
        uint256 totalCollectedAmount1;
    }

    function mintTokenizedPosition(
        uint256 tokenId,
        uint128 numberOfContracts,
        address recipient,
        address user
    ) external payable returns (LiquidityAmountsTotal memory amounts);

    function burnTokenizedPosition(
        uint256 tokenId,
        address recipient,
        address user
    ) external payable returns (LiquidityAmountsTotal memory amounts);
}
