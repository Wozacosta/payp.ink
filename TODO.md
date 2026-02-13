# payp.ink — Development Todolist

## Phase 0 — Project Setup

- [x] Scaffold the project with `npx create-eth@latest` — select Foundry as the solidity framework
- [x] Move/merge the generated project into this repo (or re-init here)
- [x] Verify the dev environment works: `yarn chain`, `yarn deploy`, `yarn start`
- [x] Update `foundry.toml` to target Ink L2 (add Ink RPC + chain ID)
- [x] Add Ink to the Scaffold-ETH network config (`scaffold.config.ts`)
- [ ] Set up `.env` files for deployer private key, Ink RPC URL

## Phase 1 — Smart Contracts (ETH payments)

- [x] Write `Paypink.sol` — article registry (slug, creator, price, contentHash, views, earned) + 99/1 payment split logic
  - Uses "Pull over Push" pattern for the 99/1 split: balances are credited on payment, creators/platform withdraw separately.
    This prevents a malicious creator contract from blocking readers.
    Ref: https://fravoll.github.io/solidity-patterns/pull_over_push.html
    Ref: https://docs.openzeppelin.com/contracts/4.x/api/security#PullPayment
- [x] Write unit tests for `Paypink.sol` (`forge test`)
- [x] Write `Tip.sol` — tipping by creator address or article slug, same 99/1 split
- [x] Write unit tests for `Tip.sol`
- [x] Write the deploy script (`Deploy.s.sol` or Scaffold-ETH deploy script)
- [x] Deploy to local Anvil chain and smoke-test via Scaffold-ETH debug UI

## Phase 1.5 — Enhance Paypink.sol for Dual Payment Rails (ETH + ERC-20 via x402)

Decision: Two payment paths, single source of truth. Readers can pay via on-chain `payForArticle()` (ETH) or via x402 protocol (ERC-20 stablecoins). Both paths converge on the same `Paypink.sol` contract state — `hasPaid`, `views`, `earned`, and creator/platform balances are unified.

x402 settlement: thirdweb's x402 facilitator transfers ERC-20 tokens directly to `Paypink.sol` (the `payTo` address). After settlement, the backend calls `recordX402Payment()` to record the payment on-chain. A balance check (`token.balanceOf(this) - totalRecorded[token] >= amount`) prevents fake recordings.

Articles are immutable after on-chain registration (no `updateContentHash`). If a creator wants to change content, they register a new article with a new slug. V2: add `updateContentHash(slug, newHash)` (creator-only) to support editing.

Ref: https://portal.thirdweb.com/x402
Ref: https://www.x402.org/writing/x402-v2-launch

### Contract changes

- [x] Add single payment token — `address public paymentToken`, set in constructor (USDC on Ink). Owner can update via `setPaymentToken()`. V2: generalize to a multi-token whitelist.
- [x] Add authorized x402 caller — `address public authorizedX402Caller`, changeable by owner via `setAuthorizedX402Caller()`
- [ ] Add ERC-20 balance tracking — `uint256 public totalRecorded` to track how many tokens have been accounted for
- [ ] Add per-creator token balances — `mapping(address creator => uint256) creatorTokenBalances`
- [ ] Add platform token balance — `uint256 public platformTokenBalance`
- [ ] Implement `recordX402Payment(string slug, address reader, uint256 amount)`:
  - Restricted to `authorizedX402Caller` only
  - Balance check: `IERC20(paymentToken).balanceOf(address(this)) - totalRecorded >= amount`
  - Set `hasPaid[slugHash][reader] = true` (revert if already paid)
  - Increment `article.views` and `article.earned`
  - Credit 99/1 split to `creatorTokenBalances` and `platformTokenBalance`
  - Update `totalRecorded += amount`
  - Emit `X402PaymentRecorded` event
- [ ] Implement `withdrawTokens()` — creator withdraws accumulated ERC-20 earnings (pull pattern, same as ETH `withdraw()`)
- [ ] Implement `withdrawPlatformTokenFees()` — owner withdraws platform's ERC-20 share
- [ ] Add new errors: `Paypink__UnauthorizedCaller`, `Paypink__InsufficientTokenBalance`
- [ ] Add new events: `X402PaymentRecorded`, `PaymentTokenUpdated`, `AuthorizedCallerUpdated`

