import { Address } from "@scaffold-ui/components";
import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import type { NextPage } from "next";
import { getAddress, isAddress } from "viem";
import { ArticleCard } from "~~/components/ArticleCard";
import { db } from "~~/db";
import { articles } from "~~/db/schema";

type Props = {
  params: Promise<{ address: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const short = isAddress(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
  return {
    title: `Articles by ${short} | Paypink`,
  };
}

const CreatorArticlesPage: NextPage<Props> = async ({ params }) => {
  const { address } = await params;

  if (!isAddress(address)) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-3xl grow">
        <h1 className="text-2xl font-bold mb-6">Invalid address</h1>
        <p className="text-base-content/70">The address in the URL is not a valid Ethereum address.</p>
      </div>
    );
  }

  const checksummed = getAddress(address);

  const published = await db
    .select({
      slug: articles.slug,
      title: articles.title,
      creatorAddress: articles.creatorAddress,
      chainId: articles.chainId,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(and(eq(articles.status, "published"), eq(articles.creatorAddress, checksummed)))
    .orderBy(desc(articles.createdAt));

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl grow">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-2xl font-bold">Articles by</h1>
        <Address address={checksummed} size="lg" />
      </div>

      {published.length === 0 ? (
        <p className="text-base-content/70">No published articles by this creator.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {published.map(article => (
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
};

export default CreatorArticlesPage;
