import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  baseAccount,
  injectedWallet,
  ledgerWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { rainbowkitBurnerWallet } from "burner-connector";
import * as chains from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";

const { onlyLocalBurnerWallet, targetNetworks } = scaffoldConfig;

/**
 * wagmi connectors for the wagmi context
 */
export const wagmiConnectors = () => {
  // Only create connectors on client-side to avoid SSR issues
  // TODO: update when https://github.com/rainbow-me/rainbowkit/issues/2476 is resolved
  if (typeof window === "undefined") {
    return [];
  }

  // In E2E tests the mock provider sets this flag before any app JS runs.
  // We swap the full wallet list for a single injectedWallet that reads
  // directly from window.ethereum — no MetaMask SDK involved.
  const isE2E = !!(window as any).__E2E_TESTING__;

  const wallets = isE2E
    ? [injectedWallet]
    : [
        metaMaskWallet,
        walletConnectWallet,
        ledgerWallet,
        baseAccount,
        rainbowWallet,
        safeWallet,
        ...(!targetNetworks.some(network => network.id !== (chains.hardhat as chains.Chain).id) ||
        !onlyLocalBurnerWallet
          ? [rainbowkitBurnerWallet]
          : []),
      ];

  return connectorsForWallets(
    [
      {
        groupName: "Supported Wallets",
        wallets,
      },
    ],

    {
      appName: "scaffold-eth-2",
      projectId: scaffoldConfig.walletConnectProjectId,
    },
  );
};
