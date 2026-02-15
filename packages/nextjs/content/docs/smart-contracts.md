# Smart Contracts

Paypink is powered by a single Solidity contract deployed to Ink L2, built with Foundry.

## Paypink.sol

The core contract. Handles article registration, payments, tipping, and balance management.

### Article Registration

Creators register articles by calling `registerArticle(slug, price, contentHash)`. The caller (`msg.sender`) becomes the article's creator. This stores:

- **Slug hash**: `keccak256(slug)` — the on-chain identifier
- **Creator**: `msg.sender` — receives 99% of all payments
- **Price**: in USD with 18 decimals (e.g., `1e18` = $1.00)
- **Content hash**: a string representing a content-addressable hash (the app layer computes `keccak256(body)` and passes it in as a hex string for integrity verification)

Articles are immutable after registration. To update content, publish a new article with a new slug.

### Payment Split (99/1)

Every payment — whether ETH or ERC-20 — is split:

- **99%** credited to the creator's internal balance
- **1%** credited to the platform's internal balance

The split uses integer math: `creatorShare = amount * 99 / 100`, `platformShare = amount - creatorShare`. This avoids rounding issues where `99 + 1` might not equal `100`.

### Pull Over Push

Balances accumulate internally. No ETH or tokens are transferred during payment. Creators call `withdraw()` or `withdrawTokens()` to claim their earnings.

Why? If a creator's address is a contract that reverts on `receive()`, a push-based split would block all readers from paying. Pull-over-push isolates the withdrawal failure to the creator alone.

References:
- [Pull over Push pattern](https://fravoll.github.io/solidity-patterns/pull_over_push.html) — Solidity design patterns reference
- [OpenZeppelin PullPayment](https://docs.openzeppelin.com/contracts/4.x/api/security#PullPayment) — battle-tested implementation
- [Checks-Effects-Interactions](https://docs.soliditylang.org/en/latest/security-considerations.html#re-entrancy) — Solidity security considerations

### Tipping

Tipping lives in the same contract (not a separate contract). Readers can tip any creator:

- `tipBySlug(slug)` — tip the creator of a specific article
- `tipByAddress(creator)` — tip a creator directly by their address

Tips use the same 99/1 split and pull-over-push withdrawal pattern.

### Access Control

| Function | Who can call |
|----------|-------------|
| `registerArticle` | Anyone (`msg.sender` becomes the creator) |
| `payForArticle` | Anyone (reader) |
| `recordX402Payment` | `authorizedX402Caller` only |
| `tipBySlug` / `tipByAddress` | Anyone |
| `withdraw` / `withdrawTokens` | The creator themselves |
| `withdrawPlatformFees` / `withdrawPlatformTokenFees` | Contract owner |
| `setPaymentToken` / `setAuthorizedX402Caller` / `setPriceFeed` / `setMaxStaleness` | Contract owner |

### Price Feed Integration

The contract uses `AggregatorV3Interface` to convert USD prices to ETH at payment time. See [Oracle & Pricing](/docs/oracle-pricing) for details on oracle selection and safeguards.

### ERC-20 Support

A single payment token (USDC) is configured via `setPaymentToken()`. ERC-20 payments flow through `recordX402Payment()` and use `SafeERC20.safeTransfer` for withdrawals. Multi-token support is planned for v2.

## Deployment

Contracts are deployed via Foundry scripts (`packages/foundry/script/`). After deployment, ABIs are auto-generated to the frontend at `packages/nextjs/contracts/deployedContracts.ts`.

### Current Deployments (Ink Sepolia)

| Contract | Address |
|----------|---------|
| Paypink | `0x781ab3c2bc21faa85683f110dbbcc8e2e26fc0f3` |

## External Resources

- [Foundry Book](https://book.getfoundry.sh/) — the Solidity development framework
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/) — battle-tested Solidity libraries (SafeERC20, IERC20, Ownable)
- [Solidity Patterns](https://fravoll.github.io/solidity-patterns/) — design pattern reference (Pull over Push, Guard Check, etc.)
- [Ink Sepolia Explorer](https://explorer-sepolia.inkonchain.com) — view the deployed contract

## Related Docs

- [Payment Rails](/docs/payment-rails) — how ETH and x402 payments flow
- [Oracle & Pricing](/docs/oracle-pricing) — price feed integration
- [Architecture](/docs/architecture) — system overview
