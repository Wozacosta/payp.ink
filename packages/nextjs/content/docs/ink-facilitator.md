# Ink Facilitator Migration

Paypink's x402 USDC payment rail originally used Coinbase's CDP facilitator, which only supported Base Sepolia. This forced a cross-chain architecture where USDC settled on Base while the Paypink contract lived on Ink. In February 2026, we migrated to [thirdweb's x402 facilitator](https://portal.thirdweb.com/x402), which supports Ink natively. This document captures what changed and why.

## The Problem (Before)

When a reader paid with USDC via x402 under the CDP facilitator, five workarounds were required:

1. **Client-side chain switching** — the reader's wallet was on Ink, but x402 needed a signature on Base. The frontend forcibly switched the wallet to Base Sepolia, ran the payment, then switched back.

2. **Hardcoded `"base-sepolia"` network** — the x402 route config couldn't derive the settlement chain from the contract's chain. It was hardcoded.

3. **Skipped balance check** — `recordX402Payment()` trusted the server wallet blindly. It couldn't verify that USDC actually arrived because the tokens were on a different chain.

4. **Phantom token accounting** — `creatorTokenBalances` and `platformTokenBalance` tracked amounts that didn't physically exist on Ink. Calling `withdrawTokens()` would have reverted because the contract held zero USDC.

5. **Server wallet as sole trust bridge** — a dedicated server-side wallet (`authorizedX402Caller`) was the only defense. If compromised, fake payments could be recorded.

## The Solution

[thirdweb's x402 facilitator](https://portal.thirdweb.com/x402) supports 170+ EVM chains including Ink. Combined with [Circle's native USDC on Ink](https://www.circle.com/multi-chain-usdc/ink) (which supports EIP-3009 `transferWithAuthorization`), this enabled same-chain settlement.

## What Changed

### Frontend (`app/articles/[slug]/page.tsx`)

**Removed:** `baseSepolia` import, `useSwitchChain`, `previousChainId`, both `switchChainAsync` calls. The wallet stays on Ink throughout the payment flow.

### API Route (`api/articles/[slug]/x402/`)

**Before:** `withX402` middleware from `x402-next` with hardcoded `"base-sepolia"` network.

**After:** `settlePayment()` from `thirdweb/x402` with dynamic chain derived from `getServerChainId()` via thirdweb's `defineChain()`. The facilitator is configured with a server wallet address and `THIRDWEB_SECRET_KEY`.

### Smart Contract (`Paypink.sol`)

**Before:** Balance check disabled — couldn't verify cross-chain USDC.

**After:** Balance check re-enabled. `recordX402Payment()` verifies `IERC20(paymentToken).balanceOf(address(this)) - totalRecorded >= amount` before crediting balances. The `onlyAuthorizedX402Caller` modifier remains as defense-in-depth. `totalRecorded` tracks cumulative recorded amounts and is decremented on withdrawal.

### Dependencies

**Removed:** `x402-next`, `@x402/client`
**Added:** `thirdweb` (pinned exact version)

### Environment Variables

**Removed:** CDP-specific env vars
**Added:** `THIRDWEB_SECRET_KEY` (server-only), `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` (client)

### Configuration

**Removed:** Base Sepolia from `scaffold.config.ts` target networks. Only `foundry` (local dev) and `inkSepolia` (production) remain.

## Before vs After

| Aspect | Before (CDP facilitator) | After (thirdweb facilitator) |
|--------|--------------------------|------------------------------|
| **Reader wallet** | Switched Ink -> Base -> Ink | Stays on Ink |
| **Settlement chain** | Base Sepolia | Ink |
| **Token custody** | USDC on Base, phantom on Ink | USDC on Ink (real) |
| **Balance check** | Skipped (cross-chain) | Enabled (same-chain) |
| **`withdrawTokens()`** | Would revert (no USDC on Ink) | Works (real USDC) |
| **Trust model** | Blind trust in server wallet | Balance verification + access control |
| **Server wallet** | Required, high-trust | Required but low-trust |
| **UX** | Chain-switch dance | Seamless, single-chain |

## Related Docs

- [x402 Protocol](/docs/x402-protocol) — how x402 works now
- [Chains](/docs/chains) — Ink-only chain setup
- [Payment Rails](/docs/payment-rails) — both payment paths explained
- [Architecture](/docs/architecture) — system overview
