# Architecture

Paypink is a multi-creator micropaid articles platform built on [Scaffold-ETH 2](https://scaffoldeth.io/). Creators publish articles with on-chain pricing. Readers pay per article. The platform takes a 1% cut; creators keep 99%.

## High-Level Overview

```
Creator                          Reader
  |                                |
  |  1. Write article              |
  |  2. Set price (USD)            |
  |  3. Register on-chain          |
  v                                |
+-----------+                      |
| Supabase  |  (article body)      |
+-----------+                      |
      |                            |
+-----------+                      |
| Paypink   |  (slug, price,       |  4. Request article
| Contract  |   creator, hash)     |  5. Pay (ETH or x402 USDC)
| (Ink L2)  | <--------------------+  6. Read full content
+-----------+
      |
      |  99/1 split
      v
  Creator balance + Platform balance
  (pull-pattern withdrawal)
```

## Stack

| Layer | Technology |
|-------|-----------|
| Smart contracts | Solidity (Foundry) on Ink L2 |
| Frontend | Next.js 15, React, TypeScript, Tailwind + DaisyUI |
| Wallet connection | RainbowKit + Wagmi + Viem |
| Authentication | Sign-In with Ethereum (SIWE) via NextAuth v4 |
| Database | Supabase (Postgres) via Drizzle ORM |
| Payment (ETH) | Direct on-chain `payForArticle()` |
| Payment (stablecoin) | x402 protocol (USDC on Base Sepolia) |
| Price feed | Redstone oracle (ETH/USD) |
| Scaffolding | Scaffold-ETH 2 (Foundry flavor) |

## Data Model

### On-Chain (Paypink Contract)

- **Article registry**: slug hash -> creator address, price (USD, 18 decimals), views, earned, content hash
- **Payment state**: `hasPaid[slugHash][reader]` — shared across both payment rails
- **Balances**: creator ETH balances, creator token balances, platform balances (both ETH and ERC-20)
- **Tip totals**: per-creator tip tracking

### Off-Chain (Supabase)

- **Articles table**: slug, title, body (markdown), creator address, status (draft/published), timestamps
- The app computes `keccak256(body)` and stores the hash on-chain as a content integrity proof (the contract stores it as a `string`, not `bytes32`)

## Payment Rails

Paypink supports two payment paths that converge on the same contract state:

![Dual Payment Rails — ETH + x402 ERC-20](/docs/payment-rails-dataflow.webp)

See [Payment Rails](/docs/payment-rails) for the full deep dive.

## Key Design Decisions

- **Pull over Push**: Payments credit internal balances. Creators and the platform withdraw separately. This prevents a malicious creator contract from blocking reader payments.
- **Immutable articles**: Once registered on-chain, articles cannot be edited. To update content, publish a new article with a new slug.
- **Oracle-agnostic pricing**: The contract accepts any `AggregatorV3Interface` implementation. Currently Redstone; swappable to Chainlink with a single owner call.
- **Content integrity**: The app hashes the article body (`keccak256`) and stores the hash on-chain as a string. Readers can verify the served content matches what the creator published.

## External Resources

- [Scaffold-ETH 2](https://scaffoldeth.io/) — the development toolkit Paypink is built on
- [Scaffold-ETH 2 Docs](https://docs.scaffoldeth.io/) — hooks, components, deployment
- [Ink L2](https://docs.inkonchain.com/) — Kraken's OP Stack L2
- [Foundry Book](https://book.getfoundry.sh/) — Solidity development framework
- [Viem](https://viem.sh/) — TypeScript Ethereum library
- [Wagmi](https://wagmi.sh/) — React hooks for Ethereum
- [RainbowKit](https://www.rainbowkit.com/) — wallet connection UI
- [DaisyUI](https://daisyui.com/) — Tailwind CSS component library
- [Drizzle ORM](https://orm.drizzle.team/) — TypeScript ORM for Postgres

## Related Docs

- [Smart Contracts](/docs/smart-contracts) — contract design, pull-over-push, 99/1 split
- [Payment Rails](/docs/payment-rails) — dual ETH + x402 deep dive
- [Authentication](/docs/authentication) — SIWE flow
- [Oracle & Pricing](/docs/oracle-pricing) — USD pricing, oracle selection
- [x402 Protocol](/docs/x402-protocol) — how x402 works, cross-chain considerations
- [Roadmap](/docs/roadmap) — v2 vision, monetization stack
