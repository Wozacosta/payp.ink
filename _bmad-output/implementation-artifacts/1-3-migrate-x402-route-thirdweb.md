# Story 1.3: Migrate x402 API Route to thirdweb Facilitator

Status: done

## Story

As a **reader**,
I want the x402 API route to use thirdweb's facilitator for payment verification and settlement on Ink,
So that my USDC payment settles on the same chain as the Paypink contract.

## Acceptance Criteria

1. **Given** the x402 API route at `app/api/articles/[slug]/x402/route.ts` and `helpers.ts`
   **When** the route is updated to use thirdweb's `settlePayment()` and `facilitator()` APIs
   **Then** the 402 response includes Ink's CAIP-2 network identifier (`eip155:763373` on Sepolia / `eip155:57073` on mainnet)
   **And** `facilitator()` is configured with the server wallet address and `THIRDWEB_SECRET_KEY`

2. **Given** a reader sends a valid USDC payment via the x402 protocol
   **When** thirdweb settles the payment on Ink
   **Then** `recordX402Payment()` is called on-chain after successful settlement

3. **Given** the thirdweb facilitator times out (>10s)
   **When** the API route handles the error
   **Then** the route returns a 502 with a clear error message (NFR6)

4. **Given** the migration is complete
   **When** the code is reviewed
   **Then** `THIRDWEB_SECRET_KEY` is never exposed in client-side code (NFR3)

5. **Given** the existing test file at `__tests__/route.test.ts`
   **When** the tests are updated
   **Then** the tests mock `thirdweb/x402` instead of `x402-next`
   **And** all existing test scenarios still pass (free article bypass, unregistered article 404, paid article delegation, RPC error fallthrough)

## Tasks / Subtasks

- [x] Task 1: Rewrite `helpers.ts` — replace CDP facilitator with thirdweb (AC: #1, #2, #3, #4)
  - [x] 1.1 Replace `getRouteConfig()`: change `network: "base-sepolia"` to Ink chain object via `defineChain()`. Use `NEXT_PUBLIC_TARGET_CHAIN_ID` to pick `763373` (sepolia) or `57073` (mainnet). Keep the existing price formatting logic (wei → 2-decimal USD, min $0.01)
  - [x] 1.2 Create a module-level thirdweb facilitator instance: `facilitator({ client, serverWalletAddress })` using `THIRDWEB_SECRET_KEY` and the server wallet address from `getServerWallet().account.address`
  - [x] 1.3 Rewrite `handler()` to use `settlePayment()`: call `settlePayment({ paymentData, payTo, network, price, facilitator, ... })`. On `result.status === 200`, extract payer info and call `recordX402Payment()` on-chain. On non-200, return the 402/error response from thirdweb
  - [x] 1.4 Add 10-second timeout handling: wrap `settlePayment()` in a try/catch. On timeout or network error, return 502 with `{ error: "Payment settlement timed out" }` (NFR6)
  - [x] 1.5 Remove `decodePaymentHeader()` — thirdweb's `settlePayment` handles payment parsing. The payer address and amount must be extracted from the settlement result or the payment header differently (investigate thirdweb's return type)
  - [x] 1.6 Remove unused imports: `BaseError`, `ContractFunctionRevertedError` (if no longer needed), old `getRouteConfig` signature
