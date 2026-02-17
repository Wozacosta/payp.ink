# Story 2.4: Verify Platform Fee Withdrawal

## Status: done

## Summary

Verified that the platform owner can withdraw accumulated USDC fees via `withdrawPlatformTokenFees()`. Added 4 dedicated edge-case tests covering multi-creator fee accumulation, withdraw-earn-withdraw cycles, withdrawal ordering, and mid-stream platform withdrawals between creator payments.

## Changes

### PaypinkX402.t.sol

| Test | What it verifies |
|---|---|
| `test_WithdrawPlatformTokenFees_MultiCreatorAccumulation` | Fees from 2 creators' articles accumulate, one platform withdrawal collects all |
| `test_WithdrawPlatformTokenFees_WithdrawEarnWithdrawAgain` | Platform withdraws, new payments come in, platform withdraws again |
| `test_WithdrawOrder_PlatformFirst` | Platform withdraws before creator — order doesn't matter, contract drains fully |
| `test_WithdrawPlatformTokenFees_BetweenCreatorPayments` | Platform withdraws between two creator payments — totalRecorded stays consistent, balance check still works |

Additionally, the following tests from Story 2-3 also verify platform fee behavior:
- `test_WithdrawTokens_Amount99_PlatformGetsZero` — verifies platform gets zero when rounding eliminates its share
- `test_WithdrawTokens_CreatorIsAlsoPlatformOwner` — verifies dual-role (creator + owner) can withdraw both shares
- `testFuzz_WithdrawTokens_SplitInvariant` — fuzz-verifies platform can always withdraw its share for any amount
- `test_FullX402Flow_MultiCreatorMultiReaderChaos` — verifies platform fees through chaotic interleaved operations

## Test Results

```
110 tests passed, 0 failed, 0 skipped (110 total tests)
```

## Acceptance Criteria Verification

- [x] Platform fee balance in the contract decreases to zero after `withdrawPlatformTokenFees()`
- [x] Platform owner's wallet receives the corresponding USDC amount on Ink

## Code Review

Reviewed by grumpy-carlos-code-reviewer as part of the combined 2-3/2-4 review. Verdict: **Ship it.**

See `2-3-verify-creator-usdc-withdrawal.md` for the full review findings — all addressed.
