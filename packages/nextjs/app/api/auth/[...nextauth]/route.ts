import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getCsrfToken } from "next-auth/react";
import type { IncomingMessage } from "node:http";
import { type SiweMessage, parseSiweMessage, verifySiweMessage } from "viem/siwe";
import { publicClient } from "~~/services/web3/serverClient";

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

async function handler(req: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  const authOptions = getAuthOptions(toIncomingMessage(req));
  // NextAuth v4 detects App Router via context.params; pass context as 2nd arg
  return NextAuth(authOptions)(req, context as any);
}

export { handler as GET, handler as POST };
