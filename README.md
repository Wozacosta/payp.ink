# Payp.ink

# payp.ink

Multi-creator micropaid articles via x402 on Ink. On-chain tracking, instant payouts, permanent storage, optional tipping.

## Flow

1. Creator writes article, sets price, enters ETH address
2. Article uploaded to permanent storage
3. Article slug + price + creator address + content hash stored on-chain
4. Reader requests article → x402 negotiates payment
5. Contract forwards 99% to creator, 1% to platform
6. Contract increments views/earned for stats
7. Reader can optionally tip creator (same 99/1 split)

## Payment Rails

![Dual Payment Rails — ETH + x402 ERC-20](docs/images/payment-rails-dataflow.png)

Two payment paths, single source of truth:

- **Rail 1 (ETH)**: Reader calls `payForArticle()` directly on-chain. ETH is split 99/1 via `_splitPayment()` into `creatorBalances` / `ownerBalance`. Pull-pattern withdrawal.
- **Rail 2 (x402 ERC-20)**: Thirdweb's x402 facilitator transfers USDC to the contract. Backend (authorized caller) then calls `recordX402Payment()` to record it on-chain. Tokens are split 99/1 into `creatorTokenBalances` / `platformTokenBalance`. Balance check (`balanceOf - totalRecorded >= amount`) prevents fake recordings.

Both rails share the same `hasPaid` mapping, `articles` state (views, earned), and pull-over-push withdrawal pattern.

## Contracts

