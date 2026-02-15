import { desc, eq } from "drizzle-orm";
import type { NextPage } from "next";
import { ArticleCard } from "~~/components/ArticleCard";
import { db } from "~~/db";
import { articles } from "~~/db/schema";

const ArticlesPage: NextPage = async () => {
  const published = await db
    .select({
      slug: articles.slug,
      title: articles.title,
      creatorAddress: articles.creatorAddress,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(eq(articles.status, "published"))
    .orderBy(desc(articles.createdAt));

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl grow">
      <h1 className="text-2xl font-bold mb-6">Articles</h1>

      {published.length === 0 ? (
        <p className="text-base-content/70">No articles published yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {published.map(article => (
            <ArticleCard
              key={article.slug}
              slug={article.slug}
              title={article.title}
              creatorAddress={article.creatorAddress}
              createdAt={article.createdAt.toISOString()}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ArticlesPage;
