# Story 3-1: Remove Base Sepolia from scaffold.config.ts

**Status:** DONE
**Date:** 2026-02-17

## Changes Made

### 1. `packages/nextjs/scaffold.config.ts`
- Removed `chains.baseSepolia` from both branches of the `targetNetworks` ternary
- Local dev: `[chains.foundry, chains.inkSepolia]`
- Production: `[chains.inkSepolia]`

### 2. `packages/nextjs/services/web3/serverChainId.ts`
- Removed `baseSepolia` from the `CHAINS` lookup map and its import
- Only `foundry` and `inkSepolia` remain as valid server-side chain targets

## Files NOT Changed (intentional)

### `packages/foundry/foundry.toml`
- `baseSepolia` RPC endpoint was already commented out — no change needed

### `packages/nextjs/utils/scaffold-eth/networks.ts`
- Contains `[chains.baseSepolia.id]: "base-sepolia"` in `RPC_CHAIN_NAMES`
- This is a generic SE-2 utility mapping (covers ~20 chains), not project-specific config
- Left as-is to preserve SE-2 upstream compatibility

### `packages/nextjs/app/articles/[slug]/page.tsx` and test files
- Contain `baseSepolia` imports and `useSwitchChain` usage
- These are **Story 3.2** scope (chain-switching logic removal)

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| `scaffold.config.ts` only includes Ink Sepolia (+ Foundry for local dev) | PASS |
| No other config files reference Base Sepolia chain ID (84532) | PASS |
| Project compiles without errors | PASS (pre-existing Playwright type issue unrelated) |
