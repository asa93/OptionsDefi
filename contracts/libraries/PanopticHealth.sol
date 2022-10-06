// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./PanopticMath.sol";
import "../PanopticBase.sol";
import "hardhat/console.sol";

library PanopticHealth {
    uint256 public constant DECIMALS = 10000;

    uint256 public constant COLLATERAL_MARGIN_RATIO = 12000;

    uint256 public constant SELL_COLLATERAL_RATIO = 2000;
    uint256 public constant BUY_COLLATERAL_RATIO = 1000;

    enum UserStatus {
        UNDERWATER,
        MARGIN_CALLED,
        HEALTHY
    }

    function calcRequired(
        uint256 positionId,
        uint8 index,
        uint128 notionalValue,
        int24 currentTick,
        uint8 tokenType
    ) public pure returns (uint256 required) {
        int24 strike = int24(OptionEncoding.efficientDecodeID(positionId, 5, index));
        // long
        if (OptionEncoding.efficientDecodeID(positionId, 2, index) == 1) {
            required = (notionalValue * BUY_COLLATERAL_RATIO) / DECIMALS;
        } else {
            if (
                ((currentTick > strike) && (tokenType == 1)) || // strike OTM, tokenType=1
                ((currentTick < strike) && (tokenType == 0)) // strike OTM, tokenType=0
            ) {
                required = (notionalValue * SELL_COLLATERAL_RATIO) / DECIMALS;
            } else {
                uint160 ratio = tokenType == 1 // tokenType
                    ? TickMath.getSqrtRatioAtTick(
                        PanopticMath.min24(2 * (currentTick - strike), TickMath.MAX_TICK)
                    ) // puts // strike
                    : TickMath.getSqrtRatioAtTick(
                        PanopticMath.max24(2 * (strike - currentTick), TickMath.MIN_TICK)
                    ); // calls // strike

                uint256 c2 = DECIMALS - SELL_COLLATERAL_RATIO;
                uint256 c3 = ratio * c2 < FixedPoint96.Q96 * DECIMALS
                    ? FixedPoint96.Q96 * DECIMALS - ratio * c2
                    : 0;
                required = FullMath.mulDiv(notionalValue, c3, FixedPoint96.Q96 * DECIMALS);
            }
        }
    }

    function calcPartnerRequired(uint8 long, uint256 notional)
        public
        pure
        returns (uint256 required)
    {
        required = long == 1 ? -notional : notional;
    }

    function getPositionCollateralAtTick(
        uint256 positionId,
        uint128 numberOfContracts,
        int24 tickSpacing,
        int24 tick
    ) public view returns (uint256 token0Required, uint256 token1Required) {
        for (uint8 index = 0; index < 4; ++index) {
            //ratio
            if (OptionEncoding.efficientDecodeID(positionId, 1, index) == 0) {
                break;
            }

            (uint128 contracts, uint128 notional) = PanopticMath.getContractsAndNotional(
                positionId,
                numberOfContracts,
                index,
                tickSpacing
            );
            uint8 tokenType = uint8(OptionEncoding.efficientDecodeID(positionId, 3, index));

            //when riskPartner is not self we use different way of calculating the collateral
            uint256 required = OptionEncoding.efficientDecodeID(positionId, 4, index) == index // riskPartner
                ? calcRequired(
                    positionId,
                    index,
                    tokenType == 1 ? notional : contracts,
                    tick,
                    tokenType
                )
                : calcPartnerRequired(
                    uint8(OptionEncoding.efficientDecodeID(positionId, 2, index)),
                    tokenType == 1 ? notional : contracts
                ); // long
            if (tokenType == 0) {
                token0Required += required;
            } else {
                token1Required += required;
            }
        }
        return (token0Required, token1Required);
    }

    function getUserRequiredCollateral(
        IUniswapV3Pool pool,
        uint256[] calldata positionIdList,
        mapping(uint256 => uint128) storage userPositionBalance
    ) internal view returns (uint256 token0Required, uint256 token1Required) {
        int24 tickSpacing = pool.tickSpacing();
        (, int24 currentTick, , , , , ) = pool.slot0();
        for (uint256 i = 0; i < positionIdList.length; ++i) {
            uint256 positionId = positionIdList[i];
            uint128 positionSize = userPositionBalance[positionId];

            require(positionSize > 0, "Non existing user position");

            (uint256 _token0Required, uint256 _token1Required) = getPositionCollateralAtTick(
                positionId,
                positionSize,
                tickSpacing,
                currentTick
            );
            token0Required += _token0Required;
            token1Required += _token1Required;
        }
        return (token0Required, token1Required);
    }

    function checkHealth(
        IUniswapV3Pool pool,
        address user,
        uint256[] calldata positionIdList,
        mapping(uint256 => uint128) storage userPositionBalance,
        address receiptToken0,
        address receiptToken1
    )
        public
        view
        returns (
            UserStatus callStatus,
            UserStatus putStatus,
            uint256 token0Required,
            uint256 token1Required
        )
    {
        if (positionIdList.length > 0) {
            (token0Required, token1Required) = getUserRequiredCollateral(
                pool,
                positionIdList,
                userPositionBalance
            );
        }
        (uint256 token0Balance, uint256 token1Balance) = (
            IERC20(receiptToken0).balanceOf(user),
            IERC20(receiptToken1).balanceOf(user)
        );

        (callStatus, putStatus) = (
            getStatus(token0Balance, token0Required),
            getStatus(token1Balance, token1Required)
        );
    }

    function getStatus(uint256 balance, uint256 required) public pure returns (UserStatus status) {
        // >= because we also check in case required is 0 and balance is 0
        if (balance >= required) {
            status = UserStatus.HEALTHY;
        } else if (balance > FullMath.mulDiv(required, COLLATERAL_MARGIN_RATIO, DECIMALS)) {
            status = UserStatus.MARGIN_CALLED;
        } else {
            status = UserStatus.UNDERWATER;
        }
    }

    function validateUserHealth(
        IUniswapV3Pool pool,
        address user,
        uint256[] calldata positionIdList,
        mapping(uint256 => uint128) storage userPositionBalance,
        address receiptToken0,
        address receiptToken1
    ) public view returns (uint256 token0Required, uint256 token1Required) {
        (
            PanopticHealth.UserStatus callStatus,
            PanopticHealth.UserStatus putStatus,
            uint256 token0Required,
            uint256 token1Required
        ) = checkHealth(
                pool,
                user,
                positionIdList,
                userPositionBalance,
                receiptToken0,
                receiptToken1
            );
        require(callStatus == UserStatus.HEALTHY && putStatus == UserStatus.HEALTHY, "Not healthy");
        return (token0Required, token1Required);
    }
}
