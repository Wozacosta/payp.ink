import { afterEach, describe, expect, it, vi } from "vitest";

// These modules run validation at import-time, so we need dynamic imports
// with a fresh module registry per test.

describe("serverClient chain ID validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws on non-numeric NEXT_PUBLIC_TARGET_CHAIN_ID", async () => {
    vi.stubEnv("NEXT_PUBLIC_TARGET_CHAIN_ID", "not-a-number");

    await expect(() => import("../serverClient")).rejects.toThrow("Invalid NEXT_PUBLIC_TARGET_CHAIN_ID");
  });

  it("throws on unsupported chain ID", async () => {
    vi.stubEnv("NEXT_PUBLIC_TARGET_CHAIN_ID", "99999");

    await expect(() => import("../serverClient")).rejects.toThrow("Invalid NEXT_PUBLIC_TARGET_CHAIN_ID");
  });

  it("accepts valid chain ID 31337 (foundry)", async () => {
    vi.stubEnv("NEXT_PUBLIC_TARGET_CHAIN_ID", "31337");

    // Should not throw — but may warn about missing contract
    const mod = await import("../serverClient");
    expect(mod.publicClient).toBeDefined();
  });
});

describe("serverWallet chain ID validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws on non-numeric NEXT_PUBLIC_TARGET_CHAIN_ID", async () => {
    vi.stubEnv("NEXT_PUBLIC_TARGET_CHAIN_ID", "abc");

    await expect(() => import("../serverWallet")).rejects.toThrow("Invalid NEXT_PUBLIC_TARGET_CHAIN_ID");
  });

  it("throws on unsupported chain ID", async () => {
    vi.stubEnv("NEXT_PUBLIC_TARGET_CHAIN_ID", "42161");

    await expect(() => import("../serverWallet")).rejects.toThrow("Invalid NEXT_PUBLIC_TARGET_CHAIN_ID");
  });

  it("throws when SERVER_WALLET_PRIVATE_KEY is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_TARGET_CHAIN_ID", "31337");
    vi.stubEnv("SERVER_WALLET_PRIVATE_KEY", "");

    const mod = await import("../serverWallet");
    expect(() => mod.getServerWallet()).toThrow("SERVER_WALLET_PRIVATE_KEY is not set");
  });
});
