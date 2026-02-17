---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
classification:
  projectType: blockchain_web3
  domain: fintech
  complexity: high
  projectContext: brownfield
inputDocuments:
  - content/docs/ink-facilitator.md
  - content/docs/x402-protocol.md
  - content/docs/payment-rails.md
  - content/docs/chains.md
  - content/docs/smart-contracts.md
  - content/docs/architecture.md
  - docs/siwe-auth.md
  - docs/oracle-selection.md
  - TODO.md
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 13
workflowType: 'prd'
---

# Product Requirements Document - paypink

**Author:** sam
**Date:** 2026-02-15

## Executive Summary

Migrate Paypink's x402 USDC payment rail from Coinbase CDP facilitator (settling on Base Sepolia) to thirdweb's x402 facilitator (settling natively on Ink). This eliminates the cross-chain gap that forces 5 architectural workarounds — chain switching, hardcoded network, skipped balance checks, phantom token accounting, and a trust-based server wallet. thirdweb already supports Ink with x402, and Circle deploys native USDC on Ink with EIP-3009 support.

## Success Criteria

### User Success

- **Readers never leave Ink** — no wallet chain-switching during USDC payment. "Pay with USDC" works seamlessly on Ink, same as "Pay with ETH."
- **Creators can withdraw real USDC** — `withdrawTokens()` transfers actual USDC from the contract, not phantom balances.
- **Same UX for both rails** — paying with USDC feels as simple as paying with ETH. One click, one confirmation, content unlocked.

### Business Success

- **Eliminate the #1 architectural debt** — the cross-chain hack (5 workarounds documented in ink-facilitator.md) is fully removed.
- **Trustless token custody** — the contract holds real USDC and verifies balances on-chain, removing blind trust in the server wallet.
- **Unblock mainnet launch** — the cross-chain gap was a blocker for production.

### Technical Success

- All existing x402 tests pass (updated for new facilitator).
- `withdrawTokens()` works end-to-end with real USDC on Ink.
- Balance check re-enabled in `recordX402Payment()`.
- Base Sepolia dependency removed from `scaffold.config.ts` and frontend imports.
- Zero regression on the ETH payment rail.

### Measurable Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Chains touched during USDC payment | 2 (Ink → Base → Ink) | 1 (Ink) |
| `withdrawTokens()` result | Reverts (zero USDC on Ink) | Succeeds (real USDC) |
| `recordX402Payment()` trust model | Blind trust in server wallet | Balance-verified on-chain |
| Cross-chain workaround code | ~40 lines across frontend + API | Removed |

## Product Scope

### MVP — This Migration

**MVP Approach:** Problem-solving — eliminate the cross-chain gap that blocks real USDC custody, creator withdrawals, and clean UX.

**Resource:** Solo developer (sam). All changes are in files already well-understood.

**Must-Have Capabilities:**

| Capability | Why Must-Have |
|-----------|---------------|
| Swap CDP facilitator for thirdweb in API route | Without this, nothing changes |
| Remove chain-switching from article reader | Reader UX fix — the whole point |
| Re-enable balance check in `recordX402Payment()` | Security fix — trustless verification |
| Set `paymentToken` to Ink USDC address | Required for real token custody |
| Update existing tests for new SDK | Can't ship without passing tests |