- [x] Task 2: Rewrite `route.ts` — remove `withX402` wrapper (AC: #1)
  - [x] 2.1 Remove `import { withX402 } from "x402-next"` and the `x402Handler` constant
  - [x] 2.2 The free article bypass logic (lines 22-52 in current route.ts) stays as-is — it correctly serves free articles without x402
  - [x] 2.3 For paid articles: instead of `return x402Handler(req)`, directly call `settlePayment()` with the article's route config. The `handler()` callback pattern from CDP is replaced by inline settlement + on-chain recording
  - [x] 2.4 Restructure: the route should call `settlePayment()` which handles both the 402 response (no payment header) and the settlement (payment header present). On success, call `recordX402Payment()` and return article content
- [x] Task 3: Update tests (AC: #5)
  - [x] 3.1 Replace `vi.mock("x402-next", ...)` with `vi.mock("thirdweb/x402", ...)` and `vi.mock("thirdweb", ...)`
  - [x] 3.2 Mock `settlePayment` to return `{ status: 402, responseBody: ..., responseHeaders: ... }` for unpaid requests and `{ status: 200 }` for paid requests
  - [x] 3.3 Keep all existing test scenarios: free article bypass (3 tests), unregistered article 404 (1 test), paid article delegation (2 tests)
  - [x] 3.4 Add a new test: facilitator timeout returns 502
  - [x] 3.5 Run `yarn test` to confirm all tests pass

## Dev Notes

### Current Architecture (CDP — being replaced)

**`route.ts`**: Uses `withX402(handler, contractAddress, getRouteConfig)` middleware pattern:
- `withX402` intercepts requests, checks for X-PAYMENT header
- If no header → returns 402 with payment requirements (from `getRouteConfig`)
- If header present → validates payment via CDP facilitator, then calls `handler()`

**`helpers.ts`** exports 3 functions:
- `decodePaymentHeader(req)` — extracts payer address + amount from base64 X-PAYMENT header
- `handler(req)` — called after CDP settlement; reads DB article, calls `recordX402Payment()` on-chain
- `getRouteConfig(req)` — returns `{ price, network, config }` for the 402 response

### Target Architecture (thirdweb)

**`route.ts`**: Direct `settlePayment()` call (no middleware wrapper):
```
GET request → free article check → settlePayment() → {
  status 402: return 402 + payment requirements (thirdweb handles this)
  status 200: call recordX402Payment() → return article content
  error/timeout: return 502
}
```

**`helpers.ts`** exports:
- `OnChainArticle` — type for on-chain article data
- `getInkChain()` — returns `defineChain(763373)` or `defineChain(57073)` based on env
- `thirdwebFacilitator` — module-level facilitator instance
- The `handler()`, `decodePaymentHeader()`, and `getRouteConfig()` functions are removed (settlement is inline in route.ts)

### thirdweb API Reference

```typescript
import { createThirdwebClient } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { facilitator, settlePayment } from "thirdweb/x402";

// Facilitator setup (module-level, reused across requests)
const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
});

const thirdwebFacilitator = facilitator({
  client,
  serverWalletAddress: "0x...", // from getServerWallet()
});

// Per-request settlement
const result = await settlePayment({
  resourceUrl: req.url,
  method: "GET",
  paymentData: req.headers.get("x-payment"),
  payTo: paypinkContract.address,    // contract receives the USDC
  network: defineChain(763373),      // Ink Sepolia
  price: `$${priceUsd}`,            // e.g. "$0.50"
  facilitator: thirdwebFacilitator,
  routeConfig: {
    description: `Access article: ${slug}`,
  },
});

if (result.status === 200) {
  // Payment settled — record on-chain + serve content
} else {
  // Return 402 or error from thirdweb
  return new Response(JSON.stringify(result.responseBody), {
    status: result.status,
    headers: result.responseHeaders,
  });
}
```

### Key Differences from CDP

| Aspect | CDP (`withX402`) | thirdweb (`settlePayment`) |
|--------|-----------------|---------------------------|
| Pattern | Middleware wraps handler | Direct function call in route |
| 402 generation | Automatic by middleware | `settlePayment` returns it in `result` |
| Payment validation | CDP facilitator (Base Sepolia) | thirdweb facilitator (Ink) |
| Network | `"base-sepolia"` string | `defineChain(763373)` chain object |
| Payer extraction | Manual `decodePaymentHeader()` | Investigate: may be in settlement result |
| Settlement chain | Base Sepolia (cross-chain!) | Ink (same chain as contract) |

### `payTo` Address

`settlePayment({ payTo: ... })` — this should be the **Paypink contract address** since thirdweb settles via EIP-3009 `transferWithAuthorization` which sends USDC directly to the specified address. The contract at `0x781ab3c2bc21faa85683f110dbbcc8e2e26fc0f3` (Ink Sepolia) will receive the USDC tokens.

### Payer Address Extraction

After `settlePayment()` returns `status: 200`, you need the **reader's address** and **payment amount** to call `recordX402Payment(slug, reader, amount)`. Options:
1. Parse the `x-payment` header (similar to current `decodePaymentHeader`)
2. Check if thirdweb's settlement result includes payer info
3. Read from the settlement transaction receipt

The developer should investigate thirdweb's return type first. If the payer info isn't in the result, keep a simplified version of `decodePaymentHeader()`.

### Error Handling

```typescript
try {
  const result = await settlePayment({ ... });
  if (result.status === 200) {
    // Success path
  } else {
    // 402 or validation error — pass through
    return new Response(JSON.stringify(result.responseBody), {
      status: result.status,
      headers: result.responseHeaders,
    });
  }
} catch (error) {
  // Network timeout, facilitator unreachable
  console.error("[x402] Settlement error:", error);
  return NextResponse.json(
    { error: "Payment settlement failed" },
    { status: 502 }
  );
}
```

### What NOT to Do

- Do NOT change the free article bypass logic in `route.ts` (lines 22-52) — it works correctly
- Do NOT modify the Paypink contract — that's Epic 2
- Do NOT remove `baseSepolia` from the article reader page — that's Story 3.2
- Do NOT change the price formatting logic (wei → 2-decimal USD) — the current rounding works, Chainlink price feed is Phase 6.1
- Do NOT expose `THIRDWEB_SECRET_KEY` in any client-side code (NFR3)
- Do NOT use `@x402/client` or `@x402/fetch` — those are the old CDP packages removed in Story 1.2
- Do NOT lazy-initialize the facilitator inside request handlers — create it at module level for reuse

### Files to Modify

| File | Change |
|------|--------|
| `packages/nextjs/app/api/articles/[slug]/x402/helpers.ts` | Major rewrite: remove CDP functions, add thirdweb facilitator + settlement helpers |
| `packages/nextjs/app/api/articles/[slug]/x402/route.ts` | Rewrite: remove `withX402`, use `settlePayment()` directly |
| `packages/nextjs/app/api/articles/[slug]/x402/__tests__/route.test.ts` | Update mocks from `x402-next` to `thirdweb/x402`, add timeout test |

### Dependencies

- **Depends on**: Story 1.2 (thirdweb SDK installed, CDP packages removed, env vars configured)
- **Depended on by**: Story 1.4 (compatibility verification uses this migrated route)

### Previous Story Context

Story 1.1 (done): EIP-3009 confirmed GO. FiatTokenV2_2 uses `bytes` signature variant (not legacy `v,r,s`). CAIP-2: `eip155:763373` (Sepolia), `eip155:57073` (Mainnet).

Story 1.2 (ready-for-dev): Stubs CDP imports, installs thirdweb. After 1.2, the build passes but the route is non-functional (stubbed). This story makes it functional again.

### Project Structure Notes

- Test framework: **Vitest** (not Jest) — `vi.mock`, `vi.hoisted`, `vi.fn()`
- Server wallet: `getServerWallet()` from `~~/services/web3/serverWallet`
- Server client: `publicClient`, `paypinkContract` from `~~/services/web3/serverClient`
- Slug hash utility: `~~/services/web3/slugHash` (not needed in API route — `recordX402Payment` takes raw slug string)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3] — Acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd.md#NFR3] — THIRDWEB_SECRET_KEY server-only
- [Source: _bmad-output/planning-artifacts/prd.md#NFR6] — 10s timeout, 502 on failure
- [Source: packages/nextjs/app/api/articles/[slug]/x402/route.ts] — Current CDP route implementation
- [Source: packages/nextjs/app/api/articles/[slug]/x402/helpers.ts] — Current CDP helpers (handler, decodePaymentHeader, getRouteConfig)
- [Source: packages/nextjs/app/api/articles/[slug]/x402/__tests__/route.test.ts] — Current test suite (Vitest)
- [Source: 1-1-verify-eip3009-ink-usdc.md] — EIP-3009 GO decision, bytes variant confirmed
- [Source: 1-2-install-thirdweb-sdk-configure-env.md] — Dependency swap and stubbing

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Investigated thirdweb x402 return types in `node_modules/thirdweb/dist/types/x402/schemas.d.ts` — confirmed `paymentReceipt.payer` (optional string) available on `status === 200`
- Confirmed `defineChain(number)` accepts numeric chain ID from `thirdweb/chains`
- Verified thirdweb SDK v5.118.2 installed by Story 1.2

### Completion Notes List

- **helpers.ts**: Complete rewrite. Removed `handler()`, `decodePaymentHeader()`, `getRouteConfig()`. Added `getInkChain()` (returns `defineChain(763373|57073)` based on env), `getArticlePrice()` (reads on-chain price, formats to USD), module-level `thirdwebFacilitator` (using `THIRDWEB_SECRET_KEY` + server wallet address). Removed imports: `NextRequest`, `NextResponse`, `eq`, `drizzle-orm`, `BaseError`, `ContractFunctionRevertedError`, `getAddress`, `db`, `articles`.
- **route.ts**: Removed `withX402` middleware pattern and `x402Handler` stub. Free article bypass logic preserved unchanged. Paid articles now call `settlePayment()` directly — on `status 200`, extracts payer from `paymentReceipt.payer`, queries DB for article content, calls `recordX402Payment()` on-chain, returns article JSON. On non-200, passes through thirdweb's 402 response. On error/timeout, returns 502 with clear error message (NFR6).
- **route.test.ts**: Replaced `x402-next` mock with `thirdweb/x402` (`settlePayment`, `facilitator`), `thirdweb` (`createThirdwebClient`), `thirdweb/chains` (`defineChain`). Restored paid article tests: 402 when no payment header, 200 + on-chain recording when payment settles. Added new test: 502 on facilitator timeout. Added RPC error fallthrough test. All 80 tests pass across 10 files. Zero lint errors.
- Payer address sourced from `result.paymentReceipt.payer` (thirdweb's `FacilitatorSettleResponse`), eliminating need for manual `decodePaymentHeader()`. Guarded against `undefined` payer with 500 error response.
- **Post-review fixes (Carlos):** (1) Added explicit `THIRDWEB_SECRET_KEY` env var guard at module level — prevents cryptic errors from missing config. (2) Replaced brittle `pathname.split("/").at(-2)` slug extraction with idiomatic Next.js `{ params }` route parameter. (3) Eliminated double RPC call — `getArticle` is now called once, and the price is computed inline from the same result. (4) Exported `OnChainArticle` type from helpers.ts and imported in route.ts — single source of truth. (5) Converted `null` to `undefined` for `paymentData` header (`?? undefined`). (6) Added comment explaining `BigInt(0)` amount argument. (7) Added 3 new tests: payer address missing from receipt (500), AlreadyPaid tolerated (200), non-AlreadyPaid writeContract error (500). Total: 83/83 tests pass.
- **Post-review fixes (adversarial review):** (1) [HIGH] Added `payment-signature` (x402 v2) header support — route now reads `payment-signature ?? x-payment` to support both v1 and v2 clients per thirdweb SDK documentation. (2) [MEDIUM] Removed dead `getArticlePrice()` function from helpers.ts — was exported but never imported; route inlines price calculation from the single RPC call. Removed unused `formatUnits`, `paypinkContract`, `publicClient` imports from helpers.ts. (3) [MEDIUM] Fixed misleading `priceUsd=` log label — renamed to `priceWei=` since the logged value is the raw bigint, not formatted USD. (4) Added new test: v2 `payment-signature` header is accepted and passed to `settlePayment`. Total: 84/84 tests pass, zero lint errors.

### Change Log

- 2026-02-16: Migrated x402 API route from CDP `withX402` middleware to thirdweb `settlePayment()` direct call. Settlement now targets Ink chain via `defineChain()` instead of `"base-sepolia"` string. All 5 acceptance criteria satisfied. 83/83 tests pass. Post-review (Carlos): addressed 2 HIGH and 5 MEDIUM findings.
- 2026-02-16: Adversarial code review — fixed 1 HIGH (v2 header support), 3 MEDIUM (dead code, duplicate logic, misleading log). Added 1 new test. 84/84 tests pass.

### File List

- `packages/nextjs/app/api/articles/[slug]/x402/helpers.ts` — Major rewrite: CDP helpers replaced with thirdweb facilitator + chain helper. Exported `OnChainArticle` type. Added env var guard. Removed dead `getArticlePrice()`.
- `packages/nextjs/app/api/articles/[slug]/x402/route.ts` — Rewrite: removed `withX402` wrapper, inline `settlePayment()` + `recordX402Payment()`. Uses `params` for slug. Single RPC call. Reads both `payment-signature` (v2) and `x-payment` (v1) headers.
- `packages/nextjs/app/api/articles/[slug]/x402/__tests__/route.test.ts` — Updated mocks to thirdweb, restored paid article tests, added timeout/payer-missing/AlreadyPaid/writeContract-error/v2-header tests (84 total).
