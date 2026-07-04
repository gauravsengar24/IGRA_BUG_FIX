#!/usr/bin/env python3
"""
Convert EVM bytecode from mnemonic format to hexadecimal.
Extracts only the opcodes and their arguments, ignoring comments.
"""

import re
import sys

# EVM opcode mapping
OPCODES = {
    'stop': '00', 'add': '01', 'mul': '02', 'sub': '03', 'div': '04', 'sdiv': '05',
    'mod': '06', 'smod': '07', 'addmod': '08', 'mulmod': '09', 'exp': '0a',
    'signextend': '0b', 'lt': '10', 'gt': '11', 'slt': '12', 'sgt': '13',
    'eq': '14', 'iszero': '15', 'and': '16', 'or': '17', 'xor': '18',
    'not': '19', 'byte': '1a', 'shl': '1b', 'shr': '1c', 'sar': '1d',
    'keccak256': '20', 'address': '30', 'balance': '31', 'origin': '32',
    'caller': '33', 'callvalue': '34', 'calldataload': '35', 'calldatasize': '36',
    'calldatacopy': '37', 'codesize': '38', 'codecopy': '39', 'gasprice': '3a',
    'extcodesize': '3b', 'extcodecopy': '3c', 'returndatasize': '3d',
    'returndatacopy': '3e', 'extcodehash': '3f', 'blockhash': '40',
    'coinbase': '41', 'timestamp': '42', 'number': '43', 'prevrandao': '44',
    'gaslimit': '45', 'chainid': '46', 'selfbalance': '47', 'basefee': '48',
    'blobhash': '49', 'blobbasefee': '4a', 'pop': '50', 'mload': '51',
    'mstore': '52', 'mstore8': '53', 'sload': '54', 'sstore': '55',
    'msize': '59', 'gas': '5a', 'jumpdest': '5b', 'jump': '56', 'jumpi': '57', 'push0': '5f',
    'dup1': '80', 'dup2': '81', 'dup3': '82', 'dup4': '83', 'dup5': '84',
    'dup6': '85', 'dup7': '86', 'dup8': '87', 'dup9': '88', 'dup10': '89',
    'dup11': '8a', 'dup12': '8b', 'dup13': '8c', 'dup14': '8d', 'dup15': '8e',
    'dup16': '8f', 'swap1': '90', 'swap2': '91', 'swap3': '92', 'swap4': '93',
    'swap5': '94', 'swap6': '95', 'swap7': '96', 'swap8': '97', 'swap9': '98',
    'swap10': '99', 'swap11': '9a', 'swap12': '9b', 'swap13': '9c',
    'swap14': '9d', 'swap15': '9e', 'swap16': '9f', 'log0': 'a0',
    'log1': 'a1', 'log2': 'a2', 'log3': 'a3', 'log4': 'a4', 'create': 'f0',
    'call': 'f1', 'callcode': 'f2', 'return': 'f3', 'delegatecall': 'f4',
    'create2': 'f5', 'staticcall': 'fa', 'revert': 'fd', 'selfdestruct': 'ff',
}

def parse_push(opcode_line):
    """Parse PUSH opcodes and return hex representation."""
    # Match push1, push2, ..., push32
    match = re.match(r'push(\d+)\s+(0x[0-9a-fA-F]+|[0-9]+)', opcode_line)
    if match:
        push_size = int(match.group(1))
        value = match.group(2)
        
        # Convert value to int
        if value.startswith('0x'):
            value_int = int(value, 16)
        else:
            value_int = int(value)
        
        # Convert to hex string (remove 0x prefix, pad to push_size bytes)
        hex_value = hex(value_int)[2:].lower()
        hex_value = hex_value.rjust(push_size * 2, '0')
        
        # Push opcode: 0x60 + push_size - 1
        push_opcode = hex(0x60 + push_size - 1)[2:]
        
        return push_opcode + hex_value
    return None

def bytecode_to_hex(bytecode_file):
    """Convert bytecode file to hex string."""
    hex_output = []
    
    with open(bytecode_file, 'r') as f:
        for line_num, line in enumerate(f, start=1):
            original_line = line
            line = line.strip()
            
            # Skip empty lines and comments
            if not line or line.startswith('#') or line.startswith('//'):
                continue
            
            # Skip section headers
            if line.startswith('################################################################'):
                continue
            
            # Extract opcode (first word)
            opcode = line.split()[0].lower() if line.split() else ''
            if not opcode:
                continue  # Empty line after stripping, skip
            
            # push0 is a special opcode (0x5f), not a PUSH instruction with value
            if opcode == 'push0':
                hex_output.append(OPCODES[opcode])
                continue
            
            # Check for PUSH opcodes (push1 through push32)
            if opcode.startswith('push') and len(opcode) > 4:  # push1, push2, etc. (not just 'push')
                push_hex = parse_push(line.lower())
                if push_hex:
                    hex_output.append(push_hex)
                    continue
                else:
                    raise ValueError(
                        f"Invalid PUSH opcode syntax at line {line_num} in {bytecode_file}:\n"
                        f"  {original_line.strip()}\n"
                        f"Expected format: push<N> <value> (e.g., 'push1 0x20' or 'push2 0x1234')"
                    )
            
            # Check for regular opcodes
            if opcode in OPCODES:
                hex_output.append(OPCODES[opcode])
            else:
                raise ValueError(
                    f"Unknown opcode '{opcode}' at line {line_num} in {bytecode_file}:\n"
                    f"  {original_line.strip()}\n"
                    f"Please add the opcode to the OPCODES dictionary or check for typos."
                )
    
    return ''.join(hex_output)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <bytecode_file>")
        sys.exit(1)
    
    bytecode_file = sys.argv[1]
    try:
        hex_output = bytecode_to_hex(bytecode_file)
        print(hex_output)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print(f"Error: File not found: {bytecode_file}", file=sys.stderr)
        sys.exit(1)
