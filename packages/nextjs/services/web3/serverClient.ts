import { createPublicClient, http } from "viem";
import { foundry, inkSepolia } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

const CHAINS = { [foundry.id]: foundry, [inkSepolia.id]: inkSepolia } as const;
const RAW_ENV_CHAIN_ID = process.env.NEXT_PUBLIC_TARGET_CHAIN_ID;
let ENV_CHAIN_ID: number | null = null;
if (RAW_ENV_CHAIN_ID) {
  const parsed = Number(RAW_ENV_CHAIN_ID);
  if (!Number.isFinite(parsed) || !(parsed in CHAINS)) {
    throw new Error(
      `Invalid NEXT_PUBLIC_TARGET_CHAIN_ID="${RAW_ENV_CHAIN_ID}". Must be one of: ${Object.keys(CHAINS).join(", ")}`,
    );
  }
  ENV_CHAIN_ID = parsed;
}
const CHAIN_ID = ENV_CHAIN_ID ?? (process.env.NODE_ENV === "production" ? inkSepolia.id : foundry.id);
const CHAIN = CHAINS[CHAIN_ID as keyof typeof CHAINS];

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(undefined, { timeout: 10_000 }),
});

const contracts = deployedContracts[CHAIN_ID as keyof typeof deployedContracts];
const paypink = contracts && "Paypink" in contracts ? (contracts as any).Paypink : undefined;

if (!paypink) {
  console.warn(`Paypink contract not found for chain ${CHAIN_ID}`);
}

export const paypinkContract = paypink ? { address: paypink.address as `0x${string}`, abi: paypink.abi } : undefined;

export { getSlugHash } from "./slugHash";
