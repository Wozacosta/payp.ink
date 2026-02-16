# Story 1.1: Verify EIP-3009 Support on Ink USDC (Go/No-Go Gate)

Status: done

## Story

As a **developer**,
I want to verify that Circle's native USDC on Ink supports `transferWithAuthorization` (EIP-3009),
So that I have confidence the migration is technically feasible before changing any code.

## Acceptance Criteria

1. **Given** the Ink Sepolia USDC contract at `0xFabab97dCE620294D2B0b0e46C68964e326300Ac`
   **When** I inspect the contract ABI on a block explorer or call the function selector
   **Then** the `transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)` function exists
   **And** the result is documented in the story file as GO or NO-GO

2. **Given** the verification is GO
   **When** I check the implementation contract
   **Then** `receiveWithAuthorization` and `cancelAuthorization` also exist (full EIP-3009 suite)

3. **Given** the verification is complete
   **When** I document the findings
   **Then** the documentation includes: proxy address, implementation address, implementation name, EIP-3009 function signatures, EIP-712 domain info, and verification date

## Tasks / Subtasks

- [x] Task 1: Verify EIP-3009 on Ink Sepolia USDC (AC: #1, #2)
  - [x] 1.1 Confirm the proxy contract at `0xFabab97dCE620294D2B0b0e46C68964e326300Ac` is verified on Blockscout
  - [x] 1.2 Identify the implementation contract address behind the proxy
  - [x] 1.3 Confirm `transferWithAuthorization` exists in the implementation ABI
  - [x] 1.4 Confirm `receiveWithAuthorization` and `cancelAuthorization` exist
  - [x] 1.5 Record the EIP-712 domain separator info (name, version, chainId method)
- [x] Task 2: Verify Ink Mainnet USDC (bonus scope — ACs only require Sepolia)
  - [x] 2.1 Confirm the mainnet USDC address from Circle docs (`0x2D270e6886d130D724215A266106e6832161EAEd`)
  - [x] 2.2 Verify the mainnet implementation also has EIP-3009 functions
- [x] Task 3: Document GO/NO-GO Decision (AC: #3)
  - [x] 3.1 Write the verification results into this story's Dev Agent Record
  - [x] 3.2 Record GO or NO-GO with evidence

## Dev Notes

### Context

This is the **go/no-go gate** for the entire x402 migration from CDP to thirdweb. The migration depends on Circle's native USDC on Ink supporting EIP-3009 (`transferWithAuthorization`), which is required by the x402 protocol for gasless USDC payment authorization.

The PRD identifies this as the #1 risk: "Ink USDC lacks EIP-3009 → Migration blocked." This story resolves that risk before any code changes begin.

### Architecture & Technical Details

**Contract structure (Ink Sepolia):**
- Proxy: `0xFabab97dCE620294D2B0b0e46C68964e326300Ac` (FiatTokenProxy)
- Implementation: `0xa0aAba7468574B8E774B5ad6710e023711003D50` (FiatTokenV2_2)
- The proxy ABI only exposes admin/upgrade functions. EIP-3009 functions are on the implementation.

**Contract structure (Ink Mainnet):**
- USDC address: `0x2D270e6886d130D724215A266106e6832161EAEd` (from Circle official docs)

**EIP-3009 functions verified (FiatTokenV2_2 `bytes` variant only — no legacy `(v,r,s)` overload):**
- `transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)`
- `receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)`
- `cancelAuthorization(address authorizer, bytes32 nonce, bytes signature)`

**EIP-712 domain:**
- Name: from token's `name` storage variable
- Version: `"2"`
- ChainId: dynamic via `chainid()` opcode

**Verification methods:**
1. Blockscout API: `https://explorer-sepolia.inkonchain.com/api/v2/smart-contracts/<address>`
2. Blockscout API (mainnet): `https://explorer.inkonchain.com/api/v2/smart-contracts/<address>`
3. Alternative: cast CLI — `cast call <proxy> "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)" ...` to check function exists

### What NOT to Do

- Do NOT modify any code in this story — this is verification only
- Do NOT install any packages
- Do NOT change the contract or deployment scripts
- Do NOT create test files — this is a manual/scripted verification

### Project Structure Notes

- Ink Sepolia explorer: `https://explorer-sepolia.inkonchain.com`
- Ink Mainnet explorer: `https://explorer.inkonchain.com`
- Circle USDC docs: `https://developers.circle.com/stablecoins/usdc-contract-addresses`
- Existing ink-facilitator doc: `packages/nextjs/content/docs/ink-facilitator.md` (already notes EIP-3009 support likely)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#Risk Mitigations] — "Ink USDC lacks EIP-3009 → Migration blocked"
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1] — Go/No-Go gate acceptance criteria
- [Source: packages/nextjs/content/docs/ink-facilitator.md#L209-210] — "Circle deploys native USDC on Ink... Native USDC consistently includes EIP-3009"
- [Source: Circle Blog] — https://www.circle.com/blog/now-available-usdc-cctp-v2-on-ink
- [Source: Circle USDC Addresses] — https://developers.circle.com/stablecoins/usdc-contract-addresses

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Blockscout API (Ink Sepolia proxy): `https://explorer-sepolia.inkonchain.com/api/v2/smart-contracts/0xFabab97dCE620294D2B0b0e46C68964e326300Ac`
- Blockscout API (Ink Sepolia impl): `https://explorer-sepolia.inkonchain.com/api/v2/smart-contracts/0xa0aAba7468574B8E774B5ad6710e023711003D50`
- Blockscout API (Ink Mainnet proxy): `https://explorer.inkonchain.com/api/v2/smart-contracts/0x2D270e6886d130D724215A266106e6832161EAEd`
- Blockscout API (Ink Mainnet impl): `https://explorer.inkonchain.com/api/v2/smart-contracts/0xDD588d02e5DF74d112F9c167CdeA0B8Ba5382369`

### Completion Notes List

#### Decision: GO

EIP-3009 is fully supported on both Ink Sepolia and Ink Mainnet USDC. The x402 migration to thirdweb + Ink is technically feasible.

#### Ink Sepolia Verification (2026-02-16)

| Field | Value |
|-------|-------|
| Proxy Address | `0xFabab97dCE620294D2B0b0e46C68964e326300Ac` |
| Proxy Type | EIP-1967 (OpenZeppelin) |
| Proxy Name | FiatTokenProxy |
| Proxy Verified | Yes |
| Implementation Address | `0xa0aAba7468574B8E774B5ad6710e023711003D50` |
| Implementation Name | FiatTokenV2_2 |
| Implementation Verified | Yes |

**EIP-3009 Function Signatures (all confirmed present via Blockscout API):**

FiatTokenV2_2 exposes the `bytes` signature variant only (not the legacy `(v, r, s)` variant):
- `transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)`
- `receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)`
- `cancelAuthorization(address,bytes32,bytes)`

> **Note on AC1 signature mismatch:** AC1 specifies `transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)` — the legacy `(v, r, s)` variant from the original EIP-3009 spec. FiatTokenV2_2 does NOT expose this variant as an external function. Only the `bytes memory signature` variant exists. The thirdweb facilitator must use the `bytes` variant. This does not block the migration — `bytes` is the modern compact signature format and is functionally equivalent — but downstream stories must use the correct signature.

**Verification evidence (Blockscout API response excerpts):**
- Ink Sepolia implementation: `GET https://explorer-sepolia.inkonchain.com/api/v2/smart-contracts/0xa0aAba7468574B8E774B5ad6710e023711003D50` — ABI contains `transferWithAuthorization`, `receiveWithAuthorization`, `cancelAuthorization` with `bytes` parameter type
- Legacy `(v,r,s)` variants: NOT present in external ABI. Internal helpers `_transferWithAuthorization(...)` exist but are not externally callable
- `permit` function: has both `(v,r,s)` and `bytes` variants (selector `0xd505accf` for legacy)

**EIP-712 Domain Info (independently confirmed on Sepolia):**
- Name: from token's `name()` storage getter (slot 4, value: "USD Coin")
- Version: `"2"` (hardcoded in `EIP712.makeDomainSeparator(name, "2", _chainId())`)
- ChainId: dynamic via `chainid()` opcode — `_domainSeparator()` recomputes on every call to avoid stale separators after chain forks
- TypeHash: `0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f`

#### Ink Mainnet Verification (2026-02-16)

| Field | Value |
|-------|-------|
| Proxy Address | `0x2D270e6886d130D724215A266106e6832161EAEd` |
| Proxy Type | EIP-1967 (OpenZeppelin) |
| Proxy Name | FiatTokenProxy |
| Proxy Verified | Yes |
| Implementation Address | `0xDD588d02e5DF74d112F9c167CdeA0B8Ba5382369` |
| Implementation Name | FiatTokenV2_2 |
| Implementation Verified | Yes |

**EIP-3009 Function Signatures (independently confirmed via Blockscout API):**

FiatTokenV2_2 on mainnet also exposes only the `bytes` signature variant:
- `transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)`
- `receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)`
- `cancelAuthorization(address,bytes32,bytes)`

**Verification evidence:**
- Ink Mainnet implementation: `GET https://explorer.inkonchain.com/api/v2/smart-contracts/0xDD588d02e5DF74d112F9c167CdeA0B8Ba5382369` — ABI confirmed identical EIP-3009 surface to Sepolia

**EIP-712 Domain Info (independently confirmed on Mainnet):**
- Name: from token's `name()` storage getter (value: "USD Coin")
- Version: `"2"` (hardcoded in `EIP712.makeDomainSeparator`)
- ChainId: dynamic via `chainid()` opcode — recomputed per call
- TypeHash: `0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f`

**CAIP-2 Chain Identifiers (for downstream x402 route stories):**
- Ink Sepolia: `eip155:763373`
- Ink Mainnet: `eip155:57073`

**Additional Notes:**
- `transferWithAuthorization` has modifiers: `whenNotPaused`, `notBlacklisted(from)`, `notBlacklisted(to)`
- Both implementations are `FiatTokenV2_2` — Circle's standard USDC implementation with full EIP-3009 suite
- Internal helpers `_transferWithAuthorization`, `_receiveWithAuthorization`, `_cancelAuthorization` also present

### File List

No files modified (verification-only story).

## Change Log

| Date | Change |
|------|--------|
| 2026-02-16 | Story created by create-story workflow |
| 2026-02-16 | Verification complete: GO — EIP-3009 confirmed on both Ink Sepolia and Ink Mainnet USDC (FiatTokenV2_2). All tasks completed. |
| 2026-02-16 | Code review: Fixed 6 issues (3M, 3L). Corrected signature variants (bytes only, not v/r/s), added Blockscout API verification evidence, independently confirmed mainnet EIP-712 domain, added CAIP-2 identifiers, noted Task 2 as bonus scope. |
