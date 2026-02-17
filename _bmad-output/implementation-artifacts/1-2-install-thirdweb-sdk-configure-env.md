# Story 1.2: Install thirdweb SDK and Configure Environment Variables

Status: done

## Story

As a **developer**,
I want to swap the CDP x402 dependencies for the thirdweb SDK and configure the required environment variables,
So that the project has the correct dependencies and credentials to integrate with thirdweb's facilitator.

## Acceptance Criteria

1. **Given** the current `package.json` includes `x402-next` and/or `@x402/client`
   **When** the dependency swap is performed
   **Then** `x402-next` and `@x402/client` are removed from `package.json`
   **And** `thirdweb` is added with an exact pinned version (no `^`)
   **And** the project builds without errors (`yarn next:build`)

2. **Given** the project needs thirdweb credentials
   **When** environment variables are configured
   **Then** `THIRDWEB_SECRET_KEY` is added to `.env.local` (server-only, no `NEXT_PUBLIC_` prefix)
   **And** `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` is added to `.env.local`
   **And** CDP-specific env vars are identified for removal

3. **Given** the dependency swap is complete
   **When** the build succeeds
   **Then** no import errors exist for removed packages
   **And** thirdweb is importable from `"thirdweb"` and `"thirdweb/x402"`

## Tasks / Subtasks