### Tests

- [ ] Unit tests for `recordX402Payment` — happy path, unauthorized caller, insufficient balance, already paid, article not found
- [ ] Unit tests for ERC-20 withdrawals — creator and platform, zero balance, correct amounts
- [ ] Unit tests for admin functions — set payment token, set authorized caller, access control
- [ ] Integration test: simulate full x402 flow — transfer ERC-20 to contract, call `recordX402Payment`, verify state, withdraw
- [ ] Update deploy script if needed

## Phase 2 — Storage & Content Integrity

Decision: Article body stored in Postgres (Supabase). `contentHash` on-chain is `keccak256(body)` — purely an integrity proof, not a retrieval pointer.
IPFS/Pinata deferred to a future version for decentralized permanence.
Stack: Drizzle ORM + `postgres` driver + Supabase connection string (same DB for local dev and prod, swap URL in `.env`).

Articles are immutable after publishing — no editing the body once registered on-chain.

### Database setup

- [ ] Create Supabase project, get connection string (pooler / direct URL)
- [ ] Add `DATABASE_URL` to `.env` (and `.env.example` with placeholder)
- [ ] Install `drizzle-orm`, `drizzle-kit`, `postgres` in `packages/nextjs`
- [ ] Define Drizzle schema — articles table: `slug (PK), title, body, creatorAddress, status (draft/published), createdAt, updatedAt`
- [ ] Generate and run initial migration with `drizzle-kit`

### API routes

- [ ] Build `POST /api/articles` — authenticated via SIWE (Sign-In with Ethereum). Stores article as `draft` in DB, returns `keccak256(body)` as content hash for on-chain registration
- [ ] Build `PATCH /api/articles/[slug]/publish` — flips status from `draft` to `published` after frontend confirms on-chain tx succeeded. Verify caller is the creator.
- [ ] Build `GET /api/articles/[slug]` — serves article body. For paid articles: checks `hasPaid` on-chain before serving. For free articles (price = 0): serves directly.
- [ ] Implement SIWE authentication — wallet signature verification for write endpoints. Use `viem`'s `verifyMessage` or a SIWE library.

### x402 content route

- [ ] Build `GET /api/articles/[slug]/x402` — gated by thirdweb x402 middleware (`settlePayment`). `payTo` = Paypink contract address. After settlement, call `recordX402Payment()` via server wallet.
- [ ] Install thirdweb x402 server SDK (`@x402/server` or equivalent)
- [ ] Configure thirdweb facilitator with server wallet address
- [ ] Add `THIRDWEB_SECRET_KEY` and `SERVER_WALLET_PRIVATE_KEY` to `.env`

### Client-side utilities

