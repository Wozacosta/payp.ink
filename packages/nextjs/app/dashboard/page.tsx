"use client";

import type { NextPage } from "next";
import { useSession } from "next-auth/react";
import { useAccount } from "wagmi";
import { CreatorArticleList } from "~~/components/CreatorArticleList";
import { CreatorEarnings } from "~~/components/CreatorEarnings";

const DashboardPage: NextPage = () => {
  const { address } = useAccount();
  const { data: session } = useSession();

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl grow">
      <h1 className="text-2xl font-bold mb-6">Creator Dashboard</h1>

      {!address ? (
        <p className="text-base-content/70">Connect your wallet to view your dashboard.</p>
      ) : !session?.address ? (
        <p className="text-base-content/70">Sign in with your wallet to view your dashboard.</p>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="text-lg font-semibold mb-4">Earnings</h2>
            <CreatorEarnings address={address as `0x${string}`} />
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-4">Your Articles</h2>
            <CreatorArticleList address={address as `0x${string}`} />
          </section>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