**Explicitly Out of Scope:**
- Eliminating the server wallet entirely (depends on thirdweb callback support)
- Multi-token support (USDT, DAI)
- Mainnet deployment
- Client-side thirdweb `useFetchWithPayment` hook (evaluate if current client-side x402 handling works with thirdweb's facilitator endpoint)

### Post-MVP (Growth)

- Evaluate server wallet elimination via thirdweb direct settlement
- Multi-token support leveraging thirdweb's 4000+ token capability
- Mainnet deployment on Ink (57073) with production USDC
- AI agent payment testing (Journey 4)

### Vision (Future)

- Superchain interop — readers on any OP Stack chain pay seamlessly
- AI agent payments — x402's HTTP-native design lets agents pay for content programmatically
- Subscription model via x402 recurring payments (if/when spec supports it)

### Implementation Order

1. **Verify EIP-3009 on Ink USDC** (go/no-go gate)
2. **Spike API route** — swap `x402-next` → thirdweb `settlePayment()` in `helpers.ts` + `route.ts`
3. **Update contract** — re-enable balance check, set `paymentToken` to Ink USDC
4. **Update frontend** — remove chain-switching from `page.tsx`
5. **Update tests** — Foundry (should pass), Vitest (update mocks), E2E (update if applicable)
6. **Update docs** — x402-protocol, chains, payment-rails, ink-facilitator
7. **Deploy to Ink Sepolia** — end-to-end smoke test

## User Journeys

### Journey 1: Mia the Reader — Paying with USDC

Mia finds a $0.50 article on Paypink. She's connected to Ink with USDC in her wallet.

**Before:** Wallet asks to switch to Base Sepolia. Confusion — "Why Base?" She approves. Signs x402 authorization on Base. Wallet switches back to Ink. Three popups, two chains. She's unsure where her USDC went.

**After:** Clicks "Pay with USDC." One popup — sign the authorization on Ink. Article loads. One chain, one signature.

→ Reveals: FR1, FR2, FR21

### Journey 2: Alex the Creator — Withdrawing USDC Earnings

Alex has $47.20 in USDC earnings from 10 articles. He clicks "Withdraw USDC" on his dashboard.

**Before:** Transaction reverts. Contract shows a balance but holds zero tokens — USDC settled on Base, not Ink. Phantom earnings.

**After:** Transaction succeeds. $47.20 USDC transfers to his wallet on Ink. Real tokens, real withdrawal.

→ Reveals: FR6, FR7, FR8, FR9

### Journey 3: Sam the Admin — Deploying the Migration

Sam installs thirdweb SDK, gets API keys, updates the API route to use `settlePayment()` with `defineChain(57073)`, re-enables the balance check in Paypink.sol, sets `paymentToken` to Ink USDC, and redeploys.

**Before:** Two chains to manage. Server wallet bridges trust. Every feature considers the cross-chain gap.

**After:** One chain. Simpler codebase. Reduced trust surface.

→ Reveals: FR15, FR16, FR17, FR18, FR19, FR20

### Journey 4: Bot the AI Agent — Programmatic Payment

An AI agent sends `GET /api/articles/cool-article/x402` and receives a 402.

**Before:** 402 says `network: "base-sepolia"`. Agent needs a Base wallet. Stuck if it only has Ink.

**After:** 402 says `network: "eip155:57073"` (Ink). Agent signs on Ink, thirdweb settles, content returned. Same chain as everything else.

→ Reveals: FR3, FR4

### Journey-to-FR Traceability

| Capability | Source | FRs |
|-----------|--------|-----|
| Remove chain-switching UI | Journey 1 | FR1, FR2, FR21 |
| Real USDC custody + working withdrawals | Journey 2 | FR6–FR11 |
| Swap CDP → thirdweb SDK | Journey 3 | FR15–FR20 |
| CAIP-2 network identifier | Journey 4 | FR3, FR4 |
| Backward compatibility | All | FR12, FR13, FR14 |
| Doc updates | Journey 3 | FR22–FR25 |

## Domain-Specific Requirements

### Compliance & Regulatory

- **No custodial risk** — thirdweb handles settlement via EIP-3009 `transferWithAuthorization`. Paypink's contract holds USDC only as split balances awaiting withdrawal.
- **EIP-3009 authorization model** — reader signs a typed EIP-712 message authorizing a specific transfer amount. The facilitator cannot move more than authorized.
- **No KYC/AML scope** — Paypink is permissionless. KYC/AML responsibilities sit with thirdweb and Circle.

### Technical Constraints

- **EIP-3009 dependency** — x402 requires `transferWithAuthorization` on the payment token. Circle's native USDC on Ink very likely supports it, but must be verified before migration.
- **Facilitator trust** — thirdweb replaces CDP. Both are trust-minimizing (can only execute what the user signed), but we're changing a dependency.
- **Server wallet role change** — shifts from high-trust (sole defense) to low-trust (balance check provides independent verification). Potentially eliminable post-MVP.

### Risk Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ink USDC lacks EIP-3009 | Migration blocked | Verify `transferWithAuthorization` on Ink explorer before starting (go/no-go gate) |
| thirdweb facilitator downtime | USDC payments unavailable | ETH rail fully independent; can fall back to CDP if needed |
| USDC address wrong on deploy | Funds sent to wrong token | Verify against Circle's official docs; test on Sepolia first |
| Server wallet compromise | Fake payments recorded | Contract verifies balance — attacker can't record without real USDC |
| thirdweb SDK breaking changes | API route breaks | Pin exact SDK version in `package.json` |
| thirdweb incompatible with Next.js 15 | Integration blocked | Verify App Router compatibility before implementation |

## Blockchain/Web3 Specific Requirements

### Chain Specs

| Parameter | Current | After Migration |
|-----------|---------|-----------------|
| Contract chain | Ink Sepolia (763373) | Unchanged |
| Settlement chain | Base Sepolia (84532) | Ink Sepolia (763373) — same as contract |
| Mainnet target | Ink (57073) | Unchanged |
| USDC contract (Sepolia) | N/A (Base USDC) | `0xFabab97dCE620294D2B0b0e46C68964e326300Ac` |
| USDC contract (Mainnet) | N/A | Verify from Circle docs |
| CAIP-2 identifier | `eip155:84532` (Base) | `eip155:763373` / `eip155:57073` (Ink) |

### Wallet Support

- **Reader wallet** — RainbowKit + Wagmi, stays on Ink throughout. No chain switching.
- **Server wallet** — currently calls `recordX402Payment()` via viem `WalletClient`. Role reduces post-migration. May be eliminable if thirdweb settles directly to the contract.
- **thirdweb server wallet** — `facilitator()` requires a `serverWalletAddress`. Needs verification whether this can be the contract address directly.

### Smart Contract Changes

| Function | Change |
|----------|--------|
| `recordX402Payment()` | Re-enable balance check: `balanceOf(address(this)) - totalRecorded >= amount` |
| `withdrawTokens()` | No code change — already implemented, currently non-functional |
| `setPaymentToken()` | Owner calls to set Ink USDC address |
| `_splitTokenPayment()` | No change |

### Implementation Considerations

- **Dependency swap** — remove `x402-next`, `@x402/client`. Add `thirdweb`. Changes both client-side payment handling and server-side settlement API.
- **Environment variables** — add `THIRDWEB_SECRET_KEY` (server), `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` (client). Remove CDP-specific env vars.
- **Backward compatibility** — existing `hasPaid` entries from CDP-era payments remain valid. No on-chain state migration.
- **Gas optimization** — not a concern. Minimal contract changes. Ink L2 gas is very low.
- **Security** — strictly improved. Same access control (`onlyAuthorizedX402Caller`), same withdrawal pattern (pull-over-push), plus re-enabled balance check. No audit needed for this migration.
- **Testing** — Foundry tests cover `recordX402Payment()` with MockERC20. Re-enabling balance check should pass without modification. Frontend/API tests need SDK updates.

## Functional Requirements

### Payment Settlement

- **FR1:** Reader can pay for an article with USDC without switching wallet chains
- **FR2:** Reader's USDC payment settles on the same chain as the Paypink contract (Ink)
- **FR3:** The x402 API route returns a 402 response with Ink's CAIP-2 network identifier (`eip155:763373` / `eip155:57073`)
- **FR4:** The x402 facilitator (thirdweb) verifies and settles the reader's EIP-3009 `transferWithAuthorization` on Ink
- **FR5:** After settlement, the API route records the payment on-chain via `recordX402Payment()`

### Token Custody & Verification

- **FR6:** The Paypink contract verifies USDC tokens are present on-chain before recording an x402 payment
- **FR7:** `recordX402Payment()` checks `IERC20(paymentToken).balanceOf(address(this)) - totalRecorded >= amount` before crediting balances
- **FR8:** The contract's `paymentToken` is set to Circle's native USDC address on Ink

### Creator Earnings

- **FR9:** Creator can withdraw accumulated USDC earnings via `withdrawTokens()`
- **FR10:** Platform owner can withdraw accumulated USDC platform fees via `withdrawPlatformTokenFees()`
- **FR11:** The 99/1 split on USDC payments credits real token balances backed by actual USDC in the contract

### Payment State (Unchanged)

- **FR12:** Both ETH and USDC payments write to the same `hasPaid[slugHash][reader]` state
- **FR13:** Reader who paid via the old CDP facilitator retains their `hasPaid` status
- **FR14:** Reader can still pay for articles with ETH via `payForArticle()` (zero regression)

### API & SDK Integration

- **FR15:** The x402 API route uses thirdweb's `settlePayment()` for payment verification and settlement
- **FR16:** The x402 API route configures thirdweb's `facilitator()` with a server wallet address and secret key
- **FR17:** The server authenticates with thirdweb via `THIRDWEB_SECRET_KEY` environment variable
- **FR18:** The client identifies the app via `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` environment variable

### Configuration & Deployment

- **FR19:** Admin can set the payment token address on the contract via `setPaymentToken()`
- **FR20:** `scaffold.config.ts` no longer includes Base Sepolia as a target network
- **FR21:** The frontend no longer imports `baseSepolia` or uses `useSwitchChain` for x402 payments

### Documentation

- **FR22:** The x402-protocol doc reflects thirdweb as the facilitator and Ink as the settlement chain
- **FR23:** The chains doc removes the cross-chain gap section for Base Sepolia
- **FR24:** The payment-rails doc reflects same-chain settlement for the USDC rail
- **FR25:** The ink-facilitator doc reflects that the migration is complete

## Non-Functional Requirements

### Security

- **NFR1:** The contract verifies USDC balance before crediting payment — `balanceOf(address(this)) - totalRecorded >= amount` must pass, or the transaction reverts
- **NFR2:** `onlyAuthorizedX402Caller` modifier remains on `recordX402Payment()` — the balance check is defense-in-depth, not a replacement for access control
- **NFR3:** `THIRDWEB_SECRET_KEY` is never exposed client-side — server-only, stored in `.env.local`, never prefixed with `NEXT_PUBLIC_`
- **NFR4:** thirdweb SDK version pinned in `package.json` (exact version, not `^`) to prevent breaking changes in the settlement flow
- **NFR5:** USDC contract address verified against Circle's official documentation before deployment to each environment

### Integration

- **NFR6:** thirdweb facilitator responds to `/verify` and `/settle` within 10 seconds — on timeout, API route returns 502 with clear error
- **NFR7:** ETH payment rail remains fully independent of thirdweb — if thirdweb is down, ETH payments work with zero degradation
- **NFR8:** No on-chain state migration required — existing `hasPaid` entries from CDP-era payments remain valid
- **NFR9:** thirdweb SDK supports Next.js 15 App Router (server components + route handlers) — verified before implementation
