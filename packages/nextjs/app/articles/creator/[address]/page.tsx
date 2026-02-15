import { notFound } from "next/navigation";
import { Address } from "@scaffold-ui/components";
import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { isAddress } from "viem";
import { ArticleCard } from "~~/components/ArticleCard";
import { db } from "~~/db";
import { articles } from "~~/db/schema";

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return { title: `Articles by ${short}` };
}

export default async function CreatorPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;

  if (!isAddress(address)) {
    notFound();
  }

  const published = await db
    .select({
      slug: articles.slug,
      title: articles.title,
      creatorAddress: articles.creatorAddress,
      chainId: articles.chainId,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(eq(articles.creatorAddress, address))
    .orderBy(desc(articles.createdAt));

  const visibleArticles = published.filter(a => a.creatorAddress.toLowerCase() === address.toLowerCase());

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl grow">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Articles by</h1>
        <Address address={address as `0x${string}`} />
      </div>

      {visibleArticles.length === 0 ? (
        <p className="text-base-content/70">No published articles by this creator.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {visibleArticles.map(article => (
            <ArticleCard
              key={article.slug}
              slug={article.slug}
              title={article.title}
              creatorAddress={article.creatorAddress}
              chainId={article.chainId}
              createdAt={article.createdAt.toISOString()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
