import { createPublicClient, http } from "viem";
import { foundry, inkSepolia } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

const chainId = process.env.NODE_ENV === "production" ? inkSepolia.id : foundry.id;
const chain = chainId === inkSepolia.id ? inkSepolia : foundry;

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
