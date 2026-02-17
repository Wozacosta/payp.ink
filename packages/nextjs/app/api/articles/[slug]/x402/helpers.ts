import { createThirdwebClient } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { facilitator } from "thirdweb/x402";
import { getServerChainId } from "~~/services/web3/serverChainId";
import { getServerWallet } from "~~/services/web3/serverWallet";

export type OnChainArticle = {
  slug: string;
  creator: `0x${string}`;
  price: bigint;
  contentHash: string;
  views: bigint;
  earned: bigint;
};

// --- Chain helper (uses shared server chain config) ---

export function getX402Chain() {
  return defineChain(getServerChainId());
}

// --- thirdweb client & facilitator (module-level, reused across requests) ---

if (!process.env.THIRDWEB_SECRET_KEY) {
  throw new Error("THIRDWEB_SECRET_KEY is not set");
}

const thirdwebClient = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY,
});

export const thirdwebFacilitator = facilitator({
  client: thirdwebClient,
  serverWalletAddress: getServerWallet().account.address,
});
