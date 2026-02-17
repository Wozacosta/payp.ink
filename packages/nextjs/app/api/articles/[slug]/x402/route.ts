import { NextRequest, NextResponse } from "next/server";
import { getX402Chain, thirdwebFacilitator } from "./helpers";
import type { OnChainArticle } from "./helpers";
import { eq } from "drizzle-orm";
import { settlePayment } from "thirdweb/x402";
import { formatUnits, getAddress } from "viem";
import { db } from "~~/db";
import { articles } from "~~/db/schema";
import { paypinkContract, publicClient } from "~~/services/web3/serverClient";
import { getServerWallet } from "~~/services/web3/serverWallet";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!paypinkContract) {
    return NextResponse.json({ error: "Contract not configured" }, { status: 500 });
  }

  // Read on-chain article data (single RPC call, reused for both free check and pricing)
  let onChainArticle: OnChainArticle;
  try {
    onChainArticle = (await publicClient.readContract({
      ...paypinkContract,
      functionName: "getArticle",
      args: [slug],
    })) as OnChainArticle;

    console.log(`[x402] slug="${slug}" priceWei=${onChainArticle.price.toString()} creator=${onChainArticle.creator}`);
  } catch (e) {
    console.error(`[x402] Error reading article "${slug}" from chain:`, e);
    return NextResponse.json({ error: "Failed to read article from chain" }, { status: 502 });
  }

  // Verify the article is actually registered on-chain (creator != address(0))
  const isRegistered =
    onChainArticle.creator && onChainArticle.creator !== "0x0000000000000000000000000000000000000000";

  if (!isRegistered) {
    console.log(`[x402] Article "${slug}" not registered on-chain`);
    return NextResponse.json({ error: "Article not found on-chain" }, { status: 404 });
  }

  // Free articles don't need x402 — serve directly
  if (onChainArticle.price === 0n) {
    console.log(`[x402] Bypassing x402 for free article "${slug}"`);
    const [article] = await db.select().from(articles).where(eq(articles.slug, slug)).limit(1);
    if (article && article.status === "published") {
      console.log(`[x402] Serving free article "${slug}" directly`);
      return NextResponse.json({
        slug: article.slug,
        title: article.title,
        body: article.body,
        creatorAddress: article.creatorAddress,
      });
    }
    console.log(`[x402] Free article "${slug}" not found in DB or not published`);
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // --- Paid article: settle payment via thirdweb x402 ---
  // Reuse the on-chain price from the single RPC call above
  const rawPrice = Number(formatUnits(onChainArticle.price, 18));
  const priceUsd = `$${Math.max(0.01, Math.round(rawPrice * 100) / 100).toFixed(2)}`;

  try {
    const result = await settlePayment({
      resourceUrl: req.url,
      method: "GET",
      paymentData: req.headers.get("payment-signature") ?? req.headers.get("x-payment") ?? undefined,
      payTo: paypinkContract.address,
      network: getX402Chain(),
      price: priceUsd,
      facilitator: thirdwebFacilitator,
      routeConfig: {
        description: `Access article: ${slug}`,
      },
    });

    if (result.status === 200) {
      // Payment settled — record on-chain + serve content
      const payerAddress = result.paymentReceipt.payer;
      if (!payerAddress) {
        console.error("[x402] Settlement succeeded but payer address missing from receipt");
        return NextResponse.json({ error: "Payment verification failed" }, { status: 500 });
      }

      const readerAddress = getAddress(payerAddress);
      const [article] = await db.select().from(articles).where(eq(articles.slug, slug)).limit(1);

      if (!article || article.status !== "published") {
        return NextResponse.json({ error: "Article not found" }, { status: 404 });
      }

      // Record payment on-chain via server wallet
      // Amount is 0 — thirdweb settles USDC directly to the contract via EIP-3009;
      // recordX402Payment only tracks the event, not the transfer amount.
      try {
        await getServerWallet().writeContract({
          ...paypinkContract,
          functionName: "recordX402Payment",
          args: [slug, readerAddress, BigInt(0)],
        });
      } catch (e: unknown) {
        // If already paid, that's fine — serve the content anyway
        const isAlreadyPaid = e instanceof Error && e.message?.includes("AlreadyPaid");
        if (!isAlreadyPaid) {
          console.error("[x402] recordX402Payment failed:", e);
          return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
        }
      }

      return NextResponse.json({
        slug: article.slug,
        title: article.title,
        body: article.body,
        creatorAddress: article.creatorAddress,
      });
    }

    // 402 or other status — pass through thirdweb's response
    return new Response(JSON.stringify(result.responseBody), {
      status: result.status,
      headers: result.responseHeaders,
    });
  } catch (error) {
    // Network timeout, facilitator unreachable
    console.error("[x402] Settlement error:", error);
    return NextResponse.json({ error: "Payment settlement timed out" }, { status: 502 });
  }
}
