import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, inkSepolia } from "viem/chains";

const chainId = process.env.NODE_ENV === "production" ? inkSepolia.id : foundry.id;
const chain = chainId === inkSepolia.id ? inkSepolia : foundry;

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
