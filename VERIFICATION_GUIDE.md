# Contract Verification Guide (Ink Sepolia / Blockscout)

The built-in `yarn verify` uses Etherscan-style verification and may not work for all chains. For Ink Sepolia (Blockscout explorer), manual verification with `forge verify-contract` is required.

---

## Step 1: Find the correct Solc version

Run a forced build to see which compiler version Forge actually uses:

```bash
forge build --force
```

Look for the compiler version in the output, e.g. `0.8.30`.

Then pin it in `packages/foundry/foundry.toml` under `[profile.default]`:

```toml
[profile.default]
src = 'contracts'
out = 'out'
libs = ['lib', 'node_modules']
solc_version = "0.8.30"       # <-- add this line
```

This ensures the verifier uses the exact same compiler version that produced the deployed bytecode.

## Step 2: Verify the contract

```bash
forge verify-contract \
  --rpc-url https://rpc-gel-sepolia.inkonchain.com \
  --verifier blockscout \
  --verifier-url 'https://explorer-sepolia.inkonchain.com/api/' \
  --compiler-version 0.8.30 \
  <DEPLOYED_ADDRESS> \
  <FileName>.sol:<ContractName>
```

### Concrete example (YourContract on Ink Sepolia)

```bash
forge verify-contract \
  --rpc-url https://rpc-gel-sepolia.inkonchain.com \
  --verifier blockscout \
  --verifier-url 'https://explorer-sepolia.inkonchain.com/api/' \
  --compiler-version 0.8.30 \
  0xf561B745acC1B3D97672f163d453Eb160D9fDB86 \
  YourContract.sol:YourContract
```

---

## Flag breakdown

| Flag | Purpose |
|------|---------|
| `--rpc-url` | RPC endpoint for the target chain (Ink Sepolia here) |
| `--verifier blockscout` | Use Blockscout verification API instead of Etherscan |
| `--verifier-url` | Blockscout API URL for the chain's explorer |
| `--compiler-version` | Must match the exact solc version used to compile (see Step 1) |
| `<address>` | The deployed contract address |
| `<File>.sol:<Contract>` | Source file and contract name, e.g. `YourContract.sol:YourContract` |

---

## Troubleshooting

### "Compiler version mismatch"

The `--compiler-version` must match what Forge used at compile time. Re-run `forge build --force` and check the output, then update both `foundry.toml` (`solc_version`) and the `--compiler-version` flag.

### "Contract not found" or bytecode mismatch

Make sure you are verifying against the same source that was deployed. If you changed the source after deploying, the bytecode won't match. Redeploy or checkout the exact commit used for deployment.

### Constructor arguments

If your contract has constructor arguments, you may need to add `--constructor-args`:

```bash
forge verify-contract \
  --rpc-url https://rpc-gel-sepolia.inkonchain.com \
  --verifier blockscout \
  --verifier-url 'https://explorer-sepolia.inkonchain.com/api/' \
  --compiler-version 0.8.30 \
  --constructor-args $(cast abi-encode "constructor(address)" 0xYourDeployerAddress) \
  <DEPLOYED_ADDRESS> \
  YourContract.sol:YourContract
```

---

## Reference URLs

| Network | RPC | Explorer | Verifier API |
|---------|-----|----------|--------------|
| Ink Sepolia | `https://rpc-gel-sepolia.inkonchain.com` | `https://explorer-sepolia.inkonchain.com` | `https://explorer-sepolia.inkonchain.com/api/` |
| Ink Mainnet | `https://rpc-gel.inkonchain.com` | `https://explorer.inkonchain.com` | `https://explorer.inkonchain.com/api/` |
