# payp.ink — Development Todolist

## Phase 0 — Project Setup

- [ ] Scaffold the project with `npx create-eth@latest` — select Foundry as the solidity framework
- [ ] Move/merge the generated project into this repo (or re-init here)
- [ ] Verify the dev environment works: `yarn chain`, `yarn deploy`, `yarn start`
- [ ] Update `foundry.toml` to target Ink L2 (add Ink RPC + chain ID)
- [ ] Add Ink to the Scaffold-ETH network config (`scaffold.config.ts`)
- [ ] Set up `.env` files for deployer private key, Ink RPC URL, IPFS/Arweave API keys

## Phase 1 — Smart Contracts

- [ ] Write `Paypink.sol` — article registry (slug, creator, price, contentHash, views, earned) + 99/1 payment split logic
- [ ] Write unit tests for `Paypink.sol` (`forge test`)
- [ ] Write `Tip.sol` — tipping by creator address or article slug, same 99/1 split
- [ ] Write unit tests for `Tip.sol`
- [ ] Write the deploy script (`Deploy.s.sol` or Scaffold-ETH deploy script)
- [ ] Deploy to local Anvil chain and smoke-test via Scaffold-ETH debug UI

## Phase 2 — Storage

- [ ] Pick IPFS (Pinata/web3.storage) or Arweave (Irys) — set up SDK/client
- [ ] Build a utility function: upload article markdown, return content hash
- [ ] Verify content hash matches what gets stored on-chain

## Phase 3 — Frontend (Next.js)

- [ ] Build Create Article page — form (title, slug, price, markdown body), uploads to IPFS/Arweave, calls `registerArticle()` on contract
- [ ] Build Article Reader page (`/[slug]`) — fetches article metadata from contract, fetches content from IPFS/Arweave
- [ ] Integrate x402 payment gate — Next.js API route that checks payment before serving content
- [ ] Build Tip component — button on article page, calls `tip()` on contract
- [ ] Build Creator Dashboard — total views, total earned, list of articles + stats (read from contract)

## Phase 4 — Polish & Deploy

- [ ] Add wallet connection (Scaffold-ETH handles this, just verify it works on Ink)
- [ ] Test full flow end-to-end on Ink testnet (or Sepolia if no Ink testnet)
- [ ] Deploy contracts to Ink mainnet
- [ ] Deploy frontend to Vercel
- [ ] Wire up production env vars (RPC, contract addresses, storage keys)
