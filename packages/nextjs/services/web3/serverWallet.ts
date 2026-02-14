import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, inkSepolia } from "viem/chains";

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

let _walletClient: ReturnType<typeof createClient> | null = null;

function createClient() {
  const pk = process.env.SERVER_WALLET_PRIVATE_KEY;
  if (!pk) throw new Error("SERVER_WALLET_PRIVATE_KEY is not set");

  const account = privateKeyToAccount(pk as `0x${string}`);

  return createWalletClient({
    account,
    chain: CHAIN,
    transport: http(),
  });
}

export function getServerWallet() {
  if (!_walletClient) {
    _walletClient = createClient();
  }
  return _walletClient;
}
