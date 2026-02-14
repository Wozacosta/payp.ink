import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, inkSepolia } from "viem/chains";

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

let _walletClient: ReturnType<typeof createClient> | null = null;

function createClient() {
  const pk = process.env.SERVER_WALLET_PRIVATE_KEY;
  if (!pk) throw new Error("SERVER_WALLET_PRIVATE_KEY is not set");

  const account = privateKeyToAccount(pk as `0x${string}`);

  return createWalletClient({
    account,
    chain,
    transport: http(),
  });
}

export function getServerWallet() {
  if (!_walletClient) {
    _walletClient = createClient();
  }
  return _walletClient;
}
