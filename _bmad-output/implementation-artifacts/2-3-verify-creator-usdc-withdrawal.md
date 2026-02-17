# Story 2.3: Verify Creator USDC Withdrawal End-to-End

## Status: done

## Summary

Verified that creators can withdraw accumulated USDC earnings via `withdrawTokens()`. Added 12 edge-case tests and 1 fuzz test covering multi-article accumulation, withdraw-earn-withdraw cycles, creator isolation, rounding dust, airdrop behavior, interleaved withdrawals, ETH/USDC coexistence, and large amounts.

## Changes

### PaypinkX402.t.sol

| Test | What it verifies |
|---|---|
| `test_WithdrawTokens_MultiArticleAccumulation` | Creator earns from 2 articles, withdraws once, gets combined total |
| `test_WithdrawTokens_WithdrawEarnWithdrawAgain` | Creator withdraws, earns more, withdraws again — lifecycle correctness |
| `test_WithdrawTokens_TwoCreatorsIsolated` | Two creators with separate articles — balances fully isolated |
| `test_WithdrawTokens_Amount99_PlatformGetsZero` | Amount=99 rounds platform to 0, creator gets full amount |
| `test_WithdrawTokens_CreatorIsAlsoPlatformOwner` | Deployer is both creator and owner — dual-role withdrawal works |
| `test_WithdrawTokens_UnsolicitedAirdropDoesNotInflateBalances` | Airdropped tokens don't inflate withdrawable amounts |
| `test_WithdrawTokens_AirdropCoversNextPayment` | Airdropped tokens can satisfy balance check for future x402 payments |
| `test_WithdrawTokens_InterleavedWithdrawals` | Creator A withdraws between payments to creator B — totalRecorded stays consistent |
| `test_WithdrawTokens_ManyPaymentsBatchWithdraw` | 10 sequential payments, one batch withdrawal |
| `test_WithdrawTokens_RoundingDustInvariant` | Awkward amounts (1, 99, 101) — split invariant holds, contract drains to zero |
| `test_WithdrawTokens_RealisticUSDC6Decimals` | Realistic $5 USDC payment (6 decimals) — split and withdrawal correct |
| `test_WithdrawTokens_LargeAmount_NoOverflow` | uint128.max payment — no overflow in split math |
| `test_WithdrawTokens_ETHAndUSDCCoexist` | ETH and USDC payments on same article — independent withdrawal paths |
| `test_WithdrawTokens_SameReaderTwoArticles` | Same reader pays two articles by same creator — earnings accumulate |
| `test_WithdrawTokens_StrangerReverts` | Non-creator with zero balance gets NothingToWithdraw revert |
| `test_RecordX402Payment_ZeroAmount_MarksAsPaidButCreditsNothing` | Zero-amount payment marks hasPaid but credits nothing |
| `testFuzz_WithdrawTokens_SplitInvariant` | Fuzz: for any amount in [1, uint128.max], split invariant holds and both sides can withdraw |
| `test_BalanceCheck_AfterPartialWithdrawal` | Balance check uses updated totalRecorded after partial withdrawal |
| `test_FullX402Flow_MultiCreatorMultiReaderChaos` | 3 creators, 5 readers, interleaved payments and withdrawals — per-actor and aggregate assertions |

## Test Results

```
110 tests passed, 0 failed, 0 skipped (110 total tests)
```

- 45 x402 tests (was 22, added 23 new across stories 2-3 and 2-4)
- 61 core Paypink tests
- 3 integration tests
- 1 scaffold default test

## Acceptance Criteria Verification

- [x] Creator's USDC balance in the contract decreases to zero after `withdrawTokens()`
- [x] Creator's wallet receives the corresponding USDC amount on Ink
- [x] The 99/1 split between creator and platform is correctly reflected in both balances

## Code Review

Reviewed by grumpy-carlos-code-reviewer. Verdict: **Ship it.**

Issues raised and resolved:
1. **(low)** Wrong comment arithmetic in chaos test — **fixed** (742 -> 743)
2. **(medium)** Chaos test under-asserted individual balances — **fixed** with per-actor assertions
3. **(medium)** Zero-amount payment behavior undocumented — **fixed** with explicit test
4. **(low)** Same reader / two articles untested — **fixed** with new test
5. **(nit)** Stream-of-consciousness comment — **fixed**
6. **(informational)** No events emitted on token withdrawals — acknowledged, contract-level concern for future epic

## Observations

- Zero-amount x402 payments are accepted by the contract (no revert). This marks the reader as paid without crediting any balances. This is arguably acceptable since the x402 caller is trusted, but could be worth adding a guard in a future hardening pass.
- Unsolicited token airdrops to the contract are "stuck" — no accounting path to withdraw them. They can however satisfy the balance check for future x402 payments, effectively subsidizing the facilitator.
- No withdrawal events are emitted by `withdrawTokens()` or `withdrawPlatformTokenFees()`. This may impact off-chain indexing. Noted for future improvement.
