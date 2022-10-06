pragma solidity 0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../interfaces/IPanopticPool.sol";
import "../interfaces/ISemiFungiblePositionManager.sol";

import "hardhat/console.sol";

contract MockPanopticPool is IPanopticPool {
    IUniswapV3Pool public pool;
    address public token0;
    address public token1;

    ISemiFungiblePositionManager public immutable sfpm;

    constructor(address _sfpm) {
        sfpm = ISemiFungiblePositionManager(_sfpm);
    }

    function startPool(address _pool, address _receiptReference) external override {
        pool = IUniswapV3Pool(_pool);

        token0 = pool.token0();
        token1 = pool.token1();

        emit PoolStarted(token0, token1);
    }

    function deposit(uint256 amount, address token) public {
        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(
        uint256 amount,
        address token,
        uint256[] calldata positionIdList
    ) public {
        emit Withdrawn(msg.sender, token, amount);
    }

    function mintOptions(uint256[] calldata positionIdList, uint128 numberOfContracts) public {
        uint256 tokenId = positionIdList[positionIdList.length - 1];

        ISemiFungiblePositionManager.LiquidityAmountsTotal memory amounts = sfpm
            .mintTokenizedPosition(tokenId, numberOfContracts, address(this), msg.sender);
    }
}
