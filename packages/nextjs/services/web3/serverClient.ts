import { createPublicClient, http } from "viem";
import { foundry, inkSepolia } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

const chains = { [foundry.id]: foundry, [inkSepolia.id]: inkSepolia } as const;
const envChainId = process.env.NEXT_PUBLIC_TARGET_CHAIN_ID ? Number(process.env.NEXT_PUBLIC_TARGET_CHAIN_ID) : null;
const chainId = envChainId ?? (process.env.NODE_ENV === "production" ? inkSepolia.id : foundry.id);
const chain = chains[chainId as keyof typeof chains] ?? foundry;

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
