// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

contract PanopticBase {
    struct Option {
        uint128 feesBase0;
        uint128 feesBase1;
        uint128 baseLiquidity;
    }

    struct TickInfo {
        int24 tickLower;
        int24 tickUpper;
        uint128 legLiquidity;
    }
    struct PoolBalances {
        uint128 totalToken0CollectedFee;
        uint128 totalToken1CollectedFee;
        uint128 totalToken0InAMM;
        uint128 totalToken1InAMM;
    }
}
