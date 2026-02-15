# Authentication (SIWE)

Paypink uses Sign-In with Ethereum (SIWE) for authentication. No passwords, no emails — users sign a message with their wallet to prove ownership of their address.

## What is SIWE?

[Sign-In with Ethereum](https://docs.login.xyz/) is a standard ([EIP-4361](https://eips.ethereum.org/EIPS/eip-4361)) that lets users authenticate to web applications by signing a structured message with their Ethereum wallet. The server verifies the signature cryptographically — no third-party auth provider needed.

## How It Works in Paypink

```
1. User clicks "Connect" in the wallet button
2. RainbowKit prompts a SIWE signature
   - Message: "Sign in to payp.ink"
   - Includes: domain, nonce (CSRF token), chain ID
3. Signed message sent to NextAuth credentials endpoint
4. Server verifies:
   a. Parse the SIWE message
   b. Verify domain matches the app URL
   c. Verify nonce matches CSRF token
   d. Verify signature cryptographically (viem)
   e. Return the wallet address on success
5. NextAuth issues a JWT with the wallet address
6. Subsequent API requests include the JWT cookie
7. API routes extract the address from the JWT
```

## Stack

| Layer | Library | Role |
|-------|---------|------|
| Frontend | `@rainbow-me/rainbowkit-siwe-next-auth` | Prompts SIWE signature on wallet connect |
| Session | `next-auth` v4 (JWT strategy) | Issues and verifies JWT tokens |
| Verification | `viem/siwe` | Parses and verifies SIWE messages server-side |

## Where Auth Is Required

| Endpoint | Why |
|----------|-----|
| `POST /api/articles` | Creating a draft — associates article with creator address |
| `PATCH /api/articles/[slug]/publish` | Publishing — verifies caller is the article's creator |
| `GET /api/articles/[slug]` | Reading paid articles — checks `hasPaid` on-chain for the authenticated address |

Public endpoints (article listing, free articles) don't require authentication.

## Session Shape

```typescript
session.address  // wallet address (checksummed)
session.user     // { name: address }
```

On the client, access via `useSession()` from `next-auth/react`.

## Why SIWE?

- **No accounts to manage**: The wallet IS the account
- **Cryptographic proof**: The server never stores passwords — it verifies signatures
- **Decentralized**: No dependency on Google, GitHub, or any OAuth provider
- **Native to web3**: Users already have wallets; SIWE is the natural auth layer

## External Resources

- [SIWE Spec (EIP-4361)](https://eips.ethereum.org/EIPS/eip-4361) — the formal standard
- [SIWE Documentation](https://docs.login.xyz/) — implementation guide
- [RainbowKit SIWE](https://www.rainbowkit.com/docs/authentication) — RainbowKit authentication integration
- [NextAuth.js](https://next-auth.js.org/) — session management framework
- [viem SIWE utilities](https://viem.sh/docs/siwe/utilities/verifySiweMessage) — `verifySiweMessage` and `parseSiweMessage`

## Related Docs

- [Architecture](/docs/architecture) — system overview
- [Getting Started](/docs/getting-started) — user guide
