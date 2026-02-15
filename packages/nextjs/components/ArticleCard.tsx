"use client";

import Link from "next/link";
import { Address } from "@scaffold-ui/components";

type ArticleCardProps = {
  slug: string;
  title: string;
  creatorAddress: string;
  createdAt: string;
};

export const ArticleCard = ({ slug, title, creatorAddress, createdAt }: ArticleCardProps) => {
  return (
    <Link
      href={`/articles/${slug}`}
      className="card card-bordered bg-base-100 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="card-body p-5">
        <h2 className="card-title text-lg">{title}</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-base-content/70">
          <Address address={creatorAddress as `0x${string}`} />
          <span>{new Date(createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
};