- [ ] Build utility to compute `keccak256` of article body (use viem's `keccak256` + `toHex`) for on-chain registration
- [ ] Build utility to verify content integrity — hash the served content, compare to on-chain `contentHash`. Define UX for mismatch (show warning banner, don't block)

## Phase 3 — Frontend (Next.js)

### Create Article page

- [ ] Build form: title, slug, price (ETH), markdown body editor
- [ ] Flow: save to DB as draft (`POST /api/articles`) → get contentHash → call `registerArticle()` on contract → on tx confirmation, call `PATCH /api/articles/[slug]/publish`
- [ ] Handle failure: if wallet tx is rejected or fails, article stays as draft. User can retry the on-chain registration.

### Article Reader page (`/[slug]`)

- [ ] Build preview route (`/[slug]`) — shows article metadata (title, creator, price) from contract, truncated preview or summary, two payment buttons
- [ ] "Pay with ETH" button — calls `payForArticle()` on contract, on success redirects to `/[slug]/full` which fetches from `GET /api/articles/[slug]` (checks `hasPaid` on-chain)
- [ ] "Pay with USDC" button — uses thirdweb's `useFetchWithPayment` hook to fetch from `GET /api/articles/[slug]/x402`. Handles the 402 flow automatically.
- [ ] Render article body as markdown (use `react-markdown` or similar)
- [ ] Content integrity verification — hash the received body, compare to on-chain `contentHash`, show warning if mismatch

### Tip component

- [ ] Tip button on article page — opens a small form with `EtherInput` (Scaffold-ETH component, supports ETH/USD toggle)
- [ ] Calls `tipBySlug()` on contract
- [ ] Show confirmation feedback (toast or inline)

### Creator Dashboard

- [ ] List all creator's articles — merge on-chain data (views, earned, price) with off-chain data (title, status, createdAt) from DB
- [ ] Show total earnings — ETH balance (from `getCreatorBalance`) + token balance (from `creatorTokenBalances`) displayed separately
- [ ] Withdraw buttons — one for ETH (`withdraw()`), one for payment token (`withdrawTokens()`)

### Article discovery

- [ ] Build a simple "recent articles" listing page — query DB for published articles, show title + creator + price. Link to `/[slug]`
- [ ] (Optional) "Browse by creator" page

## Phase 4 — Polish & Deploy

- [ ] Verify wallet connection works on Ink (Scaffold-ETH handles RainbowKit/Wagmi, just test it)
- [ ] Add loading states for all contract interactions (pending tx toasts, skeleton loaders for data fetching)
- [ ] Add error handling for contract reverts, DB failures, network issues — user-facing error messages
- [ ] Test full round-trip on local Anvil: create article → save to DB → register on-chain → pay (ETH path) → read back → verify content hash
- [ ] Test full round-trip on local Anvil: create article → pay (x402 path) → verify `recordX402Payment` state → read back
- [ ] Test withdrawal flows: creator ETH withdrawal, creator ERC-20 withdrawal, platform withdrawals
- [ ] Test on Ink Sepolia testnet (or Sepolia if no Ink testnet available)
- [ ] Deploy contracts to Ink mainnet
- [ ] Deploy frontend to Vercel
- [ ] Wire up production env vars: RPC URLs, contract addresses, `DATABASE_URL`, `THIRDWEB_SECRET_KEY`, `SERVER_WALLET_PRIVATE_KEY`
- [ ] Environment strategy: separate `.env.local` / `.env.production` for Anvil vs Ink Sepolia vs Ink mainnet (different contract addresses, DB URLs, RPC endpoints)

## Phase 5 — Future Enhancements

- [ ] Deploy on Superchain (https://console.optimism.io/)
- [ ] On-chain identity / attestations (https://attest.org/, Gitcoin Passport, EAS, Worldcoin)
- [ ] Make contracts upgradeable (UUPS proxy pattern) — https://updraft.cyfrin.io/courses/advanced-foundry
- [ ] Farcaster Frame for paying for content via Ink contracts
- [ ] Add explicit `ReentrancyGuard` (OpenZeppelin) — belt-and-suspenders on top of existing CEI pattern
- [ ] IPFS/Pinata for decentralized content permanence (store body on IPFS, `contentHash` becomes CID)

## Phase 6 — Chainlink Integrations

Priority order for payp.ink:

### 6.1 — Price Feeds (high priority)
USD-denominated article pricing, paid in ETH. `AggregatorV3Interface(feedAddress).latestRoundData()`. Makes pricing human-readable — nobody wants to guess what 0.00032 ETH means.

### 6.2 — Automation (medium priority)
On-chain cron jobs for: auto-withdrawals when creator balance hits a threshold, time-locked content that unlocks after a date, subscription expiry checks.

### 6.3 — VRF / Lucky Read (blocked)
"Lucky Read" — 5% chance of payment refund on article purchase. Currently impossible on Ink — no VRF support yet.
Ref: https://www.chainlinkecosystem.com/ecosystem/ink

### 6.4 — Functions (low priority)
Trustless off-chain verification of creator identity/reputation (e.g., "this creator has 10k followers on X" for badges).

### 6.5 — CCIP (way later)
Cross-chain payments — reader on Base pays for content whose creator is on Ink. "Stripe Connect but for L2s."

##

https://medium.com/@psudokit/x402-from-first-principles-a-complete-protocol-architecture-security-ai-economy-and-developer-cc1c6ff1034b

https://www.x402.org/writing/x402-v2-launch
https://github.com/coinbase/x402
https://www.x402.org/ecosystem
https://blog.thirdweb.com/changelog/support-for-x402-protocol-v2/
