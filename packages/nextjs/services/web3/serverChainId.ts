import type { Chain } from "viem";
import { baseSepolia, foundry, inkSepolia } from "viem/chains";

const CHAINS: Record<number, Chain> = {
  [foundry.id]: foundry,
  [inkSepolia.id]: inkSepolia,
  [baseSepolia.id]: baseSepolia,
};

function resolveChainId(): number {
  const raw = process.env.NEXT_PUBLIC_TARGET_CHAIN_ID;
  if (raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !(parsed in CHAINS)) {
      throw new Error(
        `Invalid NEXT_PUBLIC_TARGET_CHAIN_ID="${raw}". Must be one of: ${Object.keys(CHAINS).join(", ")}`,
      );
    }
    return parsed;
  }
  return process.env.NODE_ENV === "production" ? inkSepolia.id : foundry.id;
}

const CHAIN_ID = resolveChainId();

export function getServerChainId(): number {
  return CHAIN_ID;
}

export function getServerChain(): Chain {
  return CHAINS[CHAIN_ID];
}
