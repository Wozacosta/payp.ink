/**
 * Injected into the browser via Playwright's addInitScript.
 *
 * 1. Sets window.__E2E_TESTING__ flag so wagmiConnectors uses injectedWallet
 * 2. Creates a mock EIP-1193 provider backed by a real Anvil node
 * 3. Sets it as window.ethereum
 * 4. Announces via EIP-6963 for wallet discovery
 *
 * This file runs in the BROWSER context (not Node.js).
 */
(function injectMockProvider() {
  const RPC_URL = "http://localhost:8545";
  const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Anvil #0
  const CHAIN_ID = "0x7a69"; // 31337

  // Signal E2E mode to wagmiConnectors.tsx
  window.__E2E_TESTING__ = true;

  let connected = false;
  const listeners = {};
  let requestId = 0;

  async function rpcCall(method, params = []) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  function emit(event, ...args) {
    (listeners[event] || []).forEach(fn => {
      try {
        fn(...args);
      } catch (e) {
        console.error("[mock-provider]", e);
      }
    });
  }

  const provider = {
    isMetaMask: true,
    _isMockProvider: true,
    selectedAddress: null,
    chainId: CHAIN_ID,
    networkVersion: "31337",

    on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return provider;
    },
    removeListener(event, fn) {
      if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== fn);
      return provider;
    },
    removeAllListeners(event) {
      if (event) delete listeners[event];
      else Object.keys(listeners).forEach(k => delete listeners[k]);
      return provider;
    },
    emit,
    getChainId() {
      return CHAIN_ID;
    },

    async request({ method, params }) {
      switch (method) {
        case "eth_requestAccounts": {
          if (!connected) {
            connected = true;
            provider.selectedAddress = ACCOUNT;
            setTimeout(() => {
              emit("connect", { chainId: CHAIN_ID });
              emit("accountsChanged", [ACCOUNT]);
            }, 10);
          }
          return [ACCOUNT];
        }
        case "eth_accounts":
          return connected ? [ACCOUNT] : [];
        case "eth_chainId":
          return CHAIN_ID;
        case "net_version":
          return "31337";
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        case "personal_sign":
        case "eth_sign": {
          const msg = method === "personal_sign" ? params[0] : params[1];
          const addr = method === "personal_sign" ? params[1] : params[0];
          return rpcCall("personal_sign", [msg, addr]);
        }
        case "eth_signTypedData_v4":
        case "eth_signTypedData_v3":
        case "eth_signTypedData":
          return rpcCall("eth_signTypedData_v4", params);
        case "eth_sendTransaction": {
          const tx = { ...params[0] };
          if (!tx.from) tx.from = ACCOUNT;
          return rpcCall("eth_sendTransaction", [tx]);
        }
        default:
          return rpcCall(method, params);
      }
    },

    enable() {
      return provider.request({ method: "eth_requestAccounts" });
    },
    sendAsync(payload, cb) {
      provider
        .request({ method: payload.method, params: payload.params })
        .then(r => cb(null, { id: payload.id, jsonrpc: "2.0", result: r }))
        .catch(e => cb(e));
    },
  };

  provider.providers = [provider];

  // --- Set window.ethereum ---
  Object.defineProperty(window, "ethereum", {
    value: provider,
    writable: false,
    configurable: true,
  });

  // No EIP-6963 announcement — the injectedWallet connector reads
  // window.ethereum directly. Announcing would cause a duplicate entry
  // in the RainbowKit modal and trigger re-renders that detach DOM nodes.
})();
