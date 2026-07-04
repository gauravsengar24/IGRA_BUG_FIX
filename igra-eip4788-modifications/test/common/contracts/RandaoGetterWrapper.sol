// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RandaoGetterWrapper
 * @notice Wrapper contract to call the RANDAO_READER bytecode contract
 */
contract RandaoGetterWrapper {
    address public immutable randaoGetterContract;

    constructor(address _randaoGetterContract) {
        randaoGetterContract = _randaoGetterContract;
    }

    /**
     * @notice Call RANDAO_READER contract to retrieve prevRandao
     * @param timestamp The timestamp to query
     * @return success Whether the call succeeded
     * @return data The returned data (root+randao+blocknum, 96 bytes)
     */
    function getPrevRandao(uint256 timestamp) external returns (bool success, bytes memory data) {
        address target = randaoGetterContract;
        bytes memory callData = abi.encodePacked(timestamp);
        assembly {
            let dataLength := mload(callData)
            let dataPtr := add(callData, 0x20)
            success := call(gas(), target, 0, dataPtr, dataLength, 0, 0)
            let returnSize := returndatasize()
            data := mload(0x40)
            mstore(data, returnSize)
            returndatacopy(add(data, 0x20), 0, returnSize)
            mstore(0x40, add(data, add(0x20, returnSize)))
        }
    }
}
