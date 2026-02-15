import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/db";
import { articles } from "~~/db/schema";
import { getAuthAddress } from "~~/services/auth/getAuthAddress";
import { getSlugHash, paypinkContract, publicClient } from "~~/services/web3/serverClient";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [article] = await db.select().from(articles).where(eq(articles.slug, slug)).limit(1);

  if (!article || article.status !== "published") {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  if (!paypinkContract) {
    return NextResponse.json({ error: "Contract not configured" }, { status: 500 });
  }

  // Read on-chain article data for price check
  type OnChainArticle = {
    slug: string;
    creator: `0x${string}`;
    price: bigint;
    contentHash: string;
    views: bigint;
    earned: bigint;
  };

  const onChainArticle = (await publicClient.readContract({
    ...paypinkContract,
    functionName: "getArticle",
    args: [slug],
  })) as OnChainArticle;

  const { price } = onChainArticle;

  // Free article — serve directly
  if (price === 0n) {
    return NextResponse.json({
      slug: article.slug,
      title: article.title,
      body: article.body,
      creatorAddress: article.creatorAddress,
    });
  }

  // Paid article — check auth + payment
  const readerAddress = await getAuthAddress(req);
  if (!readerAddress) {
    return NextResponse.json({ error: "Authentication required for paid articles" }, { status: 401 });
  }

  // Creator can always read their own article
  if (readerAddress.toLowerCase() === onChainArticle.creator.toLowerCase()) {
    return NextResponse.json({
      slug: article.slug,
      title: article.title,
      body: article.body,
      creatorAddress: article.creatorAddress,
    });
  }

  const slugHash = getSlugHash(slug);
  const paid = await publicClient.readContract({
    ...paypinkContract,
    functionName: "hasPaid",
    args: [slugHash, readerAddress],
  });
  if (!paid) {
    return NextResponse.json({ error: "Payment required", price: price.toString() }, { status: 402 });
  }

  return NextResponse.json({
    slug: article.slug,
    title: article.title,
    body: article.body,
    creatorAddress: article.creatorAddress,
  });
}
