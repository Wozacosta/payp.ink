"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatEther, formatUnits } from "viem";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { getChainName } from "~~/utils/chainName";

type OffChainArticle = {
  slug: string;
  title: string;
  status: string;
  chainId: number;
  createdAt: string;
};

const ArticleRow = ({ article }: { article: OffChainArticle }) => {
  const { data: onChain } = useScaffoldReadContract({
    contractName: "Paypink",
    functionName: "getArticle",
    args: [article.slug],
  });

  const price = onChain?.price != null ? formatUnits(onChain.price, 18) : null;
  const views = onChain?.views != null ? onChain.views.toString() : null;
  const earned = onChain?.earned != null ? formatEther(onChain.earned) : null;

  return (
    <tr>
      <td>
        <Link href={`/articles/${article.slug}`} className="link link-hover font-medium">
          {article.title}
        </Link>
      </td>
      <td>
        <span className={`badge badge-sm ${article.status === "published" ? "badge-success" : "badge-warning"}`}>
          {article.status}
        </span>
      </td>
      <td className="text-right">{price == null ? "—" : price === "0" ? "Free" : `$${price}`}</td>
      <td className="text-right">{views ?? "—"}</td>
      <td className="text-right">{earned == null ? "—" : earned === "0" ? "0" : `${earned} ETH`}</td>
      <td className="text-sm">{getChainName(article.chainId)}</td>
      <td className="text-right text-sm text-base-content/70">{new Date(article.createdAt).toLocaleDateString()}</td>
    </tr>
  );
};

export const CreatorArticleList = () => {
  const [articles, setArticles] = useState<OffChainArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchArticles = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) {
        setError("Failed to load articles");
        return;
      }
      const data = await res.json();
      setArticles(data.articles);
    } catch {
      setError("Failed to load articles");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8" data-testid="articles-loading">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <span>{error}</span>
        <button className="btn btn-sm" onClick={fetchArticles}>
          Retry
        </button>
      </div>
    );
  }

  if (articles.length === 0) {
    return <p className="text-base-content/70 py-4">No articles yet. Create your first one!</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra w-full">
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th className="text-right">Price</th>
            <th className="text-right">Views</th>
            <th className="text-right">Earned</th>
            <th>Chain</th>
            <th className="text-right">Created</th>
          </tr>
        </thead>
        <tbody>
          {articles.map(article => (
            <ArticleRow key={article.slug} article={article} />
          ))}
        </tbody>
      </table>
    </div>
  );
};
