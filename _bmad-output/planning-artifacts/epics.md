---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
---

# paypink - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for paypink, decomposing the requirements from the PRD into implementable stories for the x402 migration from CDP facilitator to thirdweb on Ink.

## Requirements Inventory

### Functional Requirements

FR1: Reader can pay for an article with USDC without switching wallet chains
FR2: Reader's USDC payment settles on the same chain as the Paypink contract (Ink)
FR3: The x402 API route returns a 402 response with Ink's CAIP-2 network identifier (`eip155:763373` / `eip155:57073`)
FR4: The x402 facilitator (thirdweb) verifies and settles the reader's EIP-3009 `transferWithAuthorization` on Ink
FR5: After settlement, the API route records the payment on-chain via `recordX402Payment()`
FR6: The Paypink contract verifies USDC tokens are present on-chain before recording an x402 payment
FR7: `recordX402Payment()` checks `IERC20(paymentToken).balanceOf(address(this)) - totalRecorded >= amount` before crediting balances
FR8: The contract's `paymentToken` is set to Circle's native USDC address on Ink
FR9: Creator can withdraw accumulated USDC earnings via `withdrawTokens()`
FR10: Platform owner can withdraw accumulated USDC platform fees via `withdrawPlatformTokenFees()`
FR11: The 99/1 split on USDC payments credits real token balances backed by actual USDC in the contract
FR12: Both ETH and USDC payments write to the same `hasPaid[slugHash][reader]` state
FR13: Reader who paid via the old CDP facilitator retains their `hasPaid` status
FR14: Reader can still pay for articles with ETH via `payForArticle()` (zero regression)
FR15: The x402 API route uses thirdweb's `settlePayment()` for payment verification and settlement
FR16: The x402 API route configures thirdweb's `facilitator()` with a server wallet address and secret key
FR17: The server authenticates with thirdweb via `THIRDWEB_SECRET_KEY` environment variable
FR18: The client identifies the app via `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` environment variable
FR19: Admin can set the payment token address on the contract via `setPaymentToken()`
FR20: `scaffold.config.ts` no longer includes Base Sepolia as a target network
FR21: The frontend no longer imports `baseSepolia` or uses `useSwitchChain` for x402 payments
FR22: The x402-protocol doc reflects thirdweb as the facilitator and Ink as the settlement chain
FR23: The chains doc removes the cross-chain gap section for Base Sepolia
FR24: The payment-rails doc reflects same-chain settlement for the USDC rail
FR25: The ink-facilitator doc reflects that the migration is complete

### NonFunctional Requirements

NFR1: The contract verifies USDC balance before crediting payment — `balanceOf(address(this)) - totalRecorded >= amount` must pass, or the transaction reverts
NFR2: `onlyAuthorizedX402Caller` modifier remains on `recordX402Payment()` — the balance check is defense-in-depth, not a replacement for access control
NFR3: `THIRDWEB_SECRET_KEY` is never exposed client-side — server-only, stored in `.env.local`, never prefixed with `NEXT_PUBLIC_`
NFR4: thirdweb SDK version pinned in `package.json` (exact version, not `^`) to prevent breaking changes in the settlement flow
NFR5: USDC contract address verified against Circle's official documentation before deployment to each environment
NFR6: thirdweb facilitator responds to `/verify` and `/settle` within 10 seconds — on timeout, API route returns 502 with clear error
NFR7: ETH payment rail remains fully independent of thirdweb — if thirdweb is down, ETH payments work with zero degradation
NFR8: No on-chain state migration required — existing `hasPaid` entries from CDP-era payments remain valid
NFR9: thirdweb SDK supports Next.js 15 App Router (server components + route handlers) — verified before implementation

### Additional Requirements

