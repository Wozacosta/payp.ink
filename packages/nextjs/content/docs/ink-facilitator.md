# What If x402 Supported Ink?

Today, Paypink's x402 USDC payment rail is complicated by a cross-chain gap: the [x402 facilitator](https://docs.cdp.coinbase.com/x402/network-support) only supports **Base Sepolia**, but our contract lives on **Ink Sepolia**. This forces workarounds across the entire stack.

This doc maps out exactly what would change — and what would simplify — if a native Ink facilitator existed.

## The Problem Today

When a reader pays with USDC via x402, five things happen that wouldn't be necessary on a single chain:

1. **Client-side chain switching** — the reader's wallet is on Ink, but x402 needs a signature on Base. The frontend forcibly switches the wallet to Base Sepolia, runs the payment, then switches back.

2. **Hardcoded `"base-sepolia"` network** — the x402 route config can't derive the settlement chain from the contract's chain. It's hardcoded.

3. **Skipped balance check** — `recordX402Payment()` trusts the server wallet blindly. It can't verify that USDC actually arrived because the tokens are on a different chain.

4. **Phantom token accounting** — `creatorTokenBalances` and `platformTokenBalance` track amounts that don't physically exist on Ink. Calling `withdrawTokens()` would revert because the contract holds zero USDC.

5. **Server wallet as trust bridge** — a dedicated server-side wallet (`authorizedX402Caller`) is the only defense. If compromised, fake payments can be recorded.

## What Changes With an Ink Facilitator

### Frontend (`app/articles/[slug]/page.tsx`)

**Before (cross-chain):**
```typescript
import { baseSepolia } from "viem/chains";
import { useSwitchChain } from "wagmi";

const handlePayUsdc = async () => {
  const previousChainId = activeChainId;
  // Switch to Base Sepolia for x402 signature
  if (activeChainId !== baseSepolia.id) {
    await switchChainAsync({ chainId: baseSepolia.id });
  }
  // ... run x402 payment ...
  // Switch back
  finally {
    await switchChainAsync({ chainId: previousChainId });
  }
};
```

**After (same-chain):**
```typescript
// No chain switching needed. Wallet stays on Ink.
const handlePayUsdc = async () => {
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const res = await fetchWithPayment(`/api/articles/${slug}/x402`);
  // Done. No chain dance.
};
```

**Removed:** `baseSepolia` import, `useSwitchChain`, `previousChainId`, both `switchChainAsync` calls.

### API Route Config (`api/articles/[slug]/x402/helpers.ts`)

**Before:**
```typescript
return {
  price: `$${priceUsd}`,
  network: "base-sepolia" as const,  // hardcoded
};
```

**After:**
```typescript
return {
  price: `$${priceUsd}`,
  network: "ink-sepolia" as const,   // matches contract chain
};
```

### Smart Contract (`Paypink.sol`)

This is where the biggest simplification happens.

**Before (cross-chain, trust-based):**
```solidity
function recordX402Payment(
    string calldata slug,
    address reader,
    uint256 amount
) external onlyAuthorizedX402Caller {
    // No token transfer — tokens are on Base, not here
    // No balance check — can't see Base USDC from Ink
    // Just update accounting and trust the caller
    hasPaid[key][reader] = true;
    _splitTokenPayment(amount, article.creator);  // phantom
}
```

**After (same-chain, trustless):**
```solidity
function recordX402Payment(
    string calldata slug,
    address reader,
    uint256 amount
) external onlyAuthorizedX402Caller {
    // Real token custody — USDC is on Ink now
    IERC20(paymentToken).safeTransferFrom(
        address(this), address(this), amount  // or verify balance
    );
    hasPaid[key][reader] = true;
    _splitTokenPayment(amount, article.creator);  // real split
}
```

**And `withdrawTokens()` actually works:**
```solidity
function withdrawTokens() external {
    uint256 amount = creatorTokenBalances[msg.sender];
    creatorTokenBalances[msg.sender] = 0;
    // This succeeds because USDC is actually here
    IERC20(paymentToken).safeTransfer(msg.sender, amount);
}
```

### Server Wallet (`services/web3/serverWallet.ts`)

The server wallet **still exists** — it's needed to call `recordX402Payment()` after the facilitator confirms settlement. But its trust surface shrinks dramatically because the contract can now independently verify the token balance.

An even deeper fix: if the Ink facilitator supported a **callback mechanism** (calling the contract directly after settlement), the server wallet could be eliminated entirely.

## Full Comparison

| Aspect | Today (Base facilitator) | With Ink facilitator |
|--------|--------------------------|---------------------|
| **Reader wallet** | Switches Ink → Base → Ink | Stays on Ink |
| **Settlement chain** | Base Sepolia | Ink Sepolia |
| **Token custody** | USDC on Base, phantom on Ink | USDC on Ink (real) |
| **Balance check** | Skipped (cross-chain) | Enabled (same-chain) |
| **`withdrawTokens()`** | Would revert (no USDC on Ink) | Works (USDC is here) |
| **Trust model** | Blind trust in server wallet | Cryptographic proof via balance |
| **Server wallet** | Required, high-trust | Required but low-trust (or eliminable) |
| **UX** | Chain-switch dance, confusing | Seamless, single-chain |
| **Code complexity** | ~30 extra lines in frontend | Removed |

