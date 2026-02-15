# Oracle Selection for Ink Sepolia (ETH/USD Price Feed)

## Context

Paypink stores article prices in USD (18 decimals) and converts to ETH at payment time using an on-chain price feed. The contract uses `AggregatorV3Interface` (Chainlink-compatible), making it oracle-agnostic — any provider implementing `latestRoundData()` and `decimals()` works.

## Oracles Evaluated (February 2025)

### Chainlink

- **Status on Ink**: "Coming Soon" per [Ink docs](https://docs.inkonchain.com/tools/oracles)
- **Verdict**: Not available. First choice when it launches — most battle-tested, widest adoption.

### API3 (dAPI)

- **Proxy address**: `0x709944a48cAf83535e43471680fDA4905FB3920a` (Ink Sepolia & Mainnet)
- **Status**: Contract has code, but `decimals()` and `read()` both revert. The feed is deployed but unfunded/unactivated.
- **Verdict**: Not usable. Would need API3 to activate the Ink dAPI.

### eOracle

- **Address (Ink Sepolia)**: `0x71bafCA6F2181C16173Dc3FAeF49090e687238D6`
- **Address (Ink Mainnet)**: `0xdFc720E1ef024bfc768ed9E6F0Da0aC09E8fCDA`
- **Test result**: Returned $2,973 when actual ETH price was ~$2,060 — **44% deviation**, and data was stale.
- **Verdict**: Unreliable on Ink Sepolia. Not suitable for production use.

### Redstone (chosen)

- **Address (Ink Sepolia)**: `0xb4fe9028A4D4D8B3d00e52341F2BB0798860532C`
- **Address (Ink Mainnet)**: `0xe5867B1d421f0b52697F16e2ac437e87d66D5fbF`
- **Decimals**: 8 (confirmed via `cast call`)
- **Test result**: Returned $1,997 when actual price was ~$2,060 — **~3% deviation**, data was fresh.
- **Interface**: Implements `AggregatorV3Interface` (`latestRoundData`, `decimals`, etc.)
- **Verdict**: Best available option on Ink. Fresh data, reasonable accuracy, standard interface.

### Pyth

- **Status**: Available on Ink but uses a pull-based model (off-chain price updates pushed by the caller). Requires a different integration pattern — not compatible with `AggregatorV3Interface`.
- **Verdict**: Viable alternative but would require contract redesign. Not chosen for simplicity.

## Decision

**Redstone** is the current oracle for both Ink Sepolia and Ink Mainnet.

The contract is designed to be **oracle-agnostic** via `setPriceFeed(address)` — when Chainlink launches on Ink, we can swap to it with a single owner call (the new feed must implement `AggregatorV3Interface` and return 8 decimals).

## Safeguards

| Protection | Implementation |
|---|---|
| Stale data | `maxStaleness` (default 3600s, configurable 60–86400s) |
| Invalid/negative price | Revert if `answer <= 0` |
| Wrong decimals | Constructor and `setPriceFeed` validate `decimals() == 8` |
| Zero address | Constructor and `setPriceFeed` reject `address(0)` |
| Overpayment | Non-reverting refund; failed refunds go to platform balance |

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PRICE_FEED` | Price feed address for deployment | `0xb4fe9028A4D4D8B3d00e52341F2BB0798860532C` |

When deploying locally (Anvil), if `PRICE_FEED` is not set, a `MockV3Aggregator` is deployed automatically with a $2000 ETH/USD price.
