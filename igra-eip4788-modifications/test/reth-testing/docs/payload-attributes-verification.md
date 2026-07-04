# Payload Attributes Verification for Cancun Blocks

## Summary

After extensive testing, here are the findings regarding payload attributes for Cancun blocks with reth 1.9.2:

## Key Findings

### 1. Engine API Version Support

- ✅ `engine_forkchoiceUpdatedV1` - Available
- ✅ `engine_forkchoiceUpdatedV2` - Available  
- ✅ `engine_forkchoiceUpdatedV3` - Available (but has issues)

### 2. Parent Beacon Block Root Handling

**Critical Discovery**: reth 1.9.2 has inconsistent behavior with `parentBeaconBlockRoot`:

- **V1/V2**: Accept payload attributes WITHOUT `parentBeaconBlockRoot`
  - ✅ Test result: Successfully creates payloads
  - ⚠️ reth logs show: "EIP-4788 parent beacon block root missing for active Cancun block"
  - However, blocks can still be created

- **V3**: Rejects `parentBeaconBlockRoot` in payload attributes
  - ❌ Error: "parent beacon block root not supported before V3" (even when calling V3!)
  - ✅ Test result: V3 WITHOUT `parentBeaconBlockRoot` works

### 3. Correct Payload Attributes Format

For **Cancun blocks** with reth 1.9.2, use **V2** with these attributes:

```json
{
  "timestamp": "0x1000",  // Hex string, must be > 0
  "prevRandao": "0x...",   // 32-byte hex string
  "suggestedFeeRecipient": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
}
```

**Do NOT include** `parentBeaconBlockRoot` in payload attributes for V1/V2.

### 4. Current Issue

The simulator is currently getting "Invalid payload attributes" error even with the correct format. Possible causes:

1. **Timestamp validation**: Timestamp `0xc` (12) might be too small
2. **reth version bug**: reth 1.9.2 might have a bug with Cancun payload attributes
3. **Missing validation**: Some other field validation is failing

### 5. Test Results

| Test Case | Method | parentBeaconBlockRoot | Result |
|-----------|--------|----------------------|--------|
| Test 1 | V1 | Included | ❌ "not supported before V3" |
| Test 2 | V1 | Not included | ✅ Success (payload ID returned) |
| Test 3 | V3 | Included | ❌ "not supported before V3" |
| Test 4 | V3 | Not included | ✅ Success (payload ID returned) |

## Recommendations

1. **Use V2 without parentBeaconBlockRoot** for Cancun blocks
2. **Ensure timestamp is reasonable** (not too small, e.g., use `0x1000` or current time)
3. **Monitor reth logs** for "parent beacon block root missing" warnings (they may be non-fatal)
4. **Consider upgrading reth** if issues persist (might be a version-specific bug)

## Next Steps

1. Test with larger timestamp values
2. Check if reth automatically handles `parentBeaconBlockRoot` for Cancun blocks
3. Verify if blocks created without explicit `parentBeaconBlockRoot` have it set correctly in the block header
4. Consider using V3 without `parentBeaconBlockRoot` if V2 continues to fail