- EIP-3009 support on Ink USDC must be verified as a go/no-go gate before any implementation begins
- Dependency swap: remove `x402-next`, `@x402/client`; add `thirdweb` SDK
- Environment variables: add `THIRDWEB_SECRET_KEY` (server), `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` (client); remove CDP-specific env vars
- Server wallet role shifts from high-trust to low-trust (balance check provides independent verification)
- Existing `hasPaid` entries from CDP-era remain valid — no on-chain state migration
- USDC address on Ink Sepolia: `0xFabab97dCE620294D2B0b0e46C68964e326300Ac`
- CAIP-2 identifiers: Ink Sepolia `eip155:763373`, Ink Mainnet `eip155:57073`
- Base Sepolia dependency fully removed from scaffold.config.ts and frontend imports
- thirdweb SDK version must be pinned (exact, not caret)
- No starter template — this is a brownfield migration on an existing codebase

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 1 | Reader pays USDC without chain switching |
| FR2 | Epic 1 | USDC settles on Ink (same chain as contract) |
| FR3 | Epic 1 | 402 response returns Ink CAIP-2 identifier |
| FR4 | Epic 1 | thirdweb settles EIP-3009 on Ink |
| FR5 | Epic 1 | API route records payment on-chain after settlement |
| FR6 | Epic 2 | Contract verifies USDC presence before recording |
| FR7 | Epic 2 | Balance check: `balanceOf - totalRecorded >= amount` |
| FR8 | Epic 2 | `paymentToken` set to Ink USDC address |
| FR9 | Epic 2 | Creator withdraws USDC earnings |
| FR10 | Epic 2 | Platform owner withdraws USDC fees |
| FR11 | Epic 2 | 99/1 split credits real token balances |
| FR12 | Epic 3 | ETH + USDC share same `hasPaid` state |
| FR13 | Epic 3 | CDP-era `hasPaid` entries remain valid |
| FR14 | Epic 3 | ETH rail works with zero regression |
| FR15 | Epic 1 | API route uses thirdweb `settlePayment()` |
| FR16 | Epic 1 | `facilitator()` configured with server wallet + secret |
| FR17 | Epic 1 | Server authenticates via `THIRDWEB_SECRET_KEY` |
| FR18 | Epic 1 | Client uses `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` |
| FR19 | Epic 2 | Admin sets payment token via `setPaymentToken()` |
| FR20 | Epic 3 | Base Sepolia removed from `scaffold.config.ts` |
| FR21 | Epic 3 | Frontend removes `baseSepolia` imports + `useSwitchChain` |
| FR22 | Epic 4 | x402-protocol doc updated |
| FR23 | Epic 4 | chains doc updated |
| FR24 | Epic 4 | payment-rails doc updated |
| FR25 | Epic 4 | ink-facilitator doc updated |

## Epic List

### Epic 1: Same-Chain USDC Payment for Readers
Readers can pay for articles with USDC on Ink without ever switching chains. One click, one signature, content unlocked.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR15, FR16, FR17, FR18
**NFRs addressed:** NFR3, NFR4, NFR6, NFR9

### Epic 2: Trustless Token Custody & Creator Withdrawals
The contract holds real USDC on Ink. Creators can withdraw actual earnings. Platform owner can withdraw fees. No more phantom balances.
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR19
**NFRs addressed:** NFR1, NFR2, NFR5

### Epic 3: Clean Up Base Sepolia & Frontend Chain-Switching
The codebase is Ink-only. No Base Sepolia references, no chain-switching UI, no confusion. ETH payments continue working with zero regression.
**FRs covered:** FR12, FR13, FR14, FR20, FR21
**NFRs addressed:** NFR7, NFR8

### Epic 4: Documentation Update
All project docs accurately reflect the new single-chain architecture. Future contributors understand the current state.
**FRs covered:** FR22, FR23, FR24, FR25

## Epic 1: Same-Chain USDC Payment for Readers

Readers can pay for articles with USDC on Ink without ever switching chains. One click, one signature, content unlocked.

### Story 1.1: Verify EIP-3009 Support on Ink USDC (Go/No-Go Gate)

As a **developer**,
I want to verify that Circle's native USDC on Ink supports `transferWithAuthorization` (EIP-3009),
So that I have confidence the migration is technically feasible before changing any code.

**Acceptance Criteria:**

