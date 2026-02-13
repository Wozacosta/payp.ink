import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getCsrfToken } from "next-auth/react";
import type { IncomingMessage } from "node:http";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { type SiweMessage, parseSiweMessage, verifySiweMessage } from "viem/siwe";

// Chain-agnostic client for ERC-1271 signature verification
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

function getAuthOptions(req: IncomingMessage): NextAuthOptions {
  return {
    providers: [
      CredentialsProvider({
        name: "Ethereum",
        credentials: {
          message: { label: "Message", type: "text" },
          signature: { label: "Signature", type: "text" },
        },
        async authorize(credentials) {
          try {
            const siweMessage = parseSiweMessage(credentials?.message ?? "") as SiweMessage;

            const nextAuthUrl =
              process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
            if (!nextAuthUrl) return null;

            if (siweMessage.domain !== new URL(nextAuthUrl).host) return null;

            const nonce = await getCsrfToken({ req: { headers: req.headers } });
            if (siweMessage.nonce !== nonce) return null;

            // verifySiweMessage checks structure, signature, expiration, and notBefore
            const valid = await verifySiweMessage(publicClient, {
              message: credentials?.message ?? "",
              signature: (credentials?.signature ?? "") as `0x${string}`,
            });
            if (!valid) return null;

            return { id: siweMessage.address };
          } catch (e) {
            console.error("SIWE auth error:", e);
            return null;
          }
        },
      }),
    ],
    session: { strategy: "jwt" },
    secret: process.env.NEXTAUTH_SECRET,
    callbacks: {
      async session({ session, token }) {
        session.address = token.sub;
        session.user = { name: token.sub };
        return session;
      },
    },
  };
}

// Minimal shim: getCsrfToken only reads req.headers, so this is safe.
// NextAuth v4 doesn't have first-class App Router types.
function toIncomingMessage(req: Request): IncomingMessage {
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { headers } as IncomingMessage;
}

function handler(req: Request) {
  const authOptions = getAuthOptions(toIncomingMessage(req));
  // NextAuth v4 detects Web Request and returns a Web Response
  // @ts-expect-error -- NextAuth v4 types don't include the App Router overload
  return NextAuth(req, authOptions);
}

export { handler as GET, handler as POST };
