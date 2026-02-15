# Payment Rails

Paypink supports two payment paths — ETH on-chain and USDC via the x402 protocol. Both converge on the same contract state: `hasPaid`, `views`, `earned`, and creator/platform balances are unified.

![Dual Payment Rails — ETH + x402 ERC-20](/docs/payment-rails-dataflow.webp)

## Rail 1: ETH (Direct On-Chain)

The simplest path. The reader calls `payForArticle(slug)` directly on the Paypink contract, sending ETH equal to the article price (converted from USD via the on-chain price feed).

```
Reader -> payForArticle(slug) {value: ethAmount}
  |
  +-> Price feed converts USD price to ETH
  +-> _splitPayment(): 99% to creatorBalances, 1% to ownerBalance
  +-> hasPaid[slugHash][reader] = true
  +-> article.views++, article.earned += amount
  +-> Overpayment refunded (non-reverting)
```

**Key details:**
- Price conversion happens on-chain using the Redstone ETH/USD price feed
- Overpayment is refunded automatically; if the refund fails (e.g., contract recipient), the excess goes to the platform balance rather than reverting the entire transaction
- The 99/1 split credits internal balances — no ETH is transferred during payment

## Rail 2: x402 (USDC Stablecoin)

The reader requests the article through the x402 content route. The x402 facilitator handles USDC payment negotiation off-chain, then the backend records the payment on-chain.

```
Reader -> GET /api/articles/[slug]/x402
  |
  +-> x402 middleware returns 402 with payment requirements
  |
Reader -> pays USDC via x402 facilitator (Base Sepolia)
  |
  +-> Facilitator settles USDC
  +-> Request replays with X-PAYMENT header
  |
Server -> recordX402Payment(slug, reader, amount)
  |
  +-> onlyAuthorizedX402Caller modifier
  +-> hasPaid[slugHash][reader] = true
  +-> 99/1 token split: creatorTokenBalances / platformTokenBalance
  +-> article.views++, article.earned += amount
```

**Key details:**
- x402 settlement happens on **Base Sepolia** (the only chain the x402 facilitator supports)
- `recordX402Payment()` runs on **Ink Sepolia** — this is a cross-chain gap
- The `onlyAuthorizedX402Caller` modifier is the primary defense against fake recordings
- See [x402 Protocol](/docs/x402-protocol) for more on this cross-chain limitation

## Shared State

Both rails write to the same state:

| State | Shared? | Description |
|-------|---------|-------------|
| `hasPaid[slugHash][reader]` | Yes | Prevents double-payment across rails |
| `article.views` | Yes | Unified view count |
| `article.earned` | Yes | Total earned (ETH + token) |
| `creatorBalances` | ETH only | Pull-pattern ETH withdrawal |
| `creatorTokenBalances` | Token only | Pull-pattern ERC-20 withdrawal |

## Withdrawal (Pull Pattern)

Funds are never pushed to creators during payment. Instead, balances accumulate and creators withdraw at their discretion:

- **ETH**: `withdraw()` — transfers accumulated ETH balance to the creator
- **ERC-20**: `withdrawTokens()` — transfers accumulated USDC (or other payment token) to the creator
- **Platform ETH**: `withdrawPlatformFees()` — owner-only
- **Platform ERC-20**: `withdrawPlatformTokenFees()` — owner-only

This "pull over push" pattern prevents a malicious creator contract from blocking reader payments by reverting on receive.

## Related Docs

- [Smart Contracts](/docs/smart-contracts) — contract internals
- [x402 Protocol](/docs/x402-protocol) — x402 deep dive
- [Oracle & Pricing](/docs/oracle-pricing) — how USD prices convert to ETH
