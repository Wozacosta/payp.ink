import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import type { NextPage } from "next";
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
    <div className="flex flex-col grow px-4 py-8 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Articles</h1>

      {published.length === 0 ? (
        <p className="text-base-content/70">No articles published yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {published.map(article => (
            <Link
              key={article.slug}
              href={`/articles/${article.slug}`}
              className="card bg-base-100 shadow-sm border border-base-300 hover:shadow-md transition-shadow"
            >
              <div className="card-body p-5">
                <h2 className="card-title text-lg">{article.title}</h2>
                <div className="flex flex-wrap items-center gap-3 text-sm text-base-content/70">
                  <span className="font-mono text-xs">
                    {article.creatorAddress.slice(0, 6)}...{article.creatorAddress.slice(-4)}
                  </span>
                  <span>{article.createdAt.toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArticlesPage;
