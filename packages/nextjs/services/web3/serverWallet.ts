import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getServerChain } from "~~/services/web3/serverChainId";

const CHAIN = getServerChain();

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
