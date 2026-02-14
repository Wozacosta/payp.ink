import { createPublicClient, http } from "viem";
import { foundry, inkSepolia } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

const chains = { [foundry.id]: foundry, [inkSepolia.id]: inkSepolia } as const;
const rawEnvChainId = process.env.NEXT_PUBLIC_TARGET_CHAIN_ID;
let envChainId: number | null = null;
if (rawEnvChainId) {
  const parsed = Number(rawEnvChainId);
  if (!Number.isFinite(parsed) || !(parsed in chains)) {
    throw new Error(
      `Invalid NEXT_PUBLIC_TARGET_CHAIN_ID="${rawEnvChainId}". Must be one of: ${Object.keys(chains).join(", ")}`,
    );
  }
  envChainId = parsed;
}
const chainId = envChainId ?? (process.env.NODE_ENV === "production" ? inkSepolia.id : foundry.id);
const chain = chains[chainId as keyof typeof chains];

export const publicClient = createPublicClient({
  chain,
  transport: http(),
});

const contracts = deployedContracts[chainId as keyof typeof deployedContracts];
const paypink = contracts && "Paypink" in contracts ? (contracts as any).Paypink : undefined;

if (!paypink) {
  console.warn(`Paypink contract not found for chain ${chainId}`);
}

export const paypinkContract = paypink ? { address: paypink.address as `0x${string}`, abi: paypink.abi } : undefined;

export { getSlugHash } from "./slugHash";
