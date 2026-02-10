# Foundry Commands Reference

Complete mapping of all commands from `yarn` through the Makefile down to the underlying Foundry/Cast CLI calls.

---

## Command Flow Diagram

```
yarn <command>
    |
    v
packages/foundry/package.json  (npm scripts)
    |
    +--> make <target>          (Makefile)
    |       |
    |       v
    |     forge / anvil / cast  (Foundry CLI)
    |
    +--> node scripts-js/*.js   (JS helpers)
            |
            v
          make / cast           (spawned from JS)
```

### Deployment Flow (detailed)

```
yarn deploy [--file X] [--network Y] [--keystore Z]
    |
    v
node scripts-js/parseArgs.js
    |  - parses --file, --network, --keystore
    |  - validates network exists in foundry.toml [rpc_endpoints]
    |  - selects/validates keystore (~/.foundry/keystores/)
    |  - blocks default keystore on live networks
    |
    v
make deploy-and-generate-abis
    |
    +---> make deploy
    |       |
    |       v
    |     forge script script/Deploy.s.sol \
    |       --rpc-url <network> --broadcast --ffi \
    |       [--password localhost]                    (if default keystore)
    |
    +---> make generate-abis
            |
            v
          node scripts-js/generateTsAbis.js
            |
            v
          writes packages/nextjs/contracts/deployedContracts.ts
```

---

## Full Command Mapping

### Chain / Local Development

| yarn | package.json script | Makefile target | Underlying command |
|------|--------------------|-----------------|--------------------|
| `yarn chain` | `make chain` | `chain` (depends on `setup-anvil-wallet`) | `anvil` |
| `yarn fork` | `make fork FORK_URL=${1:-mainnet}` | `fork` (depends on `setup-anvil-wallet`) | `anvil --fork-url ${FORK_URL} --chain-id 31337` |

The `setup-anvil-wallet` target runs before both:
```bash
shx rm ~/.foundry/keystores/scaffold-eth-default 2>/dev/null
shx rm -rf broadcast/Deploy.s.sol/31337
cast wallet import \
  --private-key 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6 \
  --unsafe-password 'localhost' \
  scaffold-eth-default
```

### Deployment

| yarn | package.json script | Makefile target | Underlying command |
|------|--------------------|-----------------|--------------------|
| `yarn deploy` | `node scripts-js/parseArgs.js` | `deploy-and-generate-abis` -> `deploy` + `generate-abis` | `forge script script/Deploy.s.sol --rpc-url <network> --broadcast --ffi` |
| `yarn deploy --file DeployYourContract.s.sol` | same | same (with `DEPLOY_SCRIPT=script/DeployYourContract.s.sol`) | `forge script script/DeployYourContract.s.sol --rpc-url <network> --broadcast --ffi` |
| `yarn deploy --network sepolia` | same | same (with `RPC_URL=sepolia`) | `forge script ... --rpc-url sepolia --broadcast --ffi` |

**Deploy Makefile logic:**
- If `RPC_URL=localhost` and keystore is `scaffold-eth-default`: adds `--password localhost`
- If `RPC_URL=localhost` and custom keystore: prompts for password
- If live network: uses `--rpc-url $(RPC_URL)` (keystore password prompted by forge)

### Compilation & Testing

| yarn | package.json script | Makefile target | Underlying command |
|------|--------------------|-----------------|--------------------|
| `yarn compile` | `make compile` | `compile` | `forge compile` |
| `yarn test` | `forge test` | _(direct, no Makefile)_ | `forge test` |
| `yarn foundry:clean` | `forge clean` | _(direct, no Makefile)_ | `forge clean` |
| `yarn flatten` | `make flatten` | `flatten` | `forge flatten` |

### Code Quality

| yarn | package.json script | Makefile target | Underlying command |
|------|--------------------|-----------------|--------------------|
| `yarn foundry:format` | `make format` | `format` | `forge fmt && prettier --write ./scripts-js/**/*.js` |
| `yarn foundry:lint` | `make lint` | `lint` | `forge fmt --check && prettier --check ./scripts-js/**/*.js` |

### Verification

| yarn | package.json script | Makefile target | Underlying command |
|------|--------------------|-----------------|--------------------|
| `yarn verify --network sepolia` | `make verify RPC_URL=${1:-localhost}` | `verify` | `forge script script/VerifyAll.s.sol --ffi --rpc-url $(RPC_URL)` |
| `yarn foundry:deploy-verify` | `make deploy` then `make verify` | `deploy` + `verify` | see deploy + verify above |

### Account Management

| yarn | package.json script | Makefile target | Underlying command |
|------|--------------------|-----------------|--------------------|
| `yarn account` | `make account` | `account` | `node scripts-js/checkAccountBalance.js` (uses `cast wallet address`, ethers.js RPC calls) |
| `yarn generate` | `node scripts-js/generateKeystore.js` | _(JS only)_ | `cast wallet new` then `cast wallet import` |
| `yarn account:import` | `node scripts-js/importAccount.js` | _(JS only)_ | `cast wallet import --interactive <name>` |
| `yarn account:reveal-pk` | `node scripts-js/revealPK.js` | _(JS only)_ | `cast wallet decrypt-keystore <name>` |