- [x] Task 1: Remove CDP x402 dependencies (AC: #1)
  - [x] 1.1 Remove `@x402/evm` (currently `^2.3.1`), `@x402/fetch` (currently `^2.3.0`), and `x402-next` (currently `^1.1.0`) from `packages/nextjs/package.json`
  - [x] 1.2 Check for `@x402/core` — the article reader imports `x402Client` from `@x402/core/client` — remove if present
  - [x] 1.3 Run `yarn install` to update lockfile
- [x] Task 2: Install thirdweb SDK with pinned version (AC: #1)
  - [x] 2.1 Run `yarn add thirdweb` in `packages/nextjs`
  - [x] 2.2 After install, edit `package.json` to pin the exact version (remove `^` caret) per NFR4
  - [x] 2.3 Run `yarn install` again to confirm lockfile matches
- [x] Task 3: Update import references to prevent build errors (AC: #1, #3)
  - [x] 3.1 Comment out or stub the `x402-next` import in `app/api/articles/[slug]/x402/route.ts` (the `withX402` call). Do NOT rewrite the route — Story 1.3 handles the full migration
  - [x] 3.2 Comment out or stub the `@x402/core` and `@x402/evm` imports in `app/articles/[slug]/page.tsx` (the `x402Client`, `registerExactEvmScheme`, `wrapFetchWithPayment` calls). Do NOT rewrite the page — Story 3.2 handles frontend cleanup
  - [x] 3.3 Comment out or stub the `x402-next` mock in `app/api/articles/[slug]/x402/__tests__/route.test.ts`
  - [x] 3.4 Verify thirdweb is importable: add a temporary `import { createThirdwebClient } from "thirdweb"` and `import { facilitator } from "thirdweb/x402"` in a test file or the route file
- [x] Task 4: Configure environment variables (AC: #2)
  - [x] 4.1 Add `THIRDWEB_SECRET_KEY=your_thirdweb_secret_key` to `.env.local` (no `NEXT_PUBLIC_` prefix — server-only per NFR3)
  - [x] 4.2 Add `NEXT_PUBLIC_THIRDWEB_CLIENT_ID=your_thirdweb_client_id` to `.env.local`
  - [x] 4.3 Update `.env.example` to document both new variables
  - [x] 4.4 Identify any CDP-specific env vars that should be removed (do NOT remove `SERVER_WALLET_PRIVATE_KEY` — it's still needed for on-chain calls)
- [x] Task 5: Verify build (AC: #1, #3)
  - [x] 5.1 Run `yarn next:build` — must succeed with zero errors
  - [x] 5.2 If build fails on commented-out imports, fix the stubs to satisfy TypeScript

## Dev Notes

### Current CDP Dependencies (packages/nextjs/package.json)

```json
{
  "@x402/evm": "^2.3.1",
  "@x402/fetch": "^2.3.0",
  "x402-next": "^1.1.0"
}
```

The article reader page (`app/articles/[slug]/page.tsx`) also imports:
```typescript
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
```

### thirdweb SDK

- **Package**: `thirdweb` (unified SDK, v5.x)
- **x402 imports**: `import { facilitator, settlePayment } from "thirdweb/x402"`
- **Client**: `import { createThirdwebClient } from "thirdweb"`
- **Chain**: `import { defineChain } from "thirdweb/chains"` (needed for Ink since it's not a built-in chain)
- **NFR4**: Version MUST be pinned with exact version (e.g., `"5.92.1"`, NOT `"^5.92.1"`)

### Stubbing Strategy

This story intentionally stubs/comments broken imports rather than rewriting the route or the page. The reason: Story 1.3 rewrites the API route and Story 3.2 rewrites the article reader page. Doing a full rewrite here would create merge conflicts and duplicated effort.

**Stub pattern for the API route** (`route.ts`):
```typescript
// TODO: Story 1.3 — migrate to thirdweb facilitator
// import { withX402 } from "x402-next";
```

**Stub pattern for the article reader** (`page.tsx`):
```typescript
// TODO: Story 3.2 — remove chain-switching + CDP client
// import { x402Client } from "@x402/core/client";
// import { registerExactEvmScheme } from "@x402/evm/exact/client";
// import { wrapFetchWithPayment } from "@x402/fetch";
```

The stubs must still allow the build to pass — if any function from these imports is called in the code body, stub it with a no-op or throw. The goal is `yarn next:build` succeeds.

### What NOT to Do

- Do NOT rewrite the x402 API route — that's Story 1.3
- Do NOT rewrite the article reader page — that's Story 3.2
- Do NOT remove `SERVER_WALLET_PRIVATE_KEY` — it's still needed for `recordX402Payment()` on-chain calls
- Do NOT add `THIRDWEB_SECRET_KEY` with `NEXT_PUBLIC_` prefix — it's server-only (NFR3)
- Do NOT use caret (`^`) for the thirdweb version — pin exact (NFR4)

### Files to Modify

| File | Change |
|------|--------|
| `packages/nextjs/package.json` | Remove 3 CDP packages, add thirdweb (pinned) |
| `packages/nextjs/app/api/articles/[slug]/x402/route.ts` | Comment out `x402-next` import, stub `withX402` usage |
| `packages/nextjs/app/articles/[slug]/page.tsx` | Comment out `@x402/core`, `@x402/evm`, `@x402/fetch` imports + usage |
| `packages/nextjs/app/api/articles/[slug]/x402/__tests__/route.test.ts` | Comment out `x402-next` mock |
| `packages/nextjs/.env.example` | Add `THIRDWEB_SECRET_KEY`, `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` |
| `packages/nextjs/.env.local` | Add actual values for thirdweb credentials |

### Credential Setup

Get thirdweb credentials from: https://thirdweb.com/create-api-key
- Create an API key in the thirdweb dashboard
- The **Secret Key** goes in `THIRDWEB_SECRET_KEY`
- The **Client ID** goes in `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`

### Previous Story Context

Story 1.1 (done) confirmed:
- EIP-3009 is fully supported on Ink USDC (both Sepolia and Mainnet)
- FiatTokenV2_2 uses `bytes` signature variant (not legacy `v,r,s`)
- Decision: GO — migration is technically feasible

### Project Structure Notes

- Package manager: `yarn` (monorepo with workspaces)
- `packages/nextjs/` is the frontend workspace
- Build command: `yarn next:build` (from root)
- Install command: `yarn install` (from root, hoists dependencies)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] — Acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd.md#NFR3] — THIRDWEB_SECRET_KEY server-only
- [Source: _bmad-output/planning-artifacts/prd.md#NFR4] — thirdweb SDK version pinned
- [Source: packages/nextjs/package.json] — Current CDP dependencies
- [Source: packages/nextjs/app/api/articles/[slug]/x402/route.ts] — Current x402 route using `withX402`
- [Source: packages/nextjs/app/articles/[slug]/page.tsx] — Current CDP client imports

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Initial build failed on ESLint `@typescript-eslint/no-unused-vars` for 8 identifiers left behind by stubbing. Fixed by commenting out unused imports (`baseSepolia`, `useSwitchChain`, `useWalletClient`, `getErrorMessage`) and removing unused destructured variables (`activeChainId`, `walletClient`, `switchChainAsync`). Replaced `useState` for `payingUsdc` with a plain `const payingUsdc = false` to avoid unused setter.
- `@x402/core` was NOT a direct dependency — it was transitive via `@x402/evm`. No removal needed from `package.json`.
- No CDP-specific env vars found to remove (no `CDP_API_KEY` or similar was ever set).
- Task 3.4 (thirdweb import verification): verified locally via temporary imports, then removed — no permanent thirdweb import added since Story 1.3 will introduce the real usage.
- Route test "paid article falls through to x402" describe block removed (2 tests) since the `withX402` wrapper is stubbed out. These tests will be restored in Story 1.3 with the thirdweb facilitator equivalent.

### Completion Notes List

- Removed 3 CDP packages: `@x402/evm`, `@x402/fetch`, `x402-next`
- Installed `thirdweb` at pinned version `5.118.2` (no caret)
- Stubbed all CDP imports with TODO comments referencing the follow-up stories (1.3, 3.2)
- `handlePayUsdc` replaced with a notification stub ("temporarily unavailable during thirdweb migration")
- `x402Handler` stubbed to call `handler` directly (bypasses payment gating — Story 1.3 will wire thirdweb facilitator)
- Added `THIRDWEB_SECRET_KEY` and `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` to `.env.local` and `.env.example`
- Build passes: `yarn next:build` succeeds with zero errors
- Tests pass: 76/76 across 10 test files, zero regressions

### Change Log

- 2026-02-16: Swapped CDP x402 dependencies for thirdweb SDK, stubbed broken imports, configured env vars
- 2026-02-16: Code review fixes — added safety comment on x402Handler stub (H1), removed dead `mockX402Handler` from route test (M3), removed dead `useWalletClient`/`useSwitchChain` mocks from page test (M4), added `yarn.lock` to File List (M1), documented thirdweb import verification (M2)

### File List

- `packages/nextjs/package.json` — Removed `@x402/evm`, `@x402/fetch`, `x402-next`; added `thirdweb: "5.118.2"`
- `packages/nextjs/app/api/articles/[slug]/x402/route.ts` — Commented out `withX402` import, stubbed `x402Handler`, removed `getRouteConfig` import
- `packages/nextjs/app/articles/[slug]/page.tsx` — Commented out `@x402/*` imports, stubbed `handlePayUsdc`, removed unused imports/vars
- `packages/nextjs/app/api/articles/[slug]/x402/__tests__/route.test.ts` — Commented out `x402-next` mock, removed `mockWithX402`, removed "paid article falls through" tests
- `packages/nextjs/app/articles/[slug]/__tests__/page.test.tsx` — Commented out `@x402/*` mocks
- `packages/nextjs/.env.local` — Added `THIRDWEB_SECRET_KEY`, `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`
- `packages/nextjs/.env.example` — Added `THIRDWEB_SECRET_KEY`, `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` with documentation
- `yarn.lock` — Updated after dependency swap (3 removed, 1 added)
