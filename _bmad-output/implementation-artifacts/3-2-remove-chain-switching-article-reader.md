# Story 3-2: Remove Chain-Switching Logic from Article Reader

**Status:** DONE
**Date:** 2026-02-17

## Changes Made

### 1. `packages/nextjs/app/articles/[slug]/page.tsx`
- Removed commented-out CDP x402 client imports (`@x402/core/client`, `@x402/evm/exact/client`, `@x402/fetch`)
- Removed commented-out `baseSepolia` import from `viem/chains`
- Removed commented-out `getErrorMessage` utility import
- No active chain-switching code existed — previous work had already commented it out

### 2. `packages/nextjs/app/articles/[slug]/__tests__/page.test.tsx`
- Removed commented-out x402 mock declarations
- Removed `chainId: 84532` (Base Sepolia) from `useAccount` mock — `page.tsx` never reads `chainId`

## Not Changed (intentional)

### USDC Pay Button
- Remains disabled with tooltip "USDC payment coming soon (thirdweb migration in progress)"
- thirdweb facilitator does not support Ink Sepolia — USDC payment cannot be wired up on testnet
- Button will be enabled when deploying to Ink Mainnet where thirdweb facilitator is available

### `NetworkOptions.tsx`
- Generic SE-2 component using `useSwitchChain` — iterates over `targetNetworks`
- Since Story 3-1 removed Base Sepolia from `targetNetworks`, this component no longer offers it
- No code change needed

## Test Results

All 11 article page tests pass:
- Loading, not-found, paywall, auth states
- Free/creator bypass, markdown rendering, integrity check
- ETH button enabled, USDC button disabled

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| Page no longer imports `baseSepolia` from viem/chains | PASS |
| Page no longer uses `useSwitchChain` for x402 payments | PASS (was already removed; dead code cleaned) |
| ETH payment flow (`payForArticle()`) continues working with zero regression | PASS (11/11 tests) |
| USDC payment flow on Ink | DEFERRED — thirdweb facilitator doesn't support Ink Sepolia |
