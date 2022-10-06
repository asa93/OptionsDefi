// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity 0.7.6;

pragma abicoder v2;

import "../libraries/OptionEncoding.sol";

contract MockOptionEncoding {
    function encodeID(OptionEncoding.OptionConfig[] memory optionData, uint80 pool_id)
        public
        pure
        returns (uint256 id)
    {
        return OptionEncoding.encodeID(optionData, pool_id);
    }

    function decodeID(uint256 id)
        public
        pure
        returns (uint80 pool_id, OptionEncoding.OptionConfig[] memory optionData)
    {
        return OptionEncoding.decodeID(id);
    }
}
