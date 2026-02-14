# E2E Test Setup — Status (2026-02-14)

## Architecture: Playwright + Mock EIP-1193 Provider + Anvil

Synpress/MetaMask approach was abandoned due to MetaMask v13 MV3 incompatibility issues.
Replaced with a simpler, faster, CI-friendly approach:

- **Mock EIP-1193 provider** (`mock-provider.js`) injected via `addInitScript` — proxies all RPC calls to local Anvil
- **Programmatic wagmi connect** — bypasses RainbowKit modal entirely via `window.__E2E_CONNECT__()`
- **Programmatic SIWE** — directly calls NextAuth credentials endpoint + synthetic StorageEvent to refresh SessionProvider
- **External request blocking** — all non-localhost requests are aborted (prevents 429 rate limits from third-party RPCs)

### Key Files

| File | Purpose |
|---|---|
| `mock-provider.js` | EIP-1193 provider backed by Anvil (localhost:8545) |
| `fixtures.ts` | Shared test fixtures: mock provider injection, external request blocking, `connectAndSignTo()` |
| `playwright.config.ts` | Playwright config: 60s timeout, 3 workers, Chromium only |
| `tests/connect-wallet.test.ts` | Verify wallet connect + SIWE sign-in |
| `tests/article-flow.test.ts` | Create/read free articles, paid articles, paywall behavior |

### App-Side E2E Helpers

| File | Change |
|---|---|
| `services/web3/wagmiConnectors.tsx` | Swaps to `injectedWallet` when `__E2E_TESTING__` flag is set |
| `services/web3/wagmiConfig.tsx` | Exposes `__WAGMI_CONFIG__` and `__E2E_CONNECT__()` on window in E2E mode |
| `components/ScaffoldEthAppWithProviders.tsx` | Exposes `getSession` as `__GET_SESSION__` on window in E2E mode |
| `scaffold.config.ts` | Foundry first in dev mode (`NODE_ENV !== "production"`) for correct chain targeting |

### How `connectAndSignTo()` Works

1. `page.goto(targetUrl)` — navigate to target page
2. `programmaticConnect()` — calls `__E2E_CONNECT__()`, waits for `wagmi.state.status === "connected"`
3. Verify address visible in RainbowKit header (with retry: up to 3 attempts + reload)
4. `programmaticSiwe()` — builds EIP-4361 message, signs via mock provider, POSTs to NextAuth, dispatches synthetic StorageEvent to refresh SessionProvider

### Key Discoveries

- **NextAuth v4 BroadcastChannel** is NOT the browser's BroadcastChannel — it uses `localStorage.setItem()` + `storage` events, which only fire cross-tab. Fix: dispatch synthetic `StorageEvent` on the same window.
- **RainbowKit ConnectButton.Custom** reads from wagmi's `useAccount` — programmatic `connect()` from wagmi/actions works, but React re-render takes 1-2 seconds.
- **`deployedContracts.ts` must include Paypink on chain 31337** — run `yarn deploy` before E2E tests.
- **`scaffold.config.ts` targetNetworks order matters** — first network is the default. Foundry must be first for local dev/E2E.

### Running Tests

```bash
# Prerequisites: Anvil running (yarn chain), contracts deployed (yarn deploy), Next.js dev server (yarn start)
cd packages/nextjs/e2e
npx playwright test                          # run all tests
npx playwright test --workers=1              # serial execution
npx playwright test --repeat-each=3          # stress test for flakiness
npx playwright test tests/connect-wallet.test.ts  # single test file
```

### CI Considerations

- No browser extension needed — runs in standard Chromium
- Parallel-safe — each test gets its own browser context with isolated mock provider
- Requires Anvil + deployed contracts + Next.js dev server
- External network access not needed (all requests blocked except localhost)
