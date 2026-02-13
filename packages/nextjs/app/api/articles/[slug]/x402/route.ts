import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { formatUnits, getAddress } from "viem";
import { withX402 } from "x402-next";
import { db } from "~~/db";
import { articles } from "~~/db/schema";
import { paypinkContract, publicClient } from "~~/services/web3/serverClient";
import { getServerWallet } from "~~/services/web3/serverWallet";

type OnChainArticle = {
  slug: string;
  creator: `0x${string}`;
  price: bigint;
  contentHash: string;
  views: bigint;
  earned: bigint;
};

function decodePaymentHeader(req: NextRequest): { from: string; value: string } | null {
  const header = req.headers.get("X-PAYMENT");
  if (!header) return null;
  try {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString());
    return {
      from: decoded.payload?.authorization?.from ?? decoded.authorization?.from,
      value: decoded.payload?.authorization?.value ?? decoded.authorization?.value,
    };
  } catch {
    return null;
  }
}

const handler = async (req: NextRequest): Promise<NextResponse<any>> => {
  const slug = req.nextUrl.pathname.split("/").at(-2);
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const [article] = await db.select().from(articles).where(eq(articles.slug, slug)).limit(1);

  if (!article || article.status !== "published") {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // Extract payer info from x402 payment header
  const payment = decodePaymentHeader(req);
  if (!payment?.from) {
    return NextResponse.json({ error: "Payment data not found" }, { status: 400 });
  }

  if (!paypinkContract) {
    return NextResponse.json({ error: "Contract not configured" }, { status: 500 });
  }

  // Call recordX402Payment on-chain via server wallet
  const readerAddress = getAddress(payment.from);
  const amount = BigInt(payment.value);

  try {
    await getServerWallet().writeContract({
      ...paypinkContract,
      functionName: "recordX402Payment",
      args: [slug, readerAddress, amount],
    });
  } catch (e: any) {
    // If already paid, that's fine — serve the content anyway
    if (!e.message?.includes("AlreadyPaid")) {
      console.error("recordX402Payment failed:", e);
      return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
    }
  }

  return NextResponse.json({
    slug: article.slug,
    title: article.title,
    body: article.body,
    creatorAddress: article.creatorAddress,
  });
};

// Dynamic pricing: read article price from on-chain data per request
async function getRouteConfig(req: NextRequest) {
  const slug = req.nextUrl.pathname.split("/").at(-2);

  if (!slug || !paypinkContract) {
    return { price: "$0.01" as const, network: "base-sepolia" as const };
  }

  const onChainArticle = (await publicClient.readContract({
    ...paypinkContract,
    functionName: "getArticle",
    args: [slug],
  })) as OnChainArticle;

  // Convert price from wei (assuming USDC 6 decimals) to dollar string
  const priceUsd = formatUnits(onChainArticle.price, 6);

  return {
    price: `$${priceUsd}` as const,
    network: "base-sepolia" as const,
    config: { description: `Access article: ${slug}` },
  };
}

export const GET = withX402(handler, paypinkContract?.address ?? "0x0", getRouteConfig);
