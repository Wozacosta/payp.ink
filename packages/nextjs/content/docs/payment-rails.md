# Payment Rails

Paypink supports two payment paths — ETH on-chain and USDC via the x402 protocol. Both settle on Ink and converge on the same contract state: `hasPaid`, `views`, `earned`, and creator/platform balances are unified.

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

The reader requests the article through the x402 content route. The thirdweb x402 facilitator handles USDC payment settlement on Ink, then the backend records the payment on-chain.

```
Reader -> GET /api/articles/[slug]/x402
  |
  +-> settlePayment() returns 402 with payment requirements
  |
Reader -> pays USDC via thirdweb x402 facilitator (Ink)
  |
  +-> Facilitator settles USDC into the Paypink contract on Ink
  +-> Request replays with payment header
  |
Server -> recordX402Payment(slug, reader, amount)
  |
  +-> onlyAuthorizedX402Caller modifier
  +-> Balance check: balanceOf(this) - totalRecorded >= amount
  +-> hasPaid[slugHash][reader] = true
  +-> 99/1 token split: creatorTokenBalances / platformTokenBalance
  +-> totalRecorded += amount
  +-> article.views++, article.earned += amount
```

**Key details:**
- x402 settlement happens on **Ink** — the same chain as the Paypink contract
- The facilitator settles USDC into the contract (using EIP-3009 `transferWithAuthorization` under the hood)
- `recordX402Payment()` verifies real USDC tokens are present before crediting balances (`balanceOf - totalRecorded >= amount`)
- The `onlyAuthorizedX402Caller` modifier provides defense-in-depth alongside the balance check
- See [x402 Protocol](/docs/x402-protocol) for more on the thirdweb integration

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
- **ERC-20**: `withdrawTokens()` — transfers accumulated USDC to the creator (real tokens on Ink)
- **Platform ETH**: `withdrawPlatformFees()` — owner-only
- **Platform ERC-20**: `withdrawPlatformTokenFees()` — owner-only

This "pull over push" pattern prevents a malicious creator contract from blocking reader payments by reverting on receive.

## Related Docs

- [Smart Contracts](/docs/smart-contracts) — contract internals
- [x402 Protocol](/docs/x402-protocol) — x402 deep dive
- [Oracle & Pricing](/docs/oracle-pricing) — how USD prices convert to ETH
