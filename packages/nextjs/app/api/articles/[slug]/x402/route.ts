import { NextRequest, NextResponse } from "next/server";
import { getRouteConfig, handler } from "./helpers";
import { eq } from "drizzle-orm";
import { withX402 } from "x402-next";
import { db } from "~~/db";
import { articles } from "~~/db/schema";
import { paypinkContract, publicClient } from "~~/services/web3/serverClient";

type OnChainArticle = {
  slug: string;
  creator: `0x${string}`;
  price: bigint;
  contentHash: string;
  views: bigint;
  earned: bigint;
};

const x402Handler = withX402(handler, paypinkContract?.address ?? "0x0", getRouteConfig);

export async function GET(req: NextRequest) {
  // Free articles don't need x402 — serve directly
  const slug = req.nextUrl.pathname.split("/").at(-2);
  if (slug && paypinkContract) {
    try {
      const onChainArticle = (await publicClient.readContract({
        ...paypinkContract,
        functionName: "getArticle",
        args: [slug],
      })) as OnChainArticle;

      console.log(
        `[x402] slug="${slug}" price=${onChainArticle.price} (${onChainArticle.price.toString()} wei) creator=${onChainArticle.creator}`,
      );

      // Verify the article is actually registered on-chain (creator != address(0))
      const isRegistered =
        onChainArticle.creator && onChainArticle.creator !== "0x0000000000000000000000000000000000000000";

      if (!isRegistered) {
        console.log(`[x402] Article "${slug}" not registered on-chain`);
        return NextResponse.json({ error: "Article not found on-chain" }, { status: 404 });
      }

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
      }
    } catch (e) {
      console.error(`[x402] Error checking price for "${slug}":`, e);
      // Fall through to x402 handler
    }
  }

  return x402Handler(req);
}
