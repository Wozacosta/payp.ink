import { keccak256, toHex } from "viem";

/**
 * Compute the keccak256 hash of an article body, matching the on-chain
 * `keccak256(abi.encodePacked(body))` used in `registerArticle()`.
 */
export function computeContentHash(body: string): `0x${string}` {
  return keccak256(toHex(body));
}

/**
 * Verify that a served article body matches its on-chain contentHash.
 * Returns true if the hashes match.
 */
export function verifyContentIntegrity(body: string, onChainHash: `0x${string}`): boolean {
  return computeContentHash(body) === onChainHash;
}
