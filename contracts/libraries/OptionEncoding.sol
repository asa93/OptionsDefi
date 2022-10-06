// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity 0.7.6;

pragma abicoder v2;

import "@uniswap/v3-core/contracts/libraries/TickMath.sol";

library OptionEncoding {
    struct OptionConfig {
        int24 strike;
        uint16 width;
        uint8 riskPartner;
        uint8 tokenType;
        uint8 long;
        uint8 ratio;
    }

    /**
     * @dev id structure in bit
     *
     * ===== 4 times (one for each leg) ==============================================================
     * width            12bits  : defined as (tickUpper - tickLower) / 2
     * strike           24bits  : defined as (tickUpper + tickLower) / 2
     * riskPartner       2bits  : normally its own index. Partner in defined risk position otherwise
     * tokenType         1bits  : which token is moved when deployed (0 -> token0, 1 -> token1)
     * long              1bit   : long==1 means liquidity is removed, long==0 -> liquidity is added
     * ===== 4 times (one for each leg) ==============================================================
     * ratio             4bits  : ratio is the number of contract for each leg
     * ===== 1 time ==================================================================================
     * pool_id          80bits  : first 10 byte of the Uniswap v3 pool address
     */
    function encodeID(OptionConfig[] memory optionData, uint80 pool_id)
        public
        pure
        returns (uint256 id)
    {
        id = 0;
        uint256 _tmp;

        for (uint256 i = 0; i < optionData.length; ++i) {
            OptionConfig memory data = optionData[i];

            _tmp = i * 40;
            id += uint256(data.width) << (_tmp + 124);
            id += uint256(uint24(data.strike)) << (_tmp + 100);
            id += uint256(data.riskPartner) << (_tmp + 98);
            id += uint256(data.tokenType) << (_tmp + 97);
            id += uint256(data.long) << (_tmp + 96);
            id += uint256(data.ratio) << (4 * i + 80);
        }

        id += pool_id;
        return id;
    }

    function decodeID(uint256 id)
        public
        pure
        returns (uint80 pool_id, OptionConfig[] memory optionData)
    {
        pool_id = uint80(id);
        optionData = new OptionConfig[](4);
        id = id >> 80;

        for (uint256 i = 0; i < 4; ++i) {
            optionData[i].ratio = uint8(id % 16);
            id = id >> 4;
        }

        for (uint256 i = 0; i < 4; ++i) {
            OptionConfig memory data = optionData[i];
            data.long = uint8(id % 2);
            id = id >> 1;
            data.tokenType = uint8(id % 2);
            id = id >> 1;
            data.riskPartner = uint8(id % 4);
            id = id >> 2;
            data.strike = int24(uint24(id));
            id = id >> 24;
            data.width = uint16(id % 4096);
            id = id >> 12;
        }
    }

    function efficientDecodeID(
        uint256 id,
        uint8 argumentType,
        uint8 positionNumber
    ) internal pure returns (uint256) {
        if (argumentType == 0) {
            // pool_id
            return uint80(id);
        } else if (argumentType == 1) {
            // ratios
            return uint8((id >> (80 + positionNumber * 4)) % 16);
        } else if (argumentType == 2) {
            // long
            return uint8((id >> (96 + positionNumber * 40)) % 2);
        } else if (argumentType == 3) {
            // tokenType
            return uint8((id >> (96 + positionNumber * 40 + 1)) % 2);
        } else if (argumentType == 4) {
            // riskPartner
            return uint8((id >> (96 + positionNumber * 40 + 2)) % 4);
        } else if (argumentType == 5) {
            // strike
            return uint24((id >> (96 + positionNumber * 40 + 4)));
        } else if (argumentType == 6) {
            // width
            return uint16((id >> (96 + positionNumber * 40 + 28)) % 4096);
        }
    }

    function validateTokenId(uint256 tokenId) public pure returns (bool valid) {
        require(uint80(tokenId) != 0, "SFPM: invalid pool=0");
        require(efficientDecodeID(tokenId, 1, 0) != 0, "SFPM: invalid ratio at position0");

        // loop through the 4 positions in the tokenId
        for (uint8 i = 0; i < 4; ++i) {
            //OptionConfig memory optionData = optionConfigs[i];

            if (efficientDecodeID(tokenId, 1, i) == 0) {
                //ratio
                for (uint8 j = i + 1; j < 4; ++j) {
                    require(efficientDecodeID(tokenId, 1, j) == 0, "SFPM: invalid ratio");
                }
            } else {
                require(efficientDecodeID(tokenId, 6, i) != 0, "SFPM: invalid width");
            }
            require(
                int24(efficientDecodeID(tokenId, 5, i)) != TickMath.MAX_TICK &&
                    int24(efficientDecodeID(tokenId, 5, i)) != TickMath.MIN_TICK,
                "SFPM: invalid strike"
            );

            if (efficientDecodeID(tokenId, 6, i) == 4095) {
                //width
                require(efficientDecodeID(tokenId, 5, i) == 0, "SFPM: invalid strike + width");
            }

            if (efficientDecodeID(tokenId, 4, i) > i) {
                //riskPartner
                uint8 riskPartnerIndex = uint8(efficientDecodeID(tokenId, 4, i));
                require(
                    (efficientDecodeID(tokenId, 1, riskPartnerIndex) ==
                        efficientDecodeID(tokenId, 1, i)) && //ratio
                        (efficientDecodeID(tokenId, 3, riskPartnerIndex) ==
                            efficientDecodeID(tokenId, 3, i)) && // tokenType
                        (efficientDecodeID(tokenId, 4, riskPartnerIndex) == i) && // riskPartner
                        (efficientDecodeID(tokenId, 2, riskPartnerIndex) !=
                            efficientDecodeID(tokenId, 2, i)), // long
                    "SFPM: invalid risk partner"
                );
            }
        }
        return true;
    }

    function checkRollTokens(uint256 oldTokenId, uint256 newTokenId)
        public
        pure
        returns (bool valid)
    {
        //"ROLL: invalid tokens"
        //"ROLL: must be different pools"
        if (
            !((validateTokenId(oldTokenId) && validateTokenId(newTokenId)) &&
                uint80(oldTokenId) != uint80(newTokenId))
        ) {
            return false;
        }

        for (uint8 i = 0; i < 4; ++i) {
            if (efficientDecodeID(oldTokenId, 1, i) != efficientDecodeID(newTokenId, 1, i)) {
                //"ROLL: each leg must have same ratio"
                return false;
            }

            //"ROLL: each leg must be short"
            if (
                efficientDecodeID(oldTokenId, 2, i) != 0 || efficientDecodeID(newTokenId, 2, i) != 0
            ) {
                return false;
            }

            // "ROLL: each leg must be same tokenType"
            if (efficientDecodeID(oldTokenId, 3, i) != efficientDecodeID(newTokenId, 3, i)) {
                return false;
            }
        }
        return true;
    }
}
