# Roadmap

Paypink starts simple — pay-per-article via ETH or USDC — and expands into a full creator monetization platform.

## Current State (v1)

What's live today:

- Article registration with on-chain pricing (USD via Redstone oracle)
- Dual payment rails: ETH on-chain + USDC via x402 protocol
- 99/1 creator/platform split with pull-pattern withdrawal
- Content integrity verification (keccak256 hash on-chain)
- Tipping by address or article slug
- SIWE authentication (no passwords, just wallet signatures)
- Creator dashboard with earnings tracking
- Deployed on Ink Sepolia

## Monetization Stack (v2)

x402 pay-per-view is the base layer. Future monetization methods stack on top:

| Method | Model | Bypass x402? | Use Case |
|--------|-------|--------------|----------|
| **x402** | Pay per view | - | Casual readers, one-off access |
| **Tip** | Voluntary, one-time | No | Support a creator beyond the article price |
| **Access Pass** (ERC-1155) | Pay once, unlimited | Yes | Fans of a specific creator |
| **Superfluid** | Streaming subscription | Yes | Ongoing support, predictable creator income |
| **Revenue Share NFT** | Buy % of future earnings | No | Invest in a creator's success |

### How They Work Together

1. **New reader** pays per article via x402
2. **Likes the creator** and tips on top of x402
3. **Becomes a fan** and buys an Access Pass — skips x402 for that creator
4. **Wants ongoing support** and starts a Superfluid stream
5. **Believes in the creator long-term** and buys a Revenue Share NFT, earning a % of all their income

Access Pass and Superfluid subscriptions are checked before x402 kicks in. If the reader holds a valid pass or has an active stream, content is served without payment.

## Chainlink Integrations

| Integration | Priority | Description |
|-------------|----------|-------------|
| **Price Feeds** | Done | USD pricing via Redstone (Chainlink-compatible). Swap to Chainlink when it launches on Ink. |
| **Automation** | Medium | On-chain cron: auto-withdrawals at balance thresholds, time-locked content, subscription expiry checks. |
| **VRF** | Blocked | "Lucky Read" — 5% chance of payment refund. No Chainlink VRF on Ink yet (available via Gelato). |
| **Functions** | Low | Off-chain verification of creator identity/reputation for trust badges. |
| **CCIP** | Later | Cross-chain payments. Reader on Base pays for content on Ink. |

## v2 Features

### Engagement
- **Paid comments**: Micropayment to comment, revenue to creator
- **Boost/curate**: Readers stake ETH on articles for weighted discovery
- **Proof of readership**: Soulbound NFT badge for readers

### Reader UX
- **Account abstraction** (ERC-4337): Pre-fund a balance, gasless reads
- **Session keys**: Frictionless repeat access without signing every transaction

### Trust & Quality
- **Creator staking**: Stake to be listed, slashable for violations
- **On-chain referrals**: Reader-to-reader referral tracking with % kickback

### Platform
- **Governance token ($PINK)**: Earned by creators (based on earnings) and readers (based on spend). Controls platform fee %, bonus pool allocation, featured creator lists, treasury spending.
- **Multi-chain deployment**: Start on Ink, expand to other L2s via CCIP bridging
- **Upgradeable contracts**: UUPS proxy pattern for contract evolution
- **Farcaster Frames**: Pay for content directly from Farcaster

## Infrastructure Roadmap

- Deploy on Superchain (Optimism ecosystem)
- IPFS/Pinata for decentralized content permanence
- On-chain identity via EAS, Gitcoin Passport, or Worldcoin

## Related Docs

- [Architecture](/docs/architecture) — current system design
- [Payment Rails](/docs/payment-rails) — how payments work today
- [x402 Protocol](/docs/x402-protocol) — the base payment layer
