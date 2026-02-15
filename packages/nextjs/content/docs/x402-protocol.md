# x402 Protocol

[x402](https://www.x402.org/) is an HTTP-native payment protocol developed by [Coinbase](https://docs.cdp.coinbase.com/x402/docs/welcome). It turns the browser's HTTP 402 ("Payment Required") status code into an actual payment flow — no checkout page, no payment form, just a standard HTTP request that gets paid for automatically.

## How x402 Works

```
1. Reader requests:     GET /api/articles/my-article/x402
2. Server responds:     402 Payment Required
                        + payment requirements (amount, token, payTo address)
3. Reader's client:     Signs and submits payment to x402 facilitator
4. Facilitator:         Settles USDC on-chain
5. Request replays:     Original request + X-PAYMENT header (proof of payment)
6. Server responds:     200 OK + article content
```

The key insight: **payment is part of the HTTP request lifecycle**. The reader's client handles the 402 response, pays, and retries — all transparently.

## How Paypink Uses x402

Paypink's x402 content route (`/api/articles/[slug]/x402`) works as follows:

1. The route reads the article's USD price from the on-chain registry
2. The `withX402` middleware wraps the route, specifying:
   - `payTo`: the Paypink contract address
   - `maxAmountRequired`: the article price in USD (2 decimal places)
   - `network`: Base Sepolia (the only chain the facilitator supports — see [x402 network support](https://docs.cdp.coinbase.com/x402/docs/network-support))
3. If the reader hasn't paid, the middleware returns 402
4. After x402 settlement, the route:
   - Decodes the `X-PAYMENT` header to get the payer address and amount
   - Calls `recordX402Payment(slug, reader, amount)` on the Paypink contract via a server wallet
   - Returns the article content

## Cross-Chain Limitation

This is the biggest architectural constraint:

- **x402 facilitator** settles USDC on **Base Sepolia** ([the only supported chain](https://docs.cdp.coinbase.com/x402/docs/network-support))
- **Paypink contract** lives on **Ink Sepolia**
- `recordX402Payment()` runs on Ink but the USDC was received on Base

This means the on-chain balance check in `recordX402Payment` is currently disabled — the contract can't verify USDC balance cross-chain. The `onlyAuthorizedX402Caller` modifier is the primary defense.

### Future Solutions

| Approach | Description |
|----------|-------------|
| Deploy on Base | Move Paypink to Base Sepolia where x402 settles. Simplest fix. |
| [Chainlink CCIP](https://docs.chain.link/ccip) | Cross-chain message from Base to Ink verifying payment. Most robust. |
| Self-hosted facilitator | Run an x402 facilitator that settles on Ink directly. Most flexible. |

## SDK

Paypink uses `x402-next` (Coinbase's official Next.js integration):

- **Server**: `withX402` middleware wraps API routes
- **Client**: The x402 client library handles 402 responses in the browser
- **Facilitator**: Coinbase's public testnet facilitator (no API key needed)

## Why x402?

- **No accounts**: Readers don't need to sign up or create a subscription
- **Stateless**: Each request is independently paid for
- **HTTP-native**: Works with any HTTP client, not just browsers
- **Micropayment-friendly**: Low-value payments without the overhead of a full checkout flow
- **Composable**: AI agents can pay for content programmatically — the same way a browser does

## External Resources

- [x402.org](https://www.x402.org/) — protocol spec and ecosystem
- [x402 Coinbase Developer Docs](https://docs.cdp.coinbase.com/x402/docs/welcome) — SDK reference, network support
- [x402 GitHub](https://github.com/coinbase/x402) — open-source reference implementation
- [x402 v2 Launch Announcement](https://www.x402.org/writing/x402-v2-launch)
- [x402 From First Principles](https://medium.com/@psudokit/x402-from-first-principles-a-complete-protocol-architecture-security-ai-economy-and-developer-cc1c6ff1034b) — deep-dive on protocol architecture, security, and AI economy

## Related Docs

- [Payment Rails](/docs/payment-rails) — how x402 fits alongside ETH payments
- [Smart Contracts](/docs/smart-contracts) — `recordX402Payment()` internals
- [Architecture](/docs/architecture) — system overview