**Given** the Ink Sepolia USDC contract at `0xFabab97dCE620294D2B0b0e46C68964e326300Ac`
**When** I inspect the contract ABI on a block explorer or call the function selector
**Then** the `transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)` function exists
**And** the result is documented in the story file as GO or NO-GO

### Story 1.2: Install thirdweb SDK and Configure Environment Variables

As a **developer**,
I want to swap the CDP x402 dependencies for the thirdweb SDK and configure the required environment variables,
So that the project has the correct dependencies and credentials to integrate with thirdweb's facilitator.

**Acceptance Criteria:**

**Given** the current `package.json` includes `x402-next` and/or `@x402/client`
**When** the dependency swap is performed
**Then** `x402-next` and `@x402/client` are removed from `package.json`
**And** `thirdweb` is added with an exact pinned version (no `^`)
**And** `THIRDWEB_SECRET_KEY` is added to `.env.local` (server-only, no `NEXT_PUBLIC_` prefix)
**And** `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` is added to `.env.local`
**And** CDP-specific env vars are removed from `.env.local`
**And** the project builds without errors (`yarn next:build`)

### Story 1.3: Migrate x402 API Route to thirdweb Facilitator

As a **reader**,
I want the x402 API route to use thirdweb's facilitator for payment verification and settlement on Ink,
So that my USDC payment settles on the same chain as the Paypink contract.

**Acceptance Criteria:**

**Given** the x402 API route at `app/api/articles/[slug]/x402/route.ts` (and its helpers)
**When** the route is updated to use thirdweb's `settlePayment()` and `facilitator()` APIs
**Then** the 402 response includes Ink's CAIP-2 network identifier (`eip155:763373` on Sepolia / `eip155:57073` on mainnet)
**And** `facilitator()` is configured with the server wallet address and `THIRDWEB_SECRET_KEY`
**And** after successful settlement, `recordX402Payment()` is called on-chain
**And** on facilitator timeout (>10s), the route returns a 502 with a clear error message
**And** `THIRDWEB_SECRET_KEY` is never exposed in client-side code

### Story 1.4: Verify thirdweb + Next.js 15 App Router Compatibility

As a **developer**,
I want to verify that the thirdweb SDK works correctly in Next.js 15 App Router route handlers,
So that the integration is confirmed working end-to-end before deployment.

**Acceptance Criteria:**

**Given** the migrated x402 API route from Story 1.3
**When** a test request hits the x402 endpoint on a local dev server
**Then** the thirdweb facilitator is reachable and responds correctly
**And** no server component / route handler conflicts exist
**And** the result is documented (PASS/FAIL) in the story file

## Epic 2: Trustless Token Custody & Creator Withdrawals

The contract holds real USDC on Ink. Creators can withdraw actual earnings. Platform owner can withdraw fees. No more phantom balances.

### Story 2.1: Set Payment Token to Ink USDC Address

As an **admin (contract owner)**,
I want to set the contract's `paymentToken` to Circle's native USDC address on Ink,
So that the contract knows which token to verify and custody for USDC payments.

**Acceptance Criteria:**

**Given** the deployed Paypink contract on Ink Sepolia
**When** the owner calls `setPaymentToken()` with `0xFabab97dCE620294D2B0b0e46C68964e326300Ac`
**Then** the contract's `paymentToken` state variable is updated to the Ink USDC address
**And** the address is verified against Circle's official documentation before the transaction
**And** only the contract owner can call `setPaymentToken()` (access control unchanged)

### Story 2.2: Re-enable Balance Check in recordX402Payment

As a **platform operator**,
I want `recordX402Payment()` to verify that real USDC tokens are present in the contract before crediting balances,
So that the system is trustless and no phantom balances can be recorded.

**Acceptance Criteria:**

**Given** `recordX402Payment()` currently has the balance check disabled/commented out
**When** the balance check is re-enabled
**Then** the function verifies `IERC20(paymentToken).balanceOf(address(this)) - totalRecorded >= amount` before crediting
**And** the transaction reverts if the check fails
**And** the `onlyAuthorizedX402Caller` modifier remains as defense-in-depth (not removed)
**And** existing Foundry tests for `recordX402Payment()` pass with the balance check active (MockERC20 provides real balances)

