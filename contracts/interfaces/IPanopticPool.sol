// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

interface IPanopticPool {
    function startPool(address _pool, address _receiptReference) external;

    event Deposited(address user, address tokenAddress, uint256 amount);

    event Withdrawn(address user, address tokenAddress, uint256 amount);

    event FeesCollected(uint256 positionID, uint256 amount0Collected, uint256 amount1Collected);

    event PoolStarted(address token0, address token1);
}
