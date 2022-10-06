pragma solidity 0.7.6;

import "../libraries/OptionsHealth.sol";

contract MockOptionsHealth {
    ///@dev modified checkHealth method
    ///handling one position ID only because we cannot pass storage as params oustide of internal methods
    function checkHealth(
        IUniswapV3Pool pool,
        address user,
        uint256 positionId,
        uint128 userPositionBalance,
        address receiptToken0,
        address receiptToken1
    )
        public
        view
        returns (
            OptionsHealth.UserStatus callStatus,
            OptionsHealth.UserStatus putStatus,
            uint256 token0Required,
            uint256 token1Required
        )
    {
        uint256 token0Required;
        uint256 token1Required;
        uint256 token0Balance;
        uint256 token1Balance;

        {
            int24 tickSpacing = pool.tickSpacing();
            (, int24 currentTick, , , , , ) = pool.slot0();

            require(userPositionBalance > 0, "Non existing user position");

            (token0Required, token1Required) = OptionsHealth.getPositionCollateralAtTick(
                positionId,
                userPositionBalance,
                tickSpacing,
                currentTick
            );
        }
        (token0Balance, token1Balance) = (
            IERC20(receiptToken0).balanceOf(user),
            IERC20(receiptToken1).balanceOf(user)
        );

        (callStatus, putStatus) = (
            OptionsHealth.getStatus(token0Balance, token0Required),
            OptionsHealth.getStatus(token1Balance, token1Required)
        );
    }
}