### Story 2.3: Verify Creator USDC Withdrawal End-to-End

As a **creator**,
I want to withdraw my accumulated USDC earnings via `withdrawTokens()`,
So that I receive real USDC tokens in my wallet on Ink.

**Acceptance Criteria:**

**Given** a creator has accumulated USDC earnings from article payments (99/1 split credits real token balances)
**When** the creator calls `withdrawTokens()`
**Then** the creator's USDC balance in the contract decreases to zero
**And** the creator's wallet receives the corresponding USDC amount on Ink
**And** the 99/1 split between creator and platform is correctly reflected in both balances

### Story 2.4: Verify Platform Fee Withdrawal

As a **platform owner**,
I want to withdraw accumulated USDC platform fees via `withdrawPlatformTokenFees()`,
So that platform revenue is accessible as real USDC on Ink.

**Acceptance Criteria:**

**Given** the platform has accumulated USDC fees from article payments (1% of each USDC payment)
**When** the platform owner calls `withdrawPlatformTokenFees()`
**Then** the platform fee balance in the contract decreases to zero
**And** the platform owner's wallet receives the corresponding USDC amount on Ink

## Epic 3: Clean Up Base Sepolia & Frontend Chain-Switching

The codebase is Ink-only. No Base Sepolia references, no chain-switching UI, no confusion. ETH payments continue working with zero regression.

### Story 3.1: Remove Base Sepolia from scaffold.config.ts

As a **developer**,
I want Base Sepolia removed from the target networks configuration,
So that the project no longer references a chain it doesn't use.

**Acceptance Criteria:**

**Given** `scaffold.config.ts` currently includes Base Sepolia in `targetNetworks`
**When** Base Sepolia is removed
**Then** `scaffold.config.ts` only includes Ink Sepolia (and Foundry for local dev)
**And** no other config files reference Base Sepolia chain ID (84532)
**And** the project builds without errors

### Story 3.2: Remove Chain-Switching Logic from Article Reader

As a **reader**,
I want the article reader page to never prompt me to switch chains,
So that my payment experience is seamless on Ink.

**Acceptance Criteria:**

**Given** the article reader page at `app/articles/[slug]/page.tsx`
**When** chain-switching code is removed
**Then** the page no longer imports `baseSepolia` from viem/chains
**And** the page no longer uses `useSwitchChain` for x402 payments
**And** the USDC payment flow works entirely on Ink without any chain-switch prompts
**And** the ETH payment flow (`payForArticle()`) continues working with zero regression

### Story 3.3: Verify Backward Compatibility for Existing Payments

As a **reader who previously paid via CDP**,
I want my existing `hasPaid` status to remain valid,
So that I don't lose access to articles I already purchased.

**Acceptance Criteria:**

**Given** a reader has `hasPaid[slugHash][reader] = true` from a CDP-era USDC payment
**When** the migration is complete
**Then** the reader's `hasPaid` status is unchanged (no on-chain state migration)
**And** both ETH and USDC payments continue writing to the same `hasPaid[slugHash][reader]` state
**And** the article reader correctly checks `hasPaid` regardless of which payment rail was used

## Epic 4: Documentation Update

All project docs accurately reflect the new single-chain architecture. Future contributors understand the current state.

### Story 4.1: Update Project Documentation for thirdweb Migration

As a **developer (or future contributor)**,
I want all project documentation to reflect the completed migration from CDP to thirdweb on Ink,
So that the docs accurately describe the current architecture and payment flows.

**Acceptance Criteria:**

**Given** the following docs exist in the project: x402-protocol, chains, payment-rails, ink-facilitator
**When** the documentation update is performed
**Then** the x402-protocol doc reflects thirdweb as the facilitator and Ink as the settlement chain
**And** the chains doc removes the cross-chain gap section for Base Sepolia
**And** the payment-rails doc reflects same-chain settlement for the USDC rail
**And** the ink-facilitator doc reflects that the migration is complete and the cross-chain workarounds are removed
**And** no references to CDP facilitator, Base Sepolia settlement, or cross-chain hacks remain in active documentation
