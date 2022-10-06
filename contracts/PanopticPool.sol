// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155Holder.sol";

import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";
import "@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
//import "@uniswap/v3-core/contracts/libraries/Tick.sol";

import "./interfaces/ISemiFungiblePositionManager.sol";
import "./ReceiptBase.sol";
import "./interfaces/IPanopticPool.sol";
import "./libraries/OptionEncoding.sol";
import "./libraries/PanopticMath.sol";
import "./PanopticBase.sol";

//import "hardhat/console.sol";

pragma abicoder v2;

contract PanopticPool is PanopticBase, IPanopticPool, Ownable, ReentrancyGuard, ERC1155Holder {
    constructor(address _sfpm) {
        sfpm = ISemiFungiblePositionManager(_sfpm);
    }

    ISemiFungiblePositionManager public immutable sfpm;

    IUniswapV3Pool public override pool;
    address public token0;
    address public token1;
    ReceiptBase public receiptToken0;
    ReceiptBase public receiptToken1;
    int24 public tickSpacing;

    mapping(address => mapping(uint256 => uint128)) public positionBalance;
    mapping(address => uint256) public positionCounter; //

    mapping(address => mapping(uint256 => Option[])) public options;

    uint16 public constant DECIMALS = 10000;

    uint16 public constant COMMISSION_FEE = 10;

    function startPool(address _pool, address _receiptReference) external override {
        require(address(pool) == address(0), "10");
        require(_pool != address(0), "11");

        pool = IUniswapV3Pool(_pool);
        tickSpacing = pool.tickSpacing();

        token0 = pool.token0();
        token1 = pool.token1();

        receiptToken0 = ReceiptBase(Clones.clone(_receiptReference));
        receiptToken0.startToken(token0);

        receiptToken1 = ReceiptBase(Clones.clone(_receiptReference));
        receiptToken1.startToken(token1);

        IERC20(token0).approve(address(sfpm), type(uint256).max);
        IERC20(token1).approve(address(sfpm), type(uint256).max);
    }

    function balance0() public view returns (uint256) {
        return IERC20(token0).balanceOf(address(this));
    }

    function balance1() public view returns (uint256) {
        return IERC20(token1).balanceOf(address(this));
    }

    function inAMM0() public view returns (uint256) {
        return receiptToken0.inAMM();
    }

    function inAMM1() public view returns (uint256) {
        return receiptToken1.inAMM();
    }

    function totalCollectedFees0() public view returns (uint256) {
        return receiptToken0.collectedFees();
    }

    function totalCollectedFees1() public view returns (uint256) {
        return receiptToken1.collectedFees();
    }

    function optionPositionBalance(address user, uint256 tokenId)
        external
        view
        override
        returns (uint128)
    {
        return positionBalance[user][tokenId];
    }

    function mintOptions(uint256[] calldata positionIdList, uint128 numberOfContracts) public {
        //require(numberOfContracts > 0, "must mint more than 0 contract");

        // the new tokenId should be the last element
        uint256 tokenId = positionIdList[positionIdList.length - 1];
        //uint256 nnn = OptionEncoding.countPositions(tokenId);

        // disallow user to mint exact same position
        // in order to do it should burn it first and then mint
        require(positionBalance[msg.sender][tokenId] == 0, "Already minted");
        require(positionIdList.length == positionCounter[msg.sender] + 1, "Counter mismatch");

        // calculate and add position Data
        (
            uint256 contracts,
            uint256 notional,
            uint256 amount0Short,
            uint256 amount1Short
        ) = _calcOptionsData(tokenId, numberOfContracts);

        // check that enough tokens are available
        // TODO: user receiptToken instead of IERC20
        /*
        require(
            (IERC20(token0).balanceOf(address(this)) >= amount0Short) &&
                (IERC20(token1).balanceOf(address(this)) >= amount1Short),
            "not enough liquidity available"
        );
        */

        uint256 token0Required;
        uint256 token1Required;

        if (positionIdList.length > 1) {
            if (contracts > 0) {
                token0Required = receiptToken0.validateUserHealth(msg.sender, positionIdList);
            }
            if (notional > 0) {
                token1Required = receiptToken1.validateUserHealth(msg.sender, positionIdList);
            }
        }

        // 20% collateral requirement. TODO fix this
        token0Required += (contracts * 2) / 10;
        token1Required += (notional * 2) / 10;

        uint256 balance0Before;
        uint256 balance1Before;

        if (amount0Short > 0) {
            balance0Before = balance0();
        }
        if (amount1Short > 0) {
            balance1Before = balance1();
        }

        /*
        // check that required tokens is larger than collateral
        /*
        require(
            (token0Required <= _receiptAmountToAmount(true, receiptToken0.balanceOf(msg.sender))) &&
                (token1Required <=
                    _receiptAmountToAmount(false, receiptToken1.balanceOf(msg.sender))),
            "not enough collateral"
        );
        */

        ISemiFungiblePositionManager.LiquidityAmountsTotal memory amounts = sfpm
            .mintTokenizedPosition(tokenId, numberOfContracts - 1, address(this));
        if (amount0Short > 0)
            require(balance0Before <= balance0() + 2 * amount0Short - contracts + 1, "M0");
        if (amount1Short > 0)
            require(balance1Before <= balance1() + 2 * amount1Short - notional + 1, "M1");
        // update the positionBalance and the total number of positions
        positionBalance[msg.sender][tokenId] = numberOfContracts;
        positionCounter[msg.sender] += 1;

        receiptToken0.addInAMM(amounts.totalAmount0);
        receiptToken1.addInAMM(amounts.totalAmount1);
        receiptToken0.addCollected(amounts.totalCollectedAmount0);
        receiptToken1.addCollected(amounts.totalCollectedAmount1);
    }

    function burnOptions(uint256 tokenId) public {
        uint128 numberOfContracts = uint128(positionBalance[msg.sender][tokenId]);
        require(numberOfContracts > 0, "Does not exist");

        Option[] storage userOptions = options[msg.sender][tokenId];

        // exercise if necessary
        (
            int128 transactedAmount0,
            int128 transactedAmount1,
            int128 premium0,
            int128 premium1
        ) = PanopticMath.computeExercisedAmounts(pool, userOptions, tokenId, numberOfContracts);

        (uint128 contractsToken0, uint128 notionalToken1) = PanopticMath.getTotalNotionalByTokenId(
            tokenId,
            numberOfContracts,
            pool.tickSpacing()
        );

        _exerciseAndTakeCommission(
            contractsToken0,
            notionalToken1,
            transactedAmount0,
            transactedAmount1
        );

        // health check?
        uint256 balance0Before;
        uint256 balance1Before;
        if (contractsToken0 > 0) balance0Before = balance0();
        if (notionalToken1 > 0) balance1Before = balance1();
        ISemiFungiblePositionManager.LiquidityAmountsTotal memory amounts = sfpm
            .burnTokenizedPosition(tokenId, address(this));
        if (contractsToken0 > 0) require(balance0Before <= balance0() + contractsToken0, "M0");
        if (notionalToken1 > 0) require(balance1Before <= balance1() + notionalToken1, "M1");

        receiptToken0.addInAMM(amounts.totalAmount0);
        receiptToken1.addInAMM(amounts.totalAmount1);

        receiptToken0.addCollected(
            uint256(int256(amounts.totalCollectedAmount0) - int256(premium0))
        );
        receiptToken1.addCollected(
            uint256(int256(amounts.totalCollectedAmount1) - int256(premium1))
        );

        positionBalance[msg.sender][tokenId] = 0;
        positionCounter[msg.sender] -= 1;
        delete (options[msg.sender][tokenId]);
    }

    function _addUserOption(
        uint256 tokenId,
        uint128 numberOfContracts,
        uint8 index
    ) internal returns (uint256 contracts, uint256 notionalValue) {
        TickInfo memory tickInfo = PanopticMath.getTicksAndLegLiquidityEff(
            tokenId,
            index,
            numberOfContracts,
            tickSpacing
        );

        (contracts, notionalValue) = PanopticMath.getContractsAndNotional(
            tokenId,
            numberOfContracts,
            index,
            tickSpacing
        );

        (uint128 baseLiquidity, , , , ) = pool.positions(
            PositionKey.compute(address(this), tickInfo.tickLower, tickInfo.tickUpper)
        );

        (uint128 feesBase0, uint128 feesBase1) = PanopticMath.calculateBaseFees(
            pool,
            tickInfo.tickLower,
            tickInfo.tickUpper,
            tickInfo.legLiquidity
        );

        options[msg.sender][tokenId].push(
            Option({feesBase0: feesBase0, feesBase1: feesBase1, baseLiquidity: baseLiquidity})
        );
    }

    function _calcOptionsData(uint256 tokenId, uint128 numberOfContracts)
        internal
        returns (
            uint256 contractsTotal,
            uint256 notionalTotal,
            uint256 amount0Short,
            uint256 amount1Short
        )
    {
        uint256 contracts;
        uint256 notional;
        for (uint8 index = 0; index < 4; ++index) {
            // break if ratio == 0
            if (OptionEncoding.efficientDecodeID(tokenId, 1, index) == 0) {
                break;
            }

            // compute contracts + notional, write optionData
            (contracts, notional) = _addUserOption(tokenId, numberOfContracts, index);

            //if tokenType == 0
            if (OptionEncoding.efficientDecodeID(tokenId, 3, index) == 0) {
                contractsTotal += contracts;
                //if option is short, increment by contracts
                if (OptionEncoding.efficientDecodeID(tokenId, 2, index) == 0) {
                    amount0Short += contracts;
                }
            } else {
                notionalTotal += notional;
                //if option is short, increment by notional
                if (OptionEncoding.efficientDecodeID(tokenId, 2, index) == 0) {
                    amount1Short += notional;
                }
            }
        }
    }

    function _exerciseAndTakeCommission(
        uint128 notionalToken0,
        uint128 notionalToken1,
        int128 transactedAmount0,
        int128 transactedAmount1
    ) internal {
        // compute commissions (one for mint, one for burn) + transacted amount
        int128 commissionTotal0 = int128((2 * notionalToken0 * COMMISSION_FEE) / DECIMALS) +
            transactedAmount0;
        int128 commissionTotal1 = int128((2 * notionalToken1 * COMMISSION_FEE) / DECIMALS) +
            transactedAmount1;

        if (commissionTotal0 > 0) {
            receiptToken0.burn(
                msg.sender,
                receiptToken0.convertToShares(uint256(commissionTotal0))
            );
        } else {
            receiptToken0.mint(
                msg.sender,
                receiptToken0.convertToShares(uint256(-commissionTotal0))
            );
        }

        if (commissionTotal1 > 0) {
            receiptToken1.burn(
                msg.sender,
                receiptToken1.convertToShares(uint256(commissionTotal1))
            );
        } else {
            receiptToken1.mint(
                msg.sender,
                receiptToken1.convertToShares(uint256(-commissionTotal1))
            );
        }
    }

    function deposit(uint256 assets, address token) public returns (uint256 shares) {
        require(assets > 0, "9");
        ReceiptBase receiptToken = token == token0 ? receiptToken0 : receiptToken1;

        receiptToken.emitDeposit(assets, msg.sender);

        TransferHelper.safeTransferFrom(token, msg.sender, address(this), assets);
    }

    function withdraw(
        uint256 assets,
        address token,
        uint256[] calldata positionIdList
    ) public returns (uint256 shares) {
        require(assets > 0, "8");

        ReceiptBase receiptToken = token == token0 ? receiptToken0 : receiptToken1;

        uint256 userValue = receiptToken.convertToAssets(receiptToken.balanceOf(msg.sender));
        require(assets <= userValue, "19");

        require(positionIdList.length == positionCounter[msg.sender], "Counter mismatch");
        uint256 tokenRequired = receiptToken.validateUserHealth(msg.sender, positionIdList);
        require(userValue - assets >= tokenRequired, "under collateralized");

        receiptToken.emitWithdraw(assets, msg.sender, address(this));
        TransferHelper.safeTransfer(token, msg.sender, assets);
    }

    function _calculateTotalBalance(bool isToken0) internal view returns (uint256 totalBalance) {
        if (isToken0) {
            totalBalance = balance0() - totalCollectedFees0() + inAMM0();
        } else {
            totalBalance = balance1() - totalCollectedFees1() + inAMM1();
        }
    }

    /*
    function poolUtilization()
        external
        view
        returns (
            uint128 _totalToken0CollectedFee,
            uint128 _totalToken0InUniswap,
            uint256 _totalBalanceToken0,
            uint128 _totalToken1CollectedFee,
            uint128 _totalToken1InUniswap,
            uint256 _totalBalanceToken1
        )
    {
        _totalToken0CollectedFee = totalToken0CollectedFee;
        _totalToken0InUniswap = totalToken0InUniswap;
        _totalBalanceToken0 = IERC20(token0).balanceOf(address(this));
        _totalToken1CollectedFee = totalToken1CollectedFee;
        _totalToken1InUniswap = totalToken1InUniswap;
        _totalBalanceToken1 = IERC20(token1).balanceOf(address(this));
    }
    */
}
