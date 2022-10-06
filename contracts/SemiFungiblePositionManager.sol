// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity 0.7.6;

pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/libraries/FixedPoint128.sol";
import "@uniswap/v3-periphery/contracts/libraries/PositionKey.sol";
import "@uniswap/v3-periphery/contracts/base/LiquidityManagement.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "./libraries/OptionEncoding.sol";
import "./libraries/PanopticMath.sol";
import "./interfaces/ISemiFungiblePositionManager.sol";

//import "hardhat/console.sol";

/**
 * @title ERC1155 positions
 * @notice Wraps Uniswap V3 positions in the ERC1155 semi-fungible token interface
 */
contract SemiFungiblePositionManager is
    IUniswapV3MintCallback,
    ERC1155,
    PeripheryImmutableState,
    PeripheryPayments,
    ISemiFungiblePositionManager
{
    // details about the option as deployed to the uniswap pool

    uint256 constant flipLongShort = 0x1000000000100000000010000000001000000000000000000000000;
    uint128 constant MAX_UINT128 = uint128(-1);

    struct InitParams {
        address token0;
        address token1;
        uint24 fee;
    }

    struct CollectParams {
        int24 tickLower;
        int24 tickUpper;
        address recipient;
    }

    struct BurnPositionData {
        uint128 legLiquidity;
        IUniswapV3Pool pool;
        CollectParams collectParams;
    }

    struct MintCallbackData {
        PoolAddress.PoolKey poolKey;
        address payer;
        bytes burnPositionData;
    }

    /// @dev pool id (first 10 bytes) => pool address
    mapping(uint80 => IUniswapV3Pool) public poolIdToAddr;

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

    fallback() external payable {}

    constructor(address _factory, address _WETH9)
        ERC1155("")
        PeripheryImmutableState(_factory, _WETH9)
    {}

    function safeTransferFrom(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual override(ERC1155, IERC1155) {
        revert("SFPM: transfer is not allowed");
    }

    function safeBatchTransferFrom(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override(ERC1155, IERC1155) {
        revert("SFPM: transfer is not allowed");
    }

    function initializePool(InitParams memory initParams) external {
        address poolAddress = PoolAddress.computeAddress(
            factory,
            PoolAddress.PoolKey({
                token0: initParams.token0,
                token1: initParams.token1,
                fee: initParams.fee
            })
        );
        uint80 poolId = uint80(uint160(poolAddress) >> 80); //first 10 bytes of the address
        require(
            poolIdToAddr[poolId] == IUniswapV3Pool(address(0)),
            "SFPM: pool already initialized"
        );
        poolIdToAddr[poolId] = IUniswapV3Pool(poolAddress);
    }

    /// @inheritdoc IUniswapV3MintCallback
    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override {
        MintCallbackData memory decoded = abi.decode(data, (MintCallbackData));
        CallbackValidation.verifyCallback(factory, decoded.poolKey);

        if (decoded.burnPositionData.length > 0) {
            BurnPositionData memory burnPositionData = abi.decode(
                decoded.burnPositionData,
                (BurnPositionData)
            );

            _burnPosition(
                burnPositionData.legLiquidity,
                burnPositionData.collectParams,
                burnPositionData.pool
            );
        }

        if (amount0Owed > 0) pay(decoded.poolKey.token0, decoded.payer, msg.sender, amount0Owed);
        if (amount1Owed > 0) pay(decoded.poolKey.token1, decoded.payer, msg.sender, amount1Owed);
    }

    // Deploy all liquidity for a given tokenId (up to 4 positions)
    function mintTokenizedPosition(
        uint256 tokenId,
        uint128 numberOfContracts,
        address recipient,
        address user
    ) public payable override returns (LiquidityAmountsTotal memory amounts) {
        amounts = _mintLiquidity(tokenId, numberOfContracts, recipient);

        // create the ERC1155 token (_mint from ERC1155 interface)
        _mint(recipient, tokenId, numberOfContracts, "");

        emit TokenizedPositionMinted(recipient, tokenId, numberOfContracts, user);
    }

    function burnTokenizedPosition(
        uint256 tokenId,
        address recipient,
        address user
    ) public payable override returns (LiquidityAmountsTotal memory amounts) {
        uint128 balance = uint128(balanceOf(msg.sender, tokenId));
        uint256 newTokenId = tokenId ^ flipLongShort;
        // flip the long bit for all 4 options
        amounts = _mintLiquidity(newTokenId, balance, recipient);
        // create the ERC1155 token (_mint from ERC1155 interface)
        _burn(msg.sender, tokenId, balance);
        emit TokenizedPositionBurnt(recipient, tokenId, balance, user);
    }

    function _createPositions(
        uint256 tokenId,
        uint128 numberOfContracts,
        address recipient,
        IUniswapV3Pool pool
    ) internal returns (LiquidityAmountsTotal memory amounts) {
        // loop through the 4 positions in the tokenId
        for (uint8 i = 0; i < 4; ++i) {
            if (OptionEncoding.efficientDecodeID(tokenId, 1, i) == 0) {
                //ratio
                break;
            }

            PanopticBase.TickInfo memory tickInfo = PanopticMath.getTicksAndLegLiquidityEff(
                tokenId,
                i,
                numberOfContracts,
                pool.tickSpacing()
            );
            CollectParams memory collectParams = CollectParams({
                tickLower: tickInfo.tickLower,
                tickUpper: tickInfo.tickUpper,
                recipient: recipient
            });

            if (OptionEncoding.efficientDecodeID(tokenId, 2, i) == 0) {
                //long
                (uint256 amount0, uint256 amount1) = _mintPosition(
                    tickInfo.legLiquidity,
                    collectParams,
                    pool,
                    ""
                );
                amounts.totalAmount0 += uint128(amount0);
                amounts.totalAmount1 += uint128(amount1);
            } else {
                (
                    uint256 amount0,
                    uint256 amount1,
                    uint256 collectedAmount0,
                    uint256 collectedAmount1
                ) = _burnPosition(tickInfo.legLiquidity, collectParams, pool);
                amounts.totalAmount0 -= uint128(amount0);
                amounts.totalAmount1 -= uint128(amount1);
                amounts.totalCollectedAmount0 += collectedAmount0;
                amounts.totalCollectedAmount1 += collectedAmount1;
            }
        }
    }

    function _mintLiquidity(
        uint256 tokenId,
        uint128 numberOfContracts,
        address recipient
    ) internal returns (LiquidityAmountsTotal memory amounts) {
        require(numberOfContracts > 0, "SFPM: zero number of options");

        OptionEncoding.validateTokenId(tokenId);
        uint80 poolId = uint80(tokenId);

        IUniswapV3Pool pool = poolIdToAddr[poolId];
        require(address(pool) != address(0), "SFPM: pool not initialized");

        return _createPositions(tokenId, numberOfContracts, recipient, pool);
    }

    function _mintPosition(
        uint128 legLiquidity,
        CollectParams memory collectParams,
        IUniswapV3Pool pool,
        bytes memory burnPositionData
    ) internal returns (uint256 amount0, uint256 amount1) {
        bytes memory mintdata = abi.encode(
            MintCallbackData({
                poolKey: PoolAddress.PoolKey({
                    token0: pool.token0(),
                    token1: pool.token1(),
                    fee: pool.fee()
                }),
                payer: msg.sender,
                burnPositionData: burnPositionData
            })
        );
        (amount0, amount1) = pool.mint(
            address(this),
            collectParams.tickLower,
            collectParams.tickUpper,
            legLiquidity,
            mintdata
        );
    }

    function _burnPosition(
        uint128 legLiquidity,
        CollectParams memory collectParams,
        IUniswapV3Pool pool
    )
        internal
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 collectedAmount0,
            uint256 collectedAmount1
        )
    {
        (amount0, amount1) = pool.burn(
            collectParams.tickLower,
            collectParams.tickUpper,
            legLiquidity
        );

        (collectedAmount0, collectedAmount1) = pool.collect(
            collectParams.recipient,
            collectParams.tickLower,
            collectParams.tickUpper,
            MAX_UINT128,
            MAX_UINT128
        );
    }

    function _rollTouchedLegs(
        uint256 oldTokenId,
        uint256 newTokenId,
        uint128 numberOfContracts,
        address mintRecipient
    ) internal {
        // take the bitwise XOR between old and new token to identify modified parameters
        uint256 XORtokenId = oldTokenId ^ newTokenId;

        uint80 XORpoolId = uint80(XORtokenId);

        uint80 poolId = uint80(oldTokenId);

        uint256 j = 0;
        uint256 burnTokenId = uint256(poolId);
        uint256 mintTokenId = uint256(poolId);

        // construct mint and burn tokenIds so that only the legs that are different are touched
        for (uint8 i = 0; i < 4; ++i) {
            if (
                (OptionEncoding.efficientDecodeID(XORtokenId, 6, i) != 0) ||
                (OptionEncoding.efficientDecodeID(XORtokenId, 5, i) != 0)
            ) {
                // Checks that the strike or width is different (not zero)
                // Ensures that all other liquidity parameters are the same
                require(
                    (OptionEncoding.efficientDecodeID(XORtokenId, 1, i) == 0) && // ratio
                        (uint8((XORtokenId >> (96 + 40 * i)) % 4) == 0),
                    "SFPM: not an option roll"
                );
                // add ratio
                burnTokenId +=
                    uint256(uint8(OptionEncoding.efficientDecodeID(oldTokenId, 1, i))) <<
                    (80 + 4 * j);
                // add long + tokenType
                burnTokenId += uint256(uint8((oldTokenId >> (96 + i * 40)) % 4)) << (96 + 40 * j);
                // set riskPartner
                burnTokenId += uint256(uint8(j)) << (96 + 40 * j + 2);
                // add strike + width
                burnTokenId +=
                    uint256(uint64((oldTokenId >> (96 + i * 40 + 4)) % 2**36)) <<
                    (96 + 40 * j + 4);

                // add ratio
                mintTokenId +=
                    uint256(uint8(OptionEncoding.efficientDecodeID(newTokenId, 1, i))) <<
                    (80 + 4 * j);
                // add long + tokenType
                mintTokenId += uint256(uint8((newTokenId >> (96 + i * 40)) % 4)) << (96 + 40 * j);
                // set riskPartner
                mintTokenId += uint256(uint8(j)) << (96 + 40 * j + 2);
                // add strike + width
                mintTokenId +=
                    uint256(uint64((newTokenId >> (96 + i * 40 + 4)) % 2**36)) <<
                    (96 + 40 * j + 4);

                j = j + 1;
            }
        }

        // flip the longShort bit for all 4 options
        _mintLiquidity(burnTokenId ^ flipLongShort, numberOfContracts, mintRecipient);
        // create the ERC1155 token (_mint from ERC1155 interface)

        _mintLiquidity(mintTokenId, numberOfContracts, mintRecipient);
    }

    function _rollPositionsCallback(
        uint256 oldTokenId,
        uint256 newTokenId,
        uint128 numberOfContracts,
        address mintRecipient
    ) internal {
        IUniswapV3Pool oldPool = poolIdToAddr[uint80(oldTokenId)];
        IUniswapV3Pool newPool = poolIdToAddr[uint80(newTokenId)];

        for (uint8 i = 0; i < 4; ++i) {
            if (OptionEncoding.efficientDecodeID(newTokenId, 1, i) == 0) {
                break;
            }

            PanopticBase.TickInfo memory oldTickInfo = PanopticMath.getTicksAndLegLiquidityEff(
                oldTokenId,
                i,
                numberOfContracts,
                oldPool.tickSpacing()
            );

            PanopticBase.TickInfo memory newTickInfo = PanopticMath.getTicksAndLegLiquidityEff(
                newTokenId,
                i,
                numberOfContracts,
                newPool.tickSpacing()
            );

            _mintPosition(
                newTickInfo.legLiquidity,
                CollectParams(newTickInfo.tickLower, newTickInfo.tickUpper, mintRecipient),
                newPool,
                abi.encode(
                    BurnPositionData(
                        oldTickInfo.legLiquidity,
                        oldPool,
                        CollectParams(
                            oldTickInfo.tickLower,
                            oldTickInfo.tickUpper,
                            address(newPool)
                        )
                    )
                )
            );
        }
    }

    function rollPosition(
        uint256 oldTokenId,
        uint256 newTokenId,
        address mintRecipient,
        address user
    ) external payable returns (uint128 tokenAmount) {
        tokenAmount = uint128(balanceOf(msg.sender, oldTokenId));
        require(tokenAmount > 0, "SFPM: no tokens to roll");

        OptionEncoding.validateTokenId(newTokenId);

        // makes sure it's the same poolId
        if (uint80(newTokenId) == uint80(oldTokenId)) {
            _rollTouchedLegs(oldTokenId, newTokenId, tokenAmount, mintRecipient);

            _burn(msg.sender, oldTokenId, tokenAmount);
            _mint(mintRecipient, newTokenId, tokenAmount, "");
        } else if (OptionEncoding.checkRollTokens(oldTokenId, newTokenId)) {
            _rollPositionsCallback(oldTokenId, newTokenId, tokenAmount, mintRecipient);

            _burn(msg.sender, oldTokenId, tokenAmount);
            _mint(mintRecipient, newTokenId, tokenAmount, "");
        } else {
            burnTokenizedPosition(oldTokenId, mintRecipient, user);
            mintTokenizedPosition(newTokenId, tokenAmount, mintRecipient, user);
        }
        emit TokenizedPositionRolled(mintRecipient, newTokenId, oldTokenId, tokenAmount, user);
    }
    /*
    function encodeID(OptionEncoding.OptionConfig[] calldata optionData, uint80 pool_id)
        public
        pure
        returns (uint256 token_id)
    {
        return OptionEncoding.encodeID(optionData, pool_id);
    }

    function decodeID(uint256 token_id)
        public
        pure
        returns (uint80 pool_id, OptionEncoding.OptionConfig[] memory optionData)
    {
        return OptionEncoding.decodeID(token_id);
    }
    */
}
