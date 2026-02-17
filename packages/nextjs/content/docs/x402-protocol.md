# x402 Protocol

[x402](https://www.x402.org/) is an HTTP-native payment protocol that turns the browser's HTTP 402 ("Payment Required") status code into an actual payment flow — no checkout page, no payment form, just a standard HTTP request that gets paid for automatically.

## How x402 Works

```
1. Reader requests:     GET /api/articles/my-article/x402
2. Server responds:     402 Payment Required
                        + payment requirements (amount, token, payTo address)
3. Reader's client:     Signs and submits payment to x402 facilitator
4. Facilitator:         Settles USDC on-chain (Ink)
5. Request replays:     Original request + payment header (proof of payment)
6. Server responds:     200 OK + article content
```

The key insight: **payment is part of the HTTP request lifecycle**. The reader's client handles the 402 response, pays, and retries — all transparently.

## How Paypink Uses x402

Paypink's x402 content route (`/api/articles/[slug]/x402`) works as follows:

1. The route reads the article's USD price from the on-chain registry
2. It calls `settlePayment()` from the thirdweb SDK, specifying:
   - `payTo`: the Paypink contract address
   - `price`: the article price in USD (e.g. `$0.50`)
   - `network`: Ink (derived from `getServerChainId()` via thirdweb's `defineChain()`)
   - `facilitator`: thirdweb's x402 facilitator (configured with a server wallet address and secret key)
3. If the reader hasn't paid, `settlePayment()` returns a 402 response with payment requirements
4. After x402 settlement (USDC lands in the contract on Ink), the route:
   - Extracts the payer address from the payment receipt
   - Calls `recordX402Payment(slug, reader, amount)` on the Paypink contract via the server wallet
   - The contract verifies the USDC is actually present (`balanceOf - totalRecorded >= amount`) before crediting balances
   - Returns the article content

## Same-Chain Settlement

USDC payment settles on **Ink** — the same chain where the Paypink contract lives. This means:

- The contract can verify real USDC tokens are present before recording a payment
- `withdrawTokens()` transfers real USDC to creators
- No cross-chain trust assumptions are needed
- The `onlyAuthorizedX402Caller` modifier provides defense-in-depth alongside the balance check

## SDK

Paypink uses the [thirdweb SDK](https://portal.thirdweb.com/) for x402 integration:

- **Server**: `settlePayment()` from `thirdweb/x402` handles payment verification and settlement; `facilitator()` configures the facilitator connection
- **Client**: thirdweb's client library handles 402 responses in the browser
- **Facilitator**: [thirdweb's x402 facilitator](https://portal.thirdweb.com/x402) supports 170+ EVM chains including Ink
- **Authentication**: `THIRDWEB_SECRET_KEY` (server-only) and `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` (client)

## Why x402?

- **No accounts**: Readers don't need to sign up or create a subscription
- **Stateless**: Each request is independently paid for
- **HTTP-native**: Works with any HTTP client, not just browsers
- **Micropayment-friendly**: Low-value payments without the overhead of a full checkout flow
- **Composable**: AI agents can pay for content programmatically — the same way a browser does

## External Resources

- [x402.org](https://www.x402.org/) — protocol spec and ecosystem
- [thirdweb x402 Docs](https://portal.thirdweb.com/x402) — facilitator reference
- [x402 GitHub](https://github.com/coinbase/x402) — open-source reference implementation
- [x402 v2 Launch Announcement](https://www.x402.org/writing/x402-v2-launch)
- [x402 From First Principles](https://medium.com/@psudokit/x402-from-first-principles-a-complete-protocol-architecture-security-ai-economy-and-developer-cc1c6ff1034b) — deep-dive on protocol architecture, security, and AI economy

## Related Docs

- [Payment Rails](/docs/payment-rails) — how x402 fits alongside ETH payments
- [Smart Contracts](/docs/smart-contracts) — `recordX402Payment()` internals
- [Architecture](/docs/architecture) — system overview
