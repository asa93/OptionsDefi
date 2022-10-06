// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/libraries/SqrtPriceMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-core/contracts/libraries/FixedPoint128.sol";
import "./OptionEncoding.sol";
import "../OptionsBase.sol";

//import "hardhat/console.sol";

library OptionsMath {
    uint16 public constant DECIMALS = 10000;

    function getNotional(
        uint128 contracts,
        int24 tickLower,
        int24 tickUpper
    ) internal pure returns (uint256) {
        return
            LiquidityAmounts.getAmount0ForLiquidity(
                TickMath.getSqrtRatioAtTick(tickLower),
                TickMath.getSqrtRatioAtTick(tickUpper),
                LiquidityAmounts.getLiquidityForAmount1(
                    TickMath.getSqrtRatioAtTick(tickLower),
                    TickMath.getSqrtRatioAtTick(tickUpper),
                    contracts
                )
            );
    }

    function getContractsAndNotional(
        uint256 tokenId,
        uint128 numberOfContracts,
        uint8 index,
        int24 tickSpacing
    ) internal pure returns (uint128 contracts, uint128 notional) {
        (int24 tickLower, int24 tickUpper) = asTicks(
            int24(OptionEncoding.efficientDecodeID(tokenId, 5, index)),
            int24(OptionEncoding.efficientDecodeID(tokenId, 6, index)),
            tickSpacing
        );

        contracts =
            numberOfContracts *
            uint128(OptionEncoding.efficientDecodeID(tokenId, 1, index));
        notional = uint128(getNotional(contracts, tickLower, tickUpper));
    }

    function getTicksAndLegLiquidityEff(
        uint256 tokenId,
        uint8 index,
        uint128 numberOfContracts,
        int24 tickSpacing
    ) public pure returns (OptionsBase.TickInfo memory tickInfo) {
        (tickInfo.tickLower, tickInfo.tickUpper) = asTicks(
            int24(OptionEncoding.efficientDecodeID(tokenId, 5, index)), //strike
            int24(OptionEncoding.efficientDecodeID(tokenId, 6, index)), //width
            tickSpacing
        );
        tickInfo.legLiquidity = LiquidityAmounts.getLiquidityForAmount1(
            TickMath.getSqrtRatioAtTick(tickInfo.tickLower),
            TickMath.getSqrtRatioAtTick(tickInfo.tickUpper),
            uint256(numberOfContracts) *
                uint256(OptionEncoding.efficientDecodeID(tokenId, 1, index))
        );
    }

    function getLegLiquidity(
        uint128 numberOfContracts,
        int24 tickLower,
        int24 tickUpper,
        uint8 ratio
    ) internal pure returns (uint128) {
        return
            LiquidityAmounts.getLiquidityForAmount1(
                TickMath.getSqrtRatioAtTick(tickLower),
                TickMath.getSqrtRatioAtTick(tickUpper),
                uint256(numberOfContracts) * uint256(ratio)
            );
    }

    function asTicks(
        int24 strike,
        int24 width,
        int24 tickSpacing
    ) public pure returns (int24 tickLower, int24 tickUpper) {
        int24 range = (width * tickSpacing) / 2;
        (tickLower, tickUpper) = width == 4095
            ? (TickMath.MIN_TICK, TickMath.MAX_TICK)
            : (strike - range, strike + range);
    }

    function min24(int24 a, int24 b) public pure returns (int24) {
        return a <= b ? a : b;
    }

    function max24(int24 a, int24 b) public pure returns (int24) {
        return a >= b ? a : b;
    }

    function abs(int256 x) public pure returns (int256) {
        return x >= 0 ? x : -x;
    }

    function calculateFeeGrowthInside(
        IUniswapV3Pool pool,
        int24 tickLower,
        int24 tickUpper
    ) public view returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128) {
        (, int24 currentTick, , , , , ) = pool.slot0();
        (, , uint256 lowerOut0, uint256 lowerOut1, , , , ) = pool.ticks(tickLower);
        (, , uint256 upperOut0, uint256 upperOut1, , , , ) = pool.ticks(tickUpper);
        if (currentTick < tickLower) {
            feeGrowthInside0X128 = lowerOut0 - upperOut0;
            feeGrowthInside1X128 = lowerOut1 - upperOut1;
        } else if (currentTick > tickUpper) {
            feeGrowthInside0X128 = upperOut0 - lowerOut0;
            feeGrowthInside1X128 = upperOut1 - lowerOut1;
        } else {
            feeGrowthInside0X128 = uint256(pool.feeGrowthGlobal0X128()) - lowerOut0 - upperOut0;
            feeGrowthInside1X128 = uint256(pool.feeGrowthGlobal1X128()) - lowerOut1 - upperOut1;
        }
    }

    function calculateBaseFees(
        IUniswapV3Pool pool,
        int24 tickLower,
        int24 tickUpper,
        uint128 legLiquidity
    ) public view returns (uint128 feesToken0, uint128 feesToken1) {
        (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128) = calculateFeeGrowthInside(
            pool,
            tickLower,
            tickUpper
        );

        feesToken0 = uint128(
            FullMath.mulDiv(feeGrowthInside0X128, legLiquidity, FixedPoint128.Q128)
        );
        feesToken1 = uint128(
            FullMath.mulDiv(feeGrowthInside1X128, legLiquidity, FixedPoint128.Q128)
        );
    }

    function calculatePositionFees(
        IUniswapV3Pool pool,
        uint256 tokenId,
        uint8 index,
        OptionsBase.Option memory op,
        uint128 numberOfContracts
    ) public view returns (int128 premium0, int128 premium1) {
        OptionsBase.TickInfo memory tickInfo = getTicksAndLegLiquidityEff(
            tokenId,
            index,
            numberOfContracts,
            pool.tickSpacing()
        );

        (uint128 feesToken0, uint128 feesToken1) = calculateBaseFees(
            pool,
            tickInfo.tickLower,
            tickInfo.tickUpper,
            tickInfo.legLiquidity
        );

        // check if option is long
        if (OptionEncoding.efficientDecodeID(tokenId, 2, index) == 1) {
            uint256 effectiveLiquidityFactor = FullMath.mulDiv(
                op.baseLiquidity,
                DECIMALS,
                op.baseLiquidity - tickInfo.legLiquidity
            );
            premium0 -= int128(
                FullMath.mulDiv(feesToken0 - op.feesBase0, effectiveLiquidityFactor, DECIMALS)
            );
            premium1 -= int128(
                FullMath.mulDiv(feesToken1 - op.feesBase1, effectiveLiquidityFactor, DECIMALS)
            );
        } else {
            premium0 += int128(feesToken0 - op.feesBase0);
            premium1 += int128(feesToken1 - op.feesBase1);
        }
    }

    function getTotalNotionalByTokenId(
        uint256 tokenId,
        uint128 numberOfContracts,
        int24 tickSpacing
    ) public view returns (uint128 notionalToken0, uint128 notionalToken1) {
        for (uint8 index = 0; index < 4; ++index) {
            // check ratio != 0
            if (OptionEncoding.efficientDecodeID(tokenId, 1, index) == 0) {
                break;
            }
            (uint128 contracts, uint128 notional) = getContractsAndNotional(
                tokenId,
                numberOfContracts,
                index,
                tickSpacing
            );
            if (OptionEncoding.efficientDecodeID(tokenId, 3, index) == 0) {
                notionalToken0 += notional;
            } else {
                notionalToken1 += contracts;
            }
        }
    }

    function exerciseOptionsDeltas(
        IUniswapV3Pool pool,
        uint256 tokenId,
        uint8 index,
        uint128 numberOfContracts
    ) public view returns (int128 amount0Delta, int128 amount1Delta) {
        (, int24 currentTick, , , , , ) = pool.slot0();

        int24 strike = int24(OptionEncoding.efficientDecodeID(tokenId, 5, index));

        (uint128 contracts, uint128 notional) = getContractsAndNotional(
            tokenId,
            numberOfContracts,
            index,
            pool.tickSpacing()
        );

        // check if option is a put (tokenType = token1)
        if (OptionEncoding.efficientDecodeID(tokenId, 3, index) == 1) {
            // check if option is ITM
            if (currentTick < strike) {
                // if short: buy N tokens for K numeraire  ; if long: sell N tokens for K numeraire

                // check if option is short (long == 0)
                if (OptionEncoding.efficientDecodeID(tokenId, 2, index) == 0) {
                    amount0Delta += int128(contracts); // receive purchased asset
                    amount1Delta -= int128(notional); // spend numeraire

                    // else, option is long (long != 0)
                } else {
                    amount0Delta -= int128(contracts); // sell asset
                    amount1Delta += int128(notional); // get paid in numeraire
                }
            }

            // else, option is a call (tokenType = token0)
        } else {
            // check if option is ITM
            if (currentTick > strike) {
                // if short: sell N tokens for K numeraire  ; if long: buy N tokens for K numeraire

                // check if option is short (long == 0)
                if (OptionEncoding.efficientDecodeID(tokenId, 2, index) == 0) {
                    amount0Delta -= int128(contracts); // sell asset
                    amount1Delta += int128(notional); // get paid in numeraire

                    // else, option is long (long != 0)
                } else {
                    amount0Delta += int128(contracts); // receive purchased asset
                    amount1Delta -= int128(notional); // spend numeraire
                }
            }
        }
    }

    function computeExercisedAmounts(
        IUniswapV3Pool pool,
        OptionsBase.Option[] calldata userOptions,
        uint256 tokenId,
        uint128 numberOfContracts
    )
        public
        view
        returns (
            int128 transactedAmount0,
            int128 transactedAmount1,
            int128 premium0,
            int128 premium1
        )
    {
        for (uint8 index = 0; index < 4; ++index) {
            // check ratio != 0
            if (OptionEncoding.efficientDecodeID(tokenId, 1, index) == 0) {
                break;
            }
            OptionsBase.Option memory op = userOptions[index];

            (int128 feesToken0, int128 feesToken1) = calculatePositionFees(
                pool,
                tokenId,
                index,
                op,
                numberOfContracts
            );
            premium0 += feesToken0;
            premium1 += feesToken1;

            // exercise, if necessary
            (int128 amount0Delta, int128 amount1Delta) = exerciseOptionsDeltas(
                pool,
                tokenId,
                index,
                numberOfContracts
            );
            transactedAmount0 += amount0Delta + feesToken0;
            transactedAmount1 += amount1Delta + feesToken1;
        }
    }
}
