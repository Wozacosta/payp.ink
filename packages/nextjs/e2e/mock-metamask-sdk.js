/**
 * Mock replacement for the @metamask/sdk webpack chunk.
 * Served by Playwright's route() API when the browser tries to load
 * the real MetaMask SDK bundle.
 *
 * The MetaMask connector in wagmi does:
 *   const { default: SDK } = await import('@metamask/sdk')
 *   sdk = new SDK({ ... })
 *   await sdk.init()
 *   provider = sdk.getProvider()
 *   accounts = await sdk.connect()
 *
 * This mock SDK delegates everything to window.ethereum (our mock provider).
 *
 * Exported as a self-installing webpack module to match the chunk format.
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([
  ["_mock_metamask_sdk"],
  {
    "(app-pages-browser)/./node_modules/@metamask/sdk/dist/browser/es/metamask-sdk.js": function(
      __unused_webpack_module,
      __webpack_exports__,
      __webpack_require__
    ) {
      "use strict";
      __webpack_require__.r(__webpack_exports__);
      __webpack_require__.d(__webpack_exports__, {
        default: function() { return MetaMaskSDK; },
      });

      class MetaMaskSDK {
        constructor() {
          this._provider = null;
        }

        async init() {
          this._provider = window.ethereum;
          return { activeProvider: this._provider };
        }

        getProvider() {
          return this._provider || window.ethereum;
        }

        async connect() {
          const provider = this.getProvider();
          const accounts = await provider.request({ method: "eth_requestAccounts" });
          return accounts;
        }

        async connectAndSign({ msg }) {
          await this.connect();
          const provider = this.getProvider();
          const account = (await provider.request({ method: "eth_accounts" }))[0];
          return provider.request({ method: "personal_sign", params: [msg, account] });
        }

        async connectWith({ method, params }) {
          await this.connect();
          return this.getProvider().request({ method, params });
        }

        async terminate() {}

        isExtensionActive() {
          return true;
        }
      }
    },
  },
]);
