const CHAIN_NAMES: Record<number, string> = {
  31337: "Foundry",
  763373: "Ink Sepolia",
};

export function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}
