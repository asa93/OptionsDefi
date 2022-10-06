// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "./MockOptionsPool.sol";
import "../ReceiptBase.sol";

contract MockOptionsFactory {
    event PoolDeployed(address poolAddress, address uniSwapPool);
    // dev Reference implementation of the options pool to clone.
    address private poolReference;
    // dev Reference implementation of the receipt token to clone.
    address private receiptReference;

    /// @dev univ3 pool => options pool
    mapping(address => address) public optionsPools;

    /// @dev IDs of pools assigned by this contract
    mapping(address => uint80) private _poolIds;
    /// @dev Pool keys by pool ID, to save on SSTOREs for position data
    // mapping(uint80 => PoolAddress.PoolKey) private _poolIdToPoolKey;
    /// @dev The ID of the next pool that is used for the first time. Skips 0
    uint80 private _nextPoolId = 1;

    constructor(address _SFPM) {
        // deploy base pool contract to use as reference
        poolReference = address(new MockOptionsPool(_SFPM));
        receiptReference = address(new ReceiptBase());
    }

    function deployToNewPool(address _poolAddress) public returns (address newPoolAddress) {
        // Create the new proxy clone for pool management
        newPoolAddress = Clones.clone(poolReference);

        // Set the pool address (can only be done once)
        MockOptionsPool newPoolContract = MockOptionsPool(payable(address(newPoolAddress)));
        newPoolContract.startPool(_poolAddress, receiptReference);

        // Transfer ownership of the pool to the msg sender
        // TODO - EVALUATE IF WE WANT TO USE THIS FACTORY TO MANAGE EVERYTHING
        // newPoolContract.transferOwnership(msg.sender);

        emit PoolDeployed(address(newPoolContract), _poolAddress);
    }
}
