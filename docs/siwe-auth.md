# Sign-In with Ethereum (SIWE) in payp.ink

## What is SIWE?

Sign-In with Ethereum (SIWE) lets users authenticate by signing a message with their wallet instead of using passwords. The signed message includes a domain, nonce, and statement that the server verifies.

Spec: https://docs.login.xyz/

## How payp.ink uses it

SIWE is the authentication layer for all write operations (creating articles, publishing) and for gating paid article content. No passwords, no emails — just a wallet signature.

### Stack

| Layer | Library | Role |
|-------|---------|------|
| Frontend provider | `@rainbow-me/rainbowkit-siwe-next-auth` | Wraps RainbowKit to prompt SIWE signature on connect |
| Session management | `next-auth` v4 (JWT strategy) | Issues/verifies JWT tokens, stores wallet address as `token.sub` |
| Signature verification | `viem/siwe` (`verifySiweMessage`, `parseSiweMessage`) | Server-side SIWE message parsing and cryptographic verification |
| Auth helper | `services/auth/getAuthAddress.ts` | Extracts authenticated address from JWT in API routes |

### Flow

```text
1. User clicks "Connect" in RainbowKit
2. RainbowKitSiweNextAuthProvider prompts a SIWE signature
   - Message says: "Sign in to payp.ink"
   - Includes domain, nonce (CSRF token), and chain ID
3. Signed message + signature sent to POST /api/auth/callback/credentials
4. NextAuth CredentialsProvider.authorize() runs:
   a. Parse the SIWE message (parseSiweMessage)
   b. Verify domain matches NEXTAUTH_URL
   c. Verify nonce matches CSRF token
   d. Verify signature on-chain (verifySiweMessage via publicClient)
   e. Return { id: address } on success
5. NextAuth issues a JWT with sub = wallet address
6. Subsequent API requests include the JWT cookie
7. API routes call getAuthAddress(req) to extract the address from the JWT
```

### Key files

- `components/ScaffoldEthAppWithProviders.tsx` — wraps the app in `RainbowKitSiweNextAuthProvider` with `SessionProvider`
- `app/api/auth/[...nextauth]/route.ts` — NextAuth config with SIWE CredentialsProvider
- `services/auth/getAuthAddress.ts` — helper to extract authenticated address from request JWT
- `services/web3/serverClient.ts` — provides the `publicClient` used for signature verification

### Where auth is required

- `POST /api/articles` — creating a draft (must be signed in to associate article with creator)
- `PATCH /api/articles/[slug]/publish` — publishing (verifies caller is the creator)
- `GET /api/articles/[slug]` — reading paid articles (checks `hasPaid` on-chain for the authenticated address)

### Environment variables

- `NEXTAUTH_SECRET` — JWT signing key (required)
- `NEXTAUTH_URL` — app base URL for domain verification (falls back to `VERCEL_URL` in production)

### Session shape

```typescript
session.address  // wallet address (checksummed)
session.user     // { name: address }
```

On the client, access via `useSession()` from `next-auth/react`. The `address` field is available as `session.address`.
