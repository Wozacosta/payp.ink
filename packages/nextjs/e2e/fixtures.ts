import { type BrowserContext, type Page, test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockProviderScript = readFileSync(join(__dirname, "mock-provider.js"), "utf-8");

// Anvil account #0
export const TEST_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const TEST_ACCOUNT_SHORT = "0xf39F...2266";

/**
 * Block external network requests from the browser. In E2E tests the
 * only backend the browser needs is localhost (Anvil + Next.js dev server).
 * This prevents 429 rate-limit errors from third-party RPCs (merkle.io,
 * alchemy, infura, walletconnect, etc.) that stall RainbowKit initialization.
 *
 * Uses a regex pattern instead of a function filter so Playwright can evaluate
 * the match in the browser process without IPC round-trips per request.
 * This avoids a bottleneck where many concurrent requests (wagmi polling,
 * HMR, etc.) queue up and delay legitimate localhost fetches.
 */
async function blockExternalRequests(context: BrowserContext) {
  // Match any URL that is NOT http(s)://localhost or http(s)://127.0.0.1
  await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, route => route.abort());
}

/**
 * Programmatically connect wallet via wagmi (no RainbowKit modal).
 * Waits for __E2E_CONNECT__ to be available, calls it, then waits for
 * wagmi's React state to propagate (status === "connected" in the store).
 */
async function programmaticConnect(page: Page) {
  await page.waitForFunction(() => typeof (window as any).__E2E_CONNECT__ === "function", null, { timeout: 15_000 });
  const result = await page.evaluate(async () => {
    try {
      await (window as any).__E2E_CONNECT__();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });
  if (!result.ok) {
    throw new Error(`Programmatic connect failed: ${result.error}`);
  }
  // Wait for wagmi's store to reflect connected status in React
  await page.waitForFunction(
    () => {
      const config = (window as any).__WAGMI_CONFIG__;
      return config?.state?.status === "connected";
    },
    null,
    { timeout: 10_000 },
  );
}

/**
 * Perform SIWE sign-in by directly calling the NextAuth credentials endpoint.
 * Creates a session cookie, then triggers a same-tab storage event so
 * NextAuth's SessionProvider refetches the session and updates React state.
 *
 * NextAuth v4's "BroadcastChannel" uses localStorage + storage events.
 * The storage event only fires cross-tab by default, so we dispatch a
 * synthetic StorageEvent to trigger the same-tab listener.
 */
async function programmaticSiwe(page: Page) {
  const siweOk = await page.evaluate(async (account: string) => {
    // 1. Get CSRF token (used as SIWE nonce)
    const csrfRes = await fetch("/api/auth/csrf");
    const { csrfToken } = await csrfRes.json();

    // 2. Build EIP-4361 SIWE message
    const domain = window.location.host;
    const origin = window.location.origin;
    const now = new Date().toISOString();
    const message = [
      `${domain} wants you to sign in with your Ethereum account:`,
      account,
      "",
      "Sign in to payp.ink",
      "",
      `URI: ${origin}`,
      "Version: 1",
      "Chain ID: 31337",
      `Nonce: ${csrfToken}`,
      `Issued At: ${now}`,
    ].join("\n");

    // 3. Sign via mock provider (delegates to Anvil's personal_sign)
    const msgHex =
      "0x" +
      Array.from(new TextEncoder().encode(message))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    const signature = await (window as any).ethereum.request({
      method: "personal_sign",
      params: [msgHex, account],
    });

    // 4. POST to NextAuth credentials callback
    const callbackRes = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        message,
        signature,
        csrfToken,
        json: "true",
      }),
      redirect: "follow",
    });

    if (!callbackRes.ok) return false;

    // 5. Trigger SessionProvider refetch via synthetic storage event.
    // NextAuth's BroadcastChannel listens for storage events on key
    // "nextauth.message". The storage event only fires cross-tab by
    // default, so we manually dispatch one for the same tab.
    const storageValue = JSON.stringify({
      event: "session",
      data: { trigger: "getSession" },
      timestamp: Date.now(),
    });
    localStorage.setItem("nextauth.message", storageValue);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "nextauth.message",
        newValue: storageValue,
      }),
    );

    return true;
  }, TEST_ACCOUNT);

  if (!siweOk) {
    throw new Error("SIWE callback failed");
  }
}

/**
 * Connect wallet and complete SIWE sign-in fully programmatically.
 *
 * 1. Navigate to target page
 * 2. Programmatic wagmi connect via `window.__E2E_CONNECT__()`
 * 3. Programmatic SIWE via NextAuth credentials endpoint
 * 4. Synthetic storage event triggers SessionProvider refetch
 *
 * No page reload needed. No RainbowKit modal interactions.
 * This is 100% deterministic.
 */
export async function connectAndSignTo(page: Page, targetUrl: string) {
  await page.goto(targetUrl, { waitUntil: "networkidle" });

  // Connect wallet with retry — occasionally RainbowKit's ConnectButton.Custom
  // doesn't pick up the wagmi state change on the first attempt.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await programmaticConnect(page);
    try {
      await expect(page.getByText(TEST_ACCOUNT_SHORT).first()).toBeVisible({ timeout: 5_000 });
      break;
    } catch {
      if (attempt === 3) throw new Error("Wallet address not visible after 3 connect attempts");
      // Reload and retry
      await page.reload({ waitUntil: "networkidle" });
    }
  }

  // SIWE sign-in + trigger SessionProvider refetch
  await programmaticSiwe(page);
}

/**
 * Shorthand: connect wallet + SIWE on the current page.
 */
export async function connectAndSign(page: Page) {
  const url = page.url();
  // If page is about:blank or similar, go to home first
  const targetUrl = url.startsWith("http") ? url : "/";
  await connectAndSignTo(page, targetUrl);
}

/**
 * Custom Playwright fixtures that inject a mock EIP-1193 provider backed by
 * Anvil. In E2E mode, wagmiConnectors.tsx swaps to the injected wallet
 * connector which reads directly from window.ethereum.
 * External RPC requests are blocked to avoid 429 rate limits.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript({ content: mockProviderScript });
    await blockExternalRequests(context);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(context);
  },
});

export { expect };