**Paypink.sol**
- Register article (slug, creator, price, content hash)
- Record payment → 99/1 split using [Pull over Push](https://fravoll.github.io/solidity-patterns/pull_over_push.html) pattern (balances credited on payment, creators/platform withdraw separately). This prevents a malicious creator contract from blocking readers. See also [OpenZeppelin PullPayment](https://docs.openzeppelin.com/contracts/4.x/api/security#PullPayment).
- Track views and earned per article
- Record x402 ERC-20 payments with balance verification
- Dual withdrawal: ETH (`withdraw`) and ERC-20 (`withdrawTokens`)

**Tip.sol**
- Tip any creator by address or article slug
- Immediate 99/1 split
- Track tips per creator

## Data

**On-chain (Ink)**
- Article registry (slug → creator, price, views, earned, contentHash)
- Tip totals per creator

**Permanent storage (TBD)**
- IPFS (needs pinning) or Arweave (via Irys)

**Off-chain**
- Creator metadata

## Stack

- Foundry
- Next.js 14+
- Viem
- x402
- Ink L2

## Monetization Model

### How x402 Fits

x402 is the base layer - stateless, pay-per-view. Every article request goes through x402 payment negotiation. Simple, no accounts needed, reader pays and reads.

But x402 alone has friction for repeat readers. That's where the other layers come in.

### Monetization Stack

| Method | Model | Bypass x402? | Use Case |
|--------|-------|--------------|----------|
| x402 | Pay per view | - | Casual readers, one-off access |
| Tip | Voluntary, one-time | No | Reader wants to support creator beyond article price |
| Access Pass (ERC-1155) | Pay once, unlimited | Yes | Fans of a specific creator |
| Superfluid | Streaming subscription | Yes | Ongoing support, predictable creator income |
| Revenue Share NFT | Buy % of future earnings | No | Invest in a creator's success |

### How They Work Together

1. **New reader** → x402 per article
2. **Likes the creator** → tips on top of x402
3. **Becomes a fan** → buys Access Pass, skips x402 for that creator
4. **Wants ongoing support** → Superfluid stream
5. **Believes in creator long-term** → buys Revenue Share NFT, earns % of all their income

Access Pass and Superfluid subscription are checked before x402 kicks in. If reader holds a valid pass or has an active stream to the creator, content is served without payment negotiation.

Revenue Share and Tips don't bypass anything - they're additive. Revenue Share holders earn from all creator income (x402, tips, passes, subscriptions).

### Platform Cut

All flows take 1% platform fee:
- x402 payments
- Tips
- Access Pass mints
- Superfluid streams (on withdrawal)
- Revenue Share secondary sales

## Todo (v1)

- [ ] Paypink contract
- [ ] Tip contract
- [ ] Storage integration (IPFS or Arweave)
- [ ] Article creation
- [ ] x402 route handler
- [ ] Tip UI
- [ ] Stats dashboard

## v2 Roadmap

### Engagement
- Paid comments (micropayment to comment, revenue to creator)
- Boost/curate articles with ETH (weighted discovery)
- Proof of readership (soulbound NFT badge for readers)

### Creator Monetization
- Access pass (ERC-1155) - pay once, unlimited access to a creator
- Revenue sharing NFT - creator sells % of future earnings
- Superfluid subscription streaming

### Reader UX
- Account abstraction (ERC-4337) - pre-fund balance, gasless reads
- Session keys for frictionless repeat access

### Trust/Quality
- Creator staking - stake to be listed, slashable
- On-chain referral tracking (reader → reader, % kickback)

### Platform
- Chainlink Automation for periodic bonus payouts
- Governance token / DAO for fee decisions
- Multi-chain deployment + bridging

## v2 Deep Dives

### Chainlink Automation

Automated on-chain actions without manual triggers or centralized cron jobs.

**Use Cases**

- **Weekly top creator bonus**: Contract tracks earnings per period. Automation triggers payout to top N creators from a bonus pool funded by platform fees.
- **Inactive creator cleanup**: Flag creators with no activity for X months. Automation removes from featured lists, frees up slugs.
- **Superfluid stream health**: Check if streams are about to run dry, notify or auto-cancel before they fail.
- **Revenue share distributions**: Batch calculate and distribute earnings to NFT holders periodically instead of per-transaction (gas optimization).

**How It Works**

1. Contract implements `AutomationCompatibleInterface`
2. `checkUpkeep()` returns true when action needed
3. Chainlink nodes call `performUpkeep()` to execute
4. Platform funds LINK for automation gas

### DAO / Governance
course here: https://updraft.cyfrin.io/courses/advanced-foundry

Platform decisions controlled by token holders, not the team.

**Governance Token: $PINK**

- Earned by creators (based on earnings)
- Earned by readers (based on spend)
- Optionally purchasable (careful with tokenomics)

**What the DAO Controls**

- Platform fee % (default 1%, can be adjusted)
- Bonus pool allocation
- Featured/curated creator list
- New feature prioritization
- Treasury spending
- Multi-chain expansion decisions

**Structure**

- Governor contract (OpenZeppelin Governor)
- Timelock for execution delay
- Proposal threshold to prevent spam
- Voting period + quorum requirements

**Flow**

1. Token holder creates proposal
2. Voting period (e.g., 7 days)
3. If passed + quorum met → queued in Timelock
4. After delay (e.g., 2 days) → executable by anyone

### Bridging / Multi-chain

Start on Ink, expand to other L2s without fragmenting liquidity or creator identity.

**Why Multi-chain**

- Readers on different chains
- Gas cost varies
- Some creators prefer specific chains
- Redundancy

**Architecture**

**Option A: Canonical on Ink + Mirrors**

- Ink is source of truth for creator registry
- Other chains have read-only mirrors synced via bridge
- Payments on any chain, bridged back to Ink for settlement
- Creator withdraws from Ink only

**Option B: Independent Deployments + Unified Identity**

- Same contracts deployed per chain
- Creator registers once, signature replayed cross-chain
- Earnings tracked per chain
- Creator withdraws per chain

**Option C: Chain Abstraction**

- Single interface for readers
- Backend routes to cheapest/fastest chain
- Settlement aggregated cross-chain
- Most complex, best UX

**Bridge Options**

- Native L2 bridges (slow, secure)
- LayerZero / Hyperlane (fast, more trust assumptions)
- CCIP (Chainlink) - probably best fit given other Chainlink usage

**What Gets Bridged**

- Creator registration (Ink → other chains)
- Payment settlement (other chains → Ink)
- Governance votes (aggregate cross-chain)
- $PINK token (omnichain fungible)

# 🏗 Scaffold-ETH 2

<h4 align="center">
  <a href="https://docs.scaffoldeth.io">Documentation</a> |
  <a href="https://scaffoldeth.io">Website</a>
</h4>

🧪 An open-source, up-to-date toolkit for building decentralized applications (dapps) on the Ethereum blockchain. It's designed to make it easier for developers to create and deploy smart contracts and build user interfaces that interact with those contracts.

> [!NOTE]
> 🤖 Scaffold-ETH 2 is AI-ready! It has everything agents need to build on Ethereum. Check `.agents/`, `.claude/`, `.opencode` or `.cursor/` for more info.

⚙️ Built using NextJS, RainbowKit, Foundry, Wagmi, Viem, and Typescript.

- ✅ **Contract Hot Reload**: Your frontend auto-adapts to your smart contract as you edit it.
- 🪝 **[Custom hooks](https://docs.scaffoldeth.io/hooks/)**: Collection of React hooks wrapper around [wagmi](https://wagmi.sh/) to simplify interactions with smart contracts with typescript autocompletion.
- 🧱 [**Components**](https://docs.scaffoldeth.io/components/): Collection of common web3 components to quickly build your frontend.
- 🔥 **Burner Wallet & Local Faucet**: Quickly test your application with a burner wallet and local faucet.
- 🔐 **Integration with Wallet Providers**: Connect to different wallet providers and interact with the Ethereum network.

![Debug Contracts tab](https://github.com/scaffold-eth/scaffold-eth-2/assets/55535804/b237af0c-5027-4849-a5c1-2e31495cccb1)

## Requirements

Before you begin, you need to install the following tools:

- [Node (>= v20.18.3)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

## Quickstart

To get started with Scaffold-ETH 2, follow the steps below:

1. Install dependencies if it was skipped in CLI:

```
cd my-dapp-example
yarn install
```

2. Run a local network in the first terminal:

```
yarn chain
```

This command starts a local Ethereum network using Foundry. The network runs on your local machine and can be used for testing and development. You can customize the network configuration in `packages/foundry/foundry.toml`.

3. On a second terminal, deploy the test contract:

```
yarn deploy
```

This command deploys a test smart contract to the local network. The contract is located in `packages/foundry/contracts` and can be modified to suit your needs. The `yarn deploy` command uses the deploy script located in `packages/foundry/script` to deploy the contract to the network. You can also customize the deploy script.

4. On a third terminal, start your NextJS app:

```
yarn start
```

Visit your app on: `http://localhost:3000`. You can interact with your smart contract using the `Debug Contracts` page. You can tweak the app config in `packages/nextjs/scaffold.config.ts`.

Run smart contract test with `yarn foundry:test`

- Edit your smart contracts in `packages/foundry/contracts`
- Edit your frontend homepage at `packages/nextjs/app/page.tsx`. For guidance on [routing](https://nextjs.org/docs/app/building-your-application/routing/defining-routes) and configuring [pages/layouts](https://nextjs.org/docs/app/building-your-application/routing/pages-and-layouts) checkout the Next.js documentation.
- Edit your deployment scripts in `packages/foundry/script`


## Documentation

Visit our [docs](https://docs.scaffoldeth.io) to learn how to start building with Scaffold-ETH 2.

To know more about its features, check out our [website](https://scaffoldeth.io).

## Contributing to Scaffold-ETH 2

We welcome contributions to Scaffold-ETH 2!

Please see [CONTRIBUTING.MD](https://github.com/scaffold-eth/scaffold-eth-2/blob/main/CONTRIBUTING.md) for more information and guidelines for contributing to Scaffold-ETH 2.
