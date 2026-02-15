# Getting Started

Paypink is a decentralized content publishing platform where creators publish articles with on-chain pricing and readers pay per article. No accounts, no subscriptions — just a wallet.

## For Readers

### 1. Connect Your Wallet

Click the **Connect** button in the top-right corner. Paypink supports any Ethereum-compatible wallet (MetaMask, Coinbase Wallet, WalletConnect, etc.). You'll be asked to sign a message to prove you own the address — this is [SIWE authentication](/docs/authentication), not a transaction.

### 2. Browse Articles

Head to the [Articles](/articles) page to see published content. Each article shows:

- **Title** and **creator address**
- **Price** — free articles are marked as such; paid articles show the USD price

### 3. Read Free Articles

Free articles (price = $0.00) are accessible immediately. Just click through to read.

### 4. Pay for Articles

Paid articles show a paywall with two options:

- **Pay with ETH**: Sends ETH directly to the smart contract. The USD price is converted to ETH using a live on-chain price feed. One transaction, instant access.
- **Pay with USDC**: Uses the [x402 protocol](/docs/x402-protocol) for stablecoin payment. The payment is negotiated automatically — you approve the USDC transfer and the article unlocks.

Once you've paid, the article is unlocked permanently for your address. Come back anytime.

### 5. Tip Creators

Every article has a **Tip** button. Tips are optional and on top of the article price. Enter any amount — 99% goes to the creator, 1% to the platform.

### 6. Verify Content

Every article shows a verification badge. When you publish, the app computes a `keccak256` hash of your article body and stores it on-chain. When a reader opens the article, the app re-hashes the served content and compares it to the on-chain hash — if they match, a green "Verified" badge appears. This proves the content hasn't been tampered with since publication.

## For Creators

### 1. Create an Article

Navigate to the [Create](/create) page. Fill in:

- **Title**: Your article's headline
- **Slug**: The URL-friendly identifier (e.g., `my-first-article` becomes `/articles/my-first-article`)
- **Price**: In USD. Set to $0.00 for free articles.
- **Body**: Write in Markdown. The preview pane shows how it'll render.

### 2. Publish

Publishing is a two-step process:

1. **Save draft**: The article body is stored in the database. A `keccak256` hash of the content is computed.
2. **Register on-chain**: You sign a transaction to register the article on the Paypink smart contract (slug, price, your address, content hash). Once confirmed, the article is live.

If the transaction fails or you reject it, the article stays as a draft. You can retry from the dashboard.

### 3. Track Earnings

The [Dashboard](/dashboard) shows:

- All your published articles with views and earnings
- Your total **ETH balance** (from ETH payments + tips)
- Your total **USDC balance** (from x402 payments)
- **Withdraw** buttons for both ETH and USDC

Withdrawals are pull-based — your earnings accumulate in the smart contract until you withdraw. See [Smart Contracts](/docs/smart-contracts) for why.

## What's Next?

- [Architecture](/docs/architecture) — how the system is designed
- [Payment Rails](/docs/payment-rails) — how payments flow
- [Roadmap](/docs/roadmap) — what's coming next
