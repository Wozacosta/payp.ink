# payp.ink — Development Todolist

## Phase 0 — Project Setup

- [x] Scaffold the project with `npx create-eth@latest` — select Foundry as the solidity framework
- [x] Move/merge the generated project into this repo (or re-init here)
- [x] Verify the dev environment works: `yarn chain`, `yarn deploy`, `yarn start`
- [x] Update `foundry.toml` to target Ink L2 (add Ink RPC + chain ID)
- [x] Add Ink to the Scaffold-ETH network config (`scaffold.config.ts`)
- [ ] Set up `.env` files for deployer private key, Ink RPC URL, IPFS/Arweave API keys

## Phase 1 — Smart Contracts

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

## Phase 2 — Storage & Content Integrity

Decision: Article body stored in Postgres (Supabase). `contentHash` on-chain is `keccak256(body)` — purely an integrity proof, not a retrieval pointer.
Paid content served by x402 API route from DB. IPFS/Pinata deferred to a future version for decentralized permanence.
Stack: Drizzle ORM + `postgres` driver + Supabase connection string (same DB for local dev and prod, swap URL in `.env`).

- [ ] Create Supabase project, get connection string (pooler / direct URL)
- [ ] Add `DATABASE_URL` to `.env` (and `.env.example` with placeholder)
- [ ] Install `drizzle-orm`, `drizzle-kit`, `postgres` in `packages/nextjs`
- [ ] Define Drizzle schema — articles table: `slug (PK), title, body, createdAt`
- [ ] Generate and run initial migration with `drizzle-kit`
- [ ] Build Next.js API route (`/api/articles`) — stores article body in DB, returns `keccak256(body)` as content hash
- [ ] Build client-side utility to compute `keccak256` of article body (use viem's `keccak256` + `toHex`) for on-chain registration
- [ ] Build client-side utility to verify content integrity — hash the served content, compare to on-chain `contentHash`

## Phase 3 — Frontend (Next.js)

- [ ] Build Create Article page — form (title, slug, price, markdown body), saves to DB via `/api/articles`, then calls `registerArticle()` on contract with returned hash
- [ ] Build Article Reader page (`/[slug]`) — reads article metadata from contract, fetches content from DB via x402 route, verifies `contentHash`
- [ ] Integrate x402 payment gate — Next.js API route that checks payment before serving content
- [ ] Build Tip component — button on article page, calls `tip()` on contract
- [ ] Build Creator Dashboard — total views, total earned, list of articles + stats (read from contract)
- [ ] Test round-trip: create article → save to DB → register on-chain → pay → read back → verify content hash

## Phase 4 — Polish & Deploy

- [ ] Add wallet connection (Scaffold-ETH handles this, just verify it works on Ink)
- [ ] Test full flow end-to-end on Ink testnet (or Sepolia if no Ink testnet)
- [ ] Deploy contracts to Ink mainnet
- [ ] Deploy frontend to Vercel
- [ ] Wire up production env vars (RPC, contract addresses, storage keys)


## Phase 5 - More

deploy on superchain (https://console.optimism.io/)
use https://attest.org/ / onchain identity (gitcoin / eas/ worldcoin?)
make it upgradeable: https://updraft.cyfrin.io/courses/advanced-foundry
add airdrop?: https://updraft.cyfrin.io/courses/advanced-foundry
imagine a Farcaster Frame that lets someone pay for content via your Ink contracts.
re-entrancy guard: https://solidity-by-example.org/hacks/re-entrancy/
have a receive/fallback function
https://docs.pinata.cloud/files/x402/intro

# Phase 6 - Chainlink

Price Feeds — The bread and butter. If payp.ink ever lets creators set prices in USD but collect in ETH, you need an ETH/USD oracle. One line: AggregatorV3Interface(feedAddress).latestRoundData(). Dead simple, free to read (Chainlink subsidizes it). This is probably the most likely Chainlink service you'd actually use.
CCIP (Cross-Chain Interoperability Protocol) — Lets you send messages and tokens across chains. If payp.ink expands beyond Ink to Base, Arbitrum, etc., CCIP lets a reader on Base pay for content whose creator is on Ink, with the cross-chain settlement handled trustlessly. It's the "Stripe Connect but for L2s" equivalent.
Automation (formerly Keepers) — On-chain cron jobs. A Chainlink node monitors a condition and calls your contract when it's met. Use cases for payp.ink: auto-withdrawals for creators when their balance hits a threshold, time-locked content that unlocks after a date, or subscription expiry checks.
Data Streams — Low-latency pull-based price feeds (sub-second). Overkill for payp.ink unless you build a tipping feature where the tip amount is denominated in USD but paid in ETH and you want tight pricing.
Functions — Run arbitrary JavaScript off-chain, verified by Chainlink's decentralized network. Think of it as a trustless serverless function. Could be interesting for payp.ink to verify external data — like "this creator has 10k followers on X" to assign verification badges, without trusting your own backend.
The realistic priority for payp.ink:

Price Feeds — USD-denominated pricing, pay in ETH. Almost certainly useful.
Automation — Subscription logic, periodic payouts.
VRF — Your "Lucky Read" feature.
Functions — Off-chain verification of creator identity/reputation.
CCIP — Multi-chain expansion (way later).

Start with Price Feeds. It's a 10-line integration and immediately makes the product more usable — nobody wants to figure out how much 0.00032 ETH is in dollars.

## Phase 6.1 - Lucky read (Chainlink's VRF)

"Lucky Read" — probabilistic free access
When a reader pays for content, there's a small chance (say 5%) they get their payment refunded instantly on-chain. The VRF determines the outcome at payment time.
Why this works for payp.ink:

impossible on ink, no vrf support for ink yet https://www.chainlinkecosystem.com/ecosystem/ink

##
