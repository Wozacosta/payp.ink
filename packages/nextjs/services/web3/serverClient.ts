import { createPublicClient, http } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";
import { getServerChain, getServerChainId } from "~~/services/web3/serverChainId";

const CHAIN_ID = getServerChainId();
const CHAIN = getServerChain();

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
