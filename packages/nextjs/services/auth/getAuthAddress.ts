import { type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAddress } from "viem";

export async function getAuthAddress(req: NextRequest): Promise<`0x${string}` | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) return null;
  try {
    return getAddress(token.sub) as `0x${string}`;
  } catch {
    return null;
  }
}
