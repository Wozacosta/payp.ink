# Chains & Networks

Paypink operates across multiple chains depending on the context — local development, testnet, and the payment layer each use different networks.

## Ink L2

[Ink](https://inkonchain.com/) is Kraken's Layer 2, built on the [OP Stack](https://docs.optimism.io/stack/getting-started) (Optimism's modular rollup framework). It's where the Paypink smart contract lives.

**Why Ink?**

- Low gas fees (L2 rollup economics)
- EVM-compatible — same Solidity, same tooling
- Part of the [Superchain](https://www.superchain.eco/) ecosystem (interoperable with other OP Stack chains)
- Backed by Kraken — strong exchange integration potential

| Network | Chain ID | RPC | Explorer |
|---------|----------|-----|----------|
| Ink Sepolia (testnet) | 763373 | `https://rpc-gel-sepolia.inkonchain.com` | [explorer-sepolia.inkonchain.com](https://explorer-sepolia.inkonchain.com) |
| Ink Mainnet | 57073 | `https://rpc-gel.inkonchain.com` | [explorer.inkonchain.com](https://explorer.inkonchain.com) |

Docs: [docs.inkonchain.com](https://docs.inkonchain.com/)

## Base Sepolia

[Base](https://www.base.org/) is Coinbase's L2, also built on the OP Stack. Paypink uses Base Sepolia for one specific purpose: **x402 USDC payments**.

The [x402 facilitator](https://docs.cdp.coinbase.com/x402/docs/welcome) only supports Base (and Base Sepolia for testnet). When a reader pays with USDC via x402, the settlement happens on Base Sepolia — not Ink.

This creates a **cross-chain gap**: the USDC lands on Base, but the payment is recorded on the Paypink contract on Ink. See [x402 Protocol](/docs/x402-protocol) for details on this limitation and future solutions.

| Network | Chain ID | RPC | Explorer |
|---------|----------|-----|----------|
| Base Sepolia | 84532 | `https://sepolia.base.org` | [sepolia.basescan.org](https://sepolia.basescan.org) |
| Base Mainnet | 8453 | `https://mainnet.base.org` | [basescan.org](https://basescan.org) |

Docs: [docs.base.org](https://docs.base.org/)

## Foundry / Anvil (Local Development)

[Anvil](https://book.getfoundry.sh/reference/anvil/) is Foundry's local Ethereum node. It's what runs when you do `yarn chain`. All local development and testing happens here.

```
yarn chain    # starts Anvil on localhost:8545, chain ID 31337
yarn deploy   # deploys Paypink to Anvil
yarn start    # starts the frontend pointing at Anvil
```

Anvil provides:

- Instant block mining (no waiting for confirmations)
- Pre-funded test accounts
- A `MockV3Aggregator` for the price feed (deployed automatically, hardcoded at $2000/ETH)
- Full EVM compatibility with mainnet

## Chain Selection

The app determines which chain to target based on the `NEXT_PUBLIC_TARGET_CHAIN_ID` environment variable:

| Value | Chain | When |
|-------|-------|------|
| `31337` | Foundry (Anvil) | Local development (default in dev mode) |
| `763373` | Ink Sepolia | Testnet deployment |
| `57073` | Ink Mainnet | Production |

This is set in `.env.local`. The frontend's `scaffold.config.ts` also lists target networks — the **first network in the array** is the default chain for wallet connections.

## Oracle Availability by Chain

Not all services are available on all chains. This affects what Paypink can do where:

| Service | Ink Sepolia | Ink Mainnet | Base Sepolia |
|---------|-------------|-------------|--------------|
| Paypink contract | Yes | Planned | No |
| x402 facilitator | No | No | Yes |
| Redstone ETH/USD feed | Yes | Yes | Yes |
| Chainlink price feeds | Coming soon | Coming soon | Yes |
| Chainlink VRF | No | No | Yes |
| Gelato VRF | [Available](https://docs.inkonchain.com/tools/vrf) | Available | N/A |

See [Oracle & Pricing](/docs/oracle-pricing) for details on the oracle evaluation.

## Related Docs

- [Architecture](/docs/architecture) — system overview
- [x402 Protocol](/docs/x402-protocol) — cross-chain payment limitation
- [Oracle & Pricing](/docs/oracle-pricing) — price feed selection per chain
