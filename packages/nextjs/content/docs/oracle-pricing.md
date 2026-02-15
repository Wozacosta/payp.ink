# Oracle & Pricing

Paypink stores article prices in **USD** (18 decimals on-chain) and converts to ETH at payment time using an on-chain price feed. This makes pricing human-readable — creators set "$2.00", not "0.00073 ETH".

## How It Works

1. Creator sets price in USD (e.g., $1.50)
2. Price stored on-chain as `1.5e18` (18 decimal USD)
3. When a reader pays with ETH, the contract:
   - Reads the current ETH/USD price from the oracle
   - Calculates `ethRequired = (priceUSD * 1e8) / ethUsdPrice`
   - Verifies the reader sent enough ETH
   - Refunds any overpayment

The contract uses `AggregatorV3Interface` — the standard interface implemented by Chainlink, Redstone, and other oracle providers. This makes the oracle swappable with a single owner call to `setPriceFeed(address)`.

## Oracle Selection

We evaluated four oracle providers on Ink Sepolia (February 2026):

| Oracle | Status | Result |
|--------|--------|--------|
| **Chainlink** | "Coming Soon" on Ink | Not available yet |
| **API3** | Contract deployed but inactive | `decimals()` and `read()` revert |
| **eOracle** | Deployed | Returned $2,973 when ETH was ~$2,060 (44% off, stale data) |
| **Redstone** | Deployed and active | Returned $1,997 when ETH was ~$2,060 (~3% deviation, fresh) |

**Decision**: Redstone is the current oracle. When Chainlink launches on Ink, we can swap to it without any contract changes.

### Redstone Addresses

| Network | Address |
|---------|---------|
| Ink Sepolia | `0xb4fe9028A4D4D8B3d00e52341F2BB0798860532C` |
| Ink Mainnet | `0xe5867B1d421f0b52697F16e2ac437e87d66D5fbF` |

## Safeguards

The contract protects against bad oracle data:

| Protection | How |
|---|---|
| **Stale data** | `maxStaleness` check (default 3600s, configurable 60-86400s). Reverts if the price feed hasn't updated recently. |
| **Invalid price** | Reverts if `answer <= 0` |
| **Wrong decimals** | Constructor and `setPriceFeed` validate `decimals() == 8` |
| **Zero address** | Constructor and `setPriceFeed` reject `address(0)` |
| **Overpayment** | Non-reverting refund to reader; if refund fails, excess goes to platform balance |

## For x402 Payments

x402 payments are denominated in USDC (already USD). The price feed is only used for ETH payments — when a reader pays with USDC via x402, the USD price is used directly (formatted to 2 decimal places, minimum $0.01).

## External Resources

- [Chainlink Price Feeds](https://docs.chain.link/data-feeds/price-feeds) — the industry standard (coming to Ink)
- [Redstone Oracles](https://docs.redstone.finance/) — the oracle Paypink currently uses
- [AggregatorV3Interface](https://docs.chain.link/data-feeds/api-reference#aggregatorv3interface) — the interface all our oracles implement
- [Ink Oracles](https://docs.inkonchain.com/tools/oracles) — oracle availability on Ink
- [OpenZeppelin SafeERC20](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#SafeERC20) — safe token transfer library used in withdrawals

## Related Docs

- [Smart Contracts](/docs/smart-contracts) — contract design
- [Payment Rails](/docs/payment-rails) — ETH vs x402 payment flow
- [x402 Protocol](/docs/x402-protocol) — stablecoin payment path
