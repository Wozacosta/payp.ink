# Chains & Networks

Paypink operates on Ink L2 for all on-chain activity — smart contracts, ETH payments, and USDC settlement via x402.

## Ink L2

[Ink](https://inkonchain.com/) is Kraken's Layer 2, built on the [OP Stack](https://docs.optimism.io/stack/getting-started) (Optimism's modular rollup framework). It's where the Paypink smart contract lives and where all payments settle.

**Why Ink?**

- Low gas fees (L2 rollup economics)
- EVM-compatible — same Solidity, same tooling
- Part of the [Superchain](https://www.superchain.eco/) ecosystem (interoperable with other OP Stack chains)
- Backed by Kraken — strong exchange integration potential
- [Circle deploys native USDC on Ink](https://www.circle.com/multi-chain-usdc/ink) (not bridged) with EIP-3009 support
- [thirdweb's x402 facilitator supports Ink](https://portal.thirdweb.com/x402) — enabling same-chain USDC settlement

| Network | Chain ID | RPC | Explorer |
|---------|----------|-----|----------|
| Ink Sepolia (testnet) | 763373 | `https://rpc-gel-sepolia.inkonchain.com` | [explorer-sepolia.inkonchain.com](https://explorer-sepolia.inkonchain.com) |
| Ink Mainnet | 57073 | `https://rpc-gel.inkonchain.com` | [explorer.inkonchain.com](https://explorer.inkonchain.com) |

CAIP-2 identifiers: `eip155:763373` (Sepolia), `eip155:57073` (Mainnet).

Docs: [docs.inkonchain.com](https://docs.inkonchain.com/)

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
- A `MockERC20` for USDC in token payment tests
- Full EVM compatibility with mainnet

## Chain Selection

The app determines which chain to target based on the `NEXT_PUBLIC_TARGET_CHAIN_ID` environment variable:

| Value | Chain | When |
|-------|-------|------|
| `31337` | Foundry (Anvil) | Local development (default in dev mode) |
| `763373` | Ink Sepolia | Testnet deployment |
| `57073` | Ink Mainnet | Production |

This is set in `.env.local`. The frontend's `scaffold.config.ts` also lists target networks — the **first network in the array** is the default chain for wallet connections. In local dev, `foundry` is first; in production, only `inkSepolia` is listed.

## Oracle Availability by Chain

| Service | Ink Sepolia | Ink Mainnet |
|---------|-------------|-------------|
| Paypink contract | Yes | Planned |
| x402 facilitator (thirdweb) | Yes | Yes |
| USDC (Circle native) | Yes | Yes |
| Redstone ETH/USD feed | Yes | Yes |
| Chainlink price feeds | Coming soon | Coming soon |
| Gelato VRF | [Available](https://docs.inkonchain.com/tools/vrf) | Available |

See [Oracle & Pricing](/docs/oracle-pricing) for details on the oracle evaluation.

## Related Docs

- [Architecture](/docs/architecture) — system overview
- [x402 Protocol](/docs/x402-protocol) — USDC payment via x402
- [Oracle & Pricing](/docs/oracle-pricing) — price feed selection per chain