---

## Solidity Scripts

All located in `packages/foundry/script/`.

### Deploy.s.sol (main entry point)

Orchestrates all deployments. Called by default when running `yarn deploy` (no `--file` flag).

```solidity
contract DeployScript is ScaffoldETHDeploy {
    function run() external {
        DeployYourContract deployYourContract = new DeployYourContract();
        deployYourContract.run();

        // Add more deployments here:
        // DeployMyContract myContract = new DeployMyContract();
        // myContract.run();
    }
}
```

### DeployYourContract.s.sol

Deploys a single contract. Can be run standalone with `yarn deploy --file DeployYourContract.s.sol`.

```solidity
contract DeployYourContract is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        new YourContract(deployer);
    }
}
```

### DeployHelpers.s.sol

Base contract inherited by all deploy scripts. Provides:

- **`ScaffoldEthDeployerRunner` modifier** - sets up `deployer` address, starts/stops broadcast, exports deployments
- **`deployer` variable** - the deploying address (auto-funded on Anvil with 10,000 ETH)
- **`exportDeployments()`** - writes contract addresses to `deployments/<chainId>.json`
- **`_startBroadcast()`** - starts Forge broadcast, funds deployer on Anvil if balance is 0

```solidity
modifier ScaffoldEthDeployerRunner() {
    deployer = _startBroadcast();      // vm.startBroadcast(), fund on Anvil
    _;
    _stopBroadcast();                  // vm.stopBroadcast()
    exportDeployments();               // write deployments/<chainId>.json
}
```

### VerifyAll.s.sol

Automatically verifies all deployed contracts on Etherscan. Reads `broadcast/Deploy.s.sol/<chainId>/run-latest.json`, finds all CREATE transactions, extracts constructor args from bytecode diff, then calls:

```bash
forge verify-contract <address> <ContractName> \
  --chain <chainId> \
  --constructor-args <encoded-args> \
  --watch
```

---

## JavaScript Helper Scripts

All located in `packages/foundry/scripts-js/`.

### parseArgs.js

**Entry point for `yarn deploy`.** Handles:
1. CLI argument parsing (`--file`, `--network`, `--keystore`, `--help`)
2. Network validation against `foundry.toml` `[rpc_endpoints]`
3. Keystore selection (interactive prompt or `--keystore` flag)
4. Blocks `scaffold-eth-default` keystore on live networks
5. Sets env vars (`DEPLOY_SCRIPT`, `RPC_URL`, `ETH_KEYSTORE_ACCOUNT`) and runs `make deploy-and-generate-abis`

### generateTsAbis.js

**ABI generation for the frontend.** Called by `make generate-abis` after every deploy:
1. Reads all `broadcast/*/chainId/run-*.json` files
2. Tracks deployment history (latest deployment per contract per chain wins)
3. Reads compiled ABIs from `out/`
4. Resolves inherited functions from base contracts
5. Merges with `deployments/<chainId>.json` for name overrides
6. Writes `packages/nextjs/contracts/deployedContracts.ts`

### checkAccountBalance.js

Shows account info: interactive keystore selection, address QR code, balance + nonce on all networks from `foundry.toml`.

### generateKeystore.js

Generates a new wallet (`cast wallet new`), imports it as a named keystore (`cast wallet import`).

### importAccount.js

Imports an existing private key via `cast wallet import --interactive <name>`.

### revealPK.js

Decrypts and displays a keystore's private key via `cast wallet decrypt-keystore <name>`.

### listKeystores.js / selectOrCreateKeystore.js

Shared helpers for interactive keystore listing and selection from `~/.foundry/keystores/`.

---

## Quick Reference

```bash
# Local development
yarn chain                                          # anvil (local node)
yarn fork                                           # anvil --fork-url ...

# Deploy
yarn deploy                                         # deploy all contracts locally
yarn deploy --file DeployYourContract.s.sol         # deploy specific contract
yarn deploy --network sepolia                       # deploy to testnet
yarn deploy --network sepolia --keystore my-key     # deploy with specific keystore

# Build & test
yarn compile                                        # forge compile
yarn test                                           # forge test
yarn flatten                                        # forge flatten

# Code quality
yarn foundry:format                                 # forge fmt + prettier
yarn foundry:lint                                   # forge fmt --check + prettier --check

# Verification
yarn verify --network sepolia                       # verify all via VerifyAll.s.sol

# Account management
yarn account                                        # show balances across networks
yarn generate                                       # create new keystore
yarn account:import                                 # import private key
yarn account:reveal-pk                              # decrypt and show private key
```
