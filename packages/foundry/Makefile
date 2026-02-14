.PHONY: build deploy generate-abis get-address account chain compile flatten fork format lint test verify

DEPLOY_SCRIPT ?= script/Deploy.s.sol

# setup wallet for anvil
setup-anvil-wallet:
	shx rm ~/.foundry/keystores/scaffold-eth-default 2>/dev/null || true; 	shx rm -rf broadcast/Deploy.s.sol/31337
	cast wallet import --private-key 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6 --unsafe-password 'localhost' scaffold-eth-default

# Start local chain
chain: setup-anvil-wallet
	anvil

# Start a fork
fork: setup-anvil-wallet
	anvil --fork-url ${FORK_URL} --chain-id 31337

# Deploy the contracts
deploy:
	@if [ ! -f "$(DEPLOY_SCRIPT)" ]; then 		echo "Error: Deploy script '$(DEPLOY_SCRIPT)' not found"; 		exit 1; 	fi
	@if [ "$(RPC_URL)" = "localhost" ]; then 		if [ "$(ETH_KEYSTORE_ACCOUNT)" = "scaffold-eth-default" ]; then 			forge script $(DEPLOY_SCRIPT) --rpc-url localhost --password localhost --broadcast --ffi; 		else 			forge script $(DEPLOY_SCRIPT) --rpc-url localhost --broadcast --ffi; 		fi 	else 		forge script $(DEPLOY_SCRIPT) --rpc-url $(RPC_URL) --broadcast --ffi; 	fi

# Deploy and generate ABIs
deploy-and-generate-abis: deploy generate-abis

# Generate TypeScript ABIs
generate-abis:
	node scripts-js/generateTsAbis.js

# List account
account:
	@node scripts-js/checkAccountBalance.js

# Get address of a keystore
get-address:
	@cast wallet address --account $(ACCOUNT_NAME)

# Compile contracts
compile:
	forge compile

# Flatten contracts
flatten:
	forge flatten

# Format code
format:
	forge fmt && prettier --write ./scripts-js/**/*.js

# Lint code
lint:
	forge fmt --check && prettier --check ./scripts-js/**/*.js

# Run tests
test:
	forge test

# Verify contracts
verify:
	forge script script/VerifyAll.s.sol --ffi --rpc-url $(RPC_URL)

# Ink Sepolia verification via Blockscout
INK_SEPOLIA_RPC = https://rpc-gel-sepolia.inkonchain.com
INK_SEPOLIA_EXPLORER = https://explorer-sepolia.inkonchain.com/api/
# Extract deployed contract address by chain ID and name from deployedContracts.ts
# Usage: $(call get-addr,763373,Paypink)
define get-addr
$(shell node -p "const fs=require('fs');const src=fs.readFileSync('../nextjs/contracts/deployedContracts.ts','utf8');const m=src.match(new RegExp('$(1):[\\\\s\\\\S]*?$(2):[\\\\s\\\\S]*?address:\\\\s*\"(0x[A-Fa-f0-9]+)\"'));m?m[1]:'NOT_FOUND'")
endef

verify-ink-sepolia: verify-ink-sepolia-paypink verify-ink-sepolia-yourcontract

verify-ink-sepolia-paypink:
	forge verify-contract \
		--rpc-url $(INK_SEPOLIA_RPC) \
		--verifier blockscout \
		--verifier-url '$(INK_SEPOLIA_EXPLORER)' \
		$(call get-addr,763373,Paypink) \
		contracts/Paypink.sol:Paypink

verify-ink-sepolia-yourcontract:
	forge verify-contract \
		--rpc-url $(INK_SEPOLIA_RPC) \
		--verifier blockscout \
		--verifier-url '$(INK_SEPOLIA_EXPLORER)' \
		$(call get-addr,763373,YourContract) \
		contracts/YourContract.sol:YourContract
