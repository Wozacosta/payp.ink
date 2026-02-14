import { wagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { hardhat, mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig, { DEFAULT_ALCHEMY_API_KEY, ScaffoldConfig } from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
export const enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: wagmiConnectors(),
  ssr: true,
  client: ({ chain }) => {
    const mainnetFallbackWithDefaultRPC = [http("https://mainnet.rpc.buidlguidl.com")];
    let rpcFallbacks = [...(chain.id === mainnet.id ? mainnetFallbackWithDefaultRPC : []), http()];
    const rpcOverrideUrl = (scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"])?.[chain.id];
    if (rpcOverrideUrl) {
      rpcFallbacks = [http(rpcOverrideUrl), ...rpcFallbacks];
    } else {
      const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
      if (alchemyHttpUrl) {
        const isUsingDefaultKey = scaffoldConfig.alchemyApiKey === DEFAULT_ALCHEMY_API_KEY;
        rpcFallbacks = isUsingDefaultKey
          ? [...rpcFallbacks, http(alchemyHttpUrl)]
          : [http(alchemyHttpUrl), ...rpcFallbacks];
      }
    }
    return createClient({
      chain,
      transport: fallback(rpcFallbacks),
      ...(chain.id !== (hardhat as Chain).id ? { pollingInterval: scaffoldConfig.pollingInterval } : {}),
    });
  },
});

// Expose E2E helpers for programmatic wallet connection (bypasses RainbowKit modal)
if (typeof window !== "undefined" && (window as any).__E2E_TESTING__) {
  (window as any).__WAGMI_CONFIG__ = wagmiConfig;

  // Dynamic import to avoid bundling wagmi/actions in production
  import("wagmi/actions").then(({ connect, getConnectors }) => {
    (window as any).__E2E_CONNECT__ = async () => {
      const connectors = getConnectors(wagmiConfig);
      const injected = connectors.find(c => c.type === "injected");
      if (!injected) throw new Error("No injected connector found");
      const result = await connect(wagmiConfig, { connector: injected });

      // Sync SE-2 global target network to the connected chain (foundry/31337).
      // Without this, useScaffoldReadContract defaults to targetNetworks[0] (Ink Sepolia)
      // and contract reads go to the wrong chain.
      const { useGlobalState } = await import("~~/services/store/store");
      const { NETWORKS_EXTRA_DATA } = await import("~~/utils/scaffold-eth/networks");
      const connectedChain = scaffoldConfig.targetNetworks.find(n => n.id === result.chainId);
      if (connectedChain) {
        useGlobalState.getState().setTargetNetwork({
          ...connectedChain,
          ...NETWORKS_EXTRA_DATA[connectedChain.id],
        });
      }

      return result;
    };
  });
}