## Files Affected

| File | Change |
|------|--------|
| `app/articles/[slug]/page.tsx` | Remove `baseSepolia` import, `useSwitchChain`, chain-switching logic (~20 lines) |
| `api/.../x402/helpers.ts` | `"base-sepolia"` → `"ink-sepolia"` (2 lines) |
| `Paypink.sol` | Re-enable balance check in `recordX402Payment`, real `withdrawTokens()` |
| `services/web3/serverWallet.ts` | Unchanged (or removable with facilitator callback) |
| `scaffold.config.ts` | Could remove `baseSepolia` from `targetNetworks` |
| `content/docs/x402-protocol.md` | Remove "Cross-Chain Limitation" section |
| `content/docs/chains.md` | Simplify Base Sepolia section |

## Migration Path

1. **Wait for Ink facilitator** — monitor [x402 network support](https://docs.cdp.coinbase.com/x402/network-support)
2. **Deploy USDC on Ink** (or use bridged USDC) — set as `paymentToken` via `setPaymentToken()`
3. **Update `getRouteConfig`** — change network string
4. **Update contract** — re-enable balance verification in `recordX402Payment`
5. **Remove chain-switching** — simplify `handlePayUsdc` in article reader
6. **Test `withdrawTokens()`** — with real USDC on Ink, creators can actually withdraw

## Current Status (Feb 2026)

**Good news: [thirdweb's x402 facilitator](https://portal.thirdweb.com/x402) already supports Ink.** Their facilitator covers 170+ EVM chains, and [Ink is explicitly listed](https://thirdweb.com/ink) with x402 as a supported service. This means we don't need to wait or self-host — a production-ready Ink facilitator exists today.

### thirdweb Facilitator — Ready to Use

Server-side setup with thirdweb:

```typescript
import { createThirdwebClient } from "thirdweb";
import { facilitator, settlePayment } from "thirdweb/x402";
import { defineChain } from "thirdweb/chains";

const ink = defineChain(57073); // Ink mainnet

const client = createThirdwebClient({ secretKey: process.env.THIRDWEB_SECRET_KEY });
const thirdwebFacilitator = facilitator({
  client,
  serverWalletAddress: "0xYourWalletAddress",
});

// In your API route:
const result = await settlePayment({
  paymentData: request.headers.get("X-PAYMENT"),
  network: ink,
  price: "$0.50",
  payTo: creatorAddress,
  facilitator: thirdwebFacilitator,
  // ...
});
```

Client-side (React):
```typescript
import { useFetchWithPayment } from "thirdweb/react";
const { fetchWithPayment } = useFetchWithPayment(client);
const res = await fetchWithPayment(`/api/articles/${slug}/x402`);
```

No chain switching needed — the reader's wallet stays on Ink.

### Other Options

The [Coinbase CDP facilitator](https://docs.cdp.coinbase.com/x402/network-support) still only supports Base + Solana. None of the other [22 facilitators on x402.org/ecosystem](https://www.x402.org/ecosystem) explicitly list Ink either.

However, **x402 V2 also makes self-hosting viable:**

- The [`@x402/evm` package](https://www.x402.org/writing/x402-v2-launch) supports **any EVM chain** via CAIP-2 identifiers, as long as the payment token implements EIP-3009 (`transferWithAuthorization`).
- [Circle deploys native USDC on Ink](https://www.circle.com/multi-chain-usdc/ink) (not bridged). Native USDC consistently includes EIP-3009, so Ink USDC very likely supports it.
- Ink's CAIP-2 identifier is `eip155:57073` (mainnet) / `eip155:763373` (Sepolia).

**Summary of paths:**

1. **Use thirdweb's facilitator** — production-ready, supports Ink today, 170+ chains, handles settlement and gas sponsorship
2. **Self-host a facilitator** using `@x402/evm` + `eip155:57073` — if you want full control and no third-party dependency
3. **Use a generic CAIP-2 EVM facilitator** — e.g. [Corbits](https://www.x402.org/ecosystem) claims broad EVM support
4. **Wait** for CDP to add Ink — least effort but unknown timeline

## Self-Hosting Details

Running our own x402 facilitator on Ink using `@x402/evm` would:

- Settle USDC on Ink directly
- Eliminate the cross-chain gap immediately
- Require running and maintaining facilitator infrastructure
- Use Circle's native USDC on Ink (already deployed)

Trade-off: operational complexity vs. waiting for official support.

## Related Docs

- [x402 Protocol](/docs/x402-protocol) — how x402 works today
- [Chains](/docs/chains) — which chains we use and why
- [Payment Rails](/docs/payment-rails) — both payment paths explained
- [Architecture](/docs/architecture) — system overview
