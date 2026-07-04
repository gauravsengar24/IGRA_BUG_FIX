// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BeaconRootWrapper
 * @notice Wrapper contract to call the raw bytecode EIP-4788 contract
 * This provides a clean Solidity interface for testing
 */
contract BeaconRootWrapper {
    address public immutable beaconRootContract;
    address public constant SYSTEM_ADDRESS = 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE;
    address public constant RANDAO_READER = 0xFe38D0727B928E19bE51673Ac0691Ca22C05B1B3; // low 20 bytes of bytes32(uint256(keccak256('eip4788.modified.reader')) - 1)

    constructor(address _beaconRootContract) {
        beaconRootContract = _beaconRootContract;
    }

    /**
     * @notice Call set() function on the bytecode contract
     * @param beaconRoot The beacon root to store
     * @return success Whether the call succeeded
     */
    function set(bytes32 beaconRoot) external returns (bool success) {
        address target = beaconRootContract;
        bytes memory callData = abi.encodePacked(beaconRoot);
        assembly {
            let dataLength := mload(callData)
            let dataPtr := add(callData, 0x20)
            success := call(gas(), target, 0, dataPtr, dataLength, 0, 0)
        }
    }

    /**
     * @notice Call get() function on the bytecode contract
     * @param timestamp The timestamp to query
     * @return success Whether the call succeeded
     * @return data The returned data (root for regular callers, 32 bytes; root+randao+blocknum for RANDAO_READER, 96 bytes)
     */
    function get(uint256 timestamp) external returns (bool success, bytes memory data) {
        address target = beaconRootContract;
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

    /**
     * @notice Call get() function as SYSTEM_ADDRESS (for illustration only)
     * Note: It won't work as direct calls from (impersonated) SYSTEM_ADDRESS
     * are unsupported even in (all?) testing environments
     * @param timestamp The timestamp to query
     * @return success Whether the call succeeded
     * @return data The returned data
     */
    function getAsSystemAddress(uint256 timestamp) external returns (bool success, bytes memory data) {
        address target = beaconRootContract;
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
