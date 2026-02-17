# Testing

Paypink uses a layered testing strategy: Foundry tests for smart contracts, Vitest for frontend unit/component tests, and Playwright for end-to-end browser tests.

## Smart Contract Tests (Foundry)

Solidity tests live in `packages/foundry/test/` and run with [Forge](https://book.getfoundry.sh/reference/forge/forge-test).

```
yarn foundry:test
```

### What's covered

- **Paypink.sol**: article registration, ETH payments, x402 payment recording, 99/1 split math, pull-over-push withdrawals (both ETH and ERC-20), access control, price feed integration, staleness checks, overpayment refunds, fuzz tests for edge cases
- **Tip functions**: tipping by slug, tipping by address, zero-value rejection

### Key patterns

- A `MockV3Aggregator` simulates the price feed in tests (deployed automatically when no `PRICE_FEED` env var is set)
- A `MockERC20` stands in for USDC in ERC-20 payment tests
- Fuzz tests validate bounds on `setMaxStaleness` and payment amounts

## Frontend Unit Tests (Vitest)

Unit and component tests live alongside the code in `__tests__/` directories and run with [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

```
yarn next:test          # single run
yarn next:test:watch    # watch mode
```

### What's covered

| Area | Tests |
|------|-------|
| **Utilities** | `slugHash` (keccak256 correctness), `contentHash` (integrity verification) |
| **API routes** | x402 route — free article bypass, 404 for unregistered articles, paid article x402 handoff |
| **Article Reader** | Loading states, "not found" for zero-address creators, paywall display, wallet/sign-in prompts, auto-fetch for free articles, creator paywall bypass, markdown rendering, integrity warning on hash mismatch, payment button disable during tx |
| **Server config** | `serverClient.ts` and `serverWallet.ts` throw on invalid chain ID or missing private key |

### Stack

- **Vitest** — test runner (fast, native ESM, Vite-based)
- **jsdom** — browser environment simulation (no real browser needed)
- **React Testing Library** — render components, query the DOM, simulate user events
- SE-2 hooks (`useScaffoldReadContract`, etc.) are mocked per test

## E2E Tests (Playwright)

End-to-end tests live in `packages/nextjs/e2e/` and run against a real browser with a local Anvil chain. No MetaMask extension needed — we use a custom mock provider.

```
# Prerequisites: Anvil running, contracts deployed, dev server running
yarn chain        # terminal 1
yarn deploy       # terminal 2
yarn start        # terminal 3

# Run tests
cd packages/nextjs/e2e
npx playwright test
```

### Architecture

We abandoned [Synpress](https://synpress.io/) / MetaMask due to MetaMask v13 MV3 incompatibility. Instead, we built a lighter approach:

```
Playwright Browser
  |
  +-> mock-provider.js (injected via addInitScript)
  |     |
  |     +-> Proxies all RPC calls to local Anvil (localhost:8545)
  |     +-> Signs transactions with a hardcoded test private key
  |     +-> Sets window.__E2E_TESTING__ flag
  |
  +-> Programmatic wagmi connect (window.__E2E_CONNECT__())
  |     |
  |     +-> Bypasses RainbowKit modal entirely
  |     +-> Connects via wagmi's connect() action
  |
  +-> Programmatic SIWE
        |
        +-> Builds EIP-4361 message
        +-> Signs via mock provider
        +-> POSTs to NextAuth credentials endpoint
        +-> Dispatches synthetic StorageEvent to refresh SessionProvider
```

### What's covered

| Test | Description |
|------|-------------|
| Connect wallet + SIWE | Programmatic connect, SIWE sign-in, session verification |
| Create free article | Fill form, publish, view article, content loads |
| Article listing | Create article, verify it appears on /articles |
| Creator paywall bypass | Creator sees their own paid article without paying |
| Paywall display | Paid article shows price badge for unauthenticated reader |
| Pay with ETH | Navigate to paid article, click "Pay ETH", confirm tx, content loads |
| Content integrity | Verify "Verified" badge on article with matching hash |
| Tip by slug | Tip via article page, verify form closes on success |

### Key design decisions

- **No browser extension**: Mock provider is injected via `page.addInitScript()` — runs in standard Chromium
- **External request blocking**: All non-localhost requests are aborted (prevents 429 rate limits from third-party RPCs)
- **Parallel-safe**: Each test gets its own browser context with isolated mock provider
- **CI-friendly**: No MetaMask download, no extension installation, no flaky popup interactions

### Known limitations

- **x402 USDC payment**: Server-side logic tested via Vitest with mocked thirdweb `settlePayment()`. Full end-to-end x402 flow (reader wallet -> facilitator -> on-chain settlement) requires a deployed Ink testnet environment
- **Creator withdrawal**: Not yet implemented in E2E (contract interaction works, UI flow untested)

## Running all tests

```
yarn test           # Foundry + Vitest (no browser needed)
yarn e2e            # Playwright E2E (requires Anvil + dev server)
```
