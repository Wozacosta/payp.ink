import { foundry, inkSepolia } from "viem/chains";

const SUPPORTED_CHAIN_IDS = [foundry.id, inkSepolia.id] as const;

function resolveChainId(): number {
  const raw = process.env.NEXT_PUBLIC_TARGET_CHAIN_ID;
  if (raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !SUPPORTED_CHAIN_IDS.includes(parsed as (typeof SUPPORTED_CHAIN_IDS)[number])) {
      throw new Error(
        `Invalid NEXT_PUBLIC_TARGET_CHAIN_ID="${raw}". Must be one of: ${SUPPORTED_CHAIN_IDS.join(", ")}`,
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
