"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address } from "@scaffold-ui/components";
import { getChainName } from "~~/utils/chainName";

type ArticleCardProps = {
  slug: string;
  title: string;
  creatorAddress: string;
  chainId: number;
  createdAt: string;
};

export const ArticleCard = ({ slug, title, creatorAddress, chainId, createdAt }: ArticleCardProps) => {
  const router = useRouter();

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/articles/${slug}`)}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") router.push(`/articles/${slug}`);
      }}
      className="card card-bordered bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="card-body p-5">
        <h2 className="card-title text-lg">{title}</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-base-content/70">
          <Link
            href={`/articles/creator/${creatorAddress}`}
            onClick={e => e.stopPropagation()}
            className="hover:opacity-80"
          >
            <Address address={creatorAddress as `0x${string}`} disableAddressLink />
          </Link>
          <span className="badge badge-ghost badge-sm">{getChainName(chainId)}</span>
          <span>{new Date(createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};
