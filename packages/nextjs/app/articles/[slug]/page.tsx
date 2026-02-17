"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatEther, formatUnits } from "viem";
import { useAccount } from "wagmi";
import { SignInButton } from "~~/components/SignInButton";
import { TipButton } from "~~/components/TipButton";
import { useScaffoldReadContract, useScaffoldWriteContract, useTransactor } from "~~/hooks/scaffold-eth";
import { getSlugHash } from "~~/services/web3/slugHash";
import { verifyContentIntegrity } from "~~/utils/contentHash";

type ArticleContent = {
  slug: string;
  title: string;
  body: string;
  creatorAddress: string;
};

const ArticlePage: NextPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { address } = useAccount();
  const { data: session } = useSession();

  const [articleContent, setArticleContent] = useState<ArticleContent | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "loaded" | "paywall" | "error">("idle");
  const [fetchError, setFetchError] = useState("");
  const [payingEth, setPayingEth] = useState(false);
  const [integrityOk, setIntegrityOk] = useState<boolean | null>(null);

  // Read on-chain article metadata
  const { data: onChainArticle, isLoading: isLoadingArticle } = useScaffoldReadContract({
    contractName: "Paypink",
    functionName: "getArticle",
    args: [slug],
  });

  // Check if current user has paid
  const slugHash = slug ? getSlugHash(slug) : undefined;
  const { data: hasPaid, refetch: refetchHasPaid } = useScaffoldReadContract({
    contractName: "Paypink",
    functionName: "hasPaid",
    args: [slugHash, address],
    query: {
      enabled: !!slugHash && !!address,
    },
  });

  // Read current ETH price for the article from the price feed
  const { data: ethPriceForArticle } = useScaffoldReadContract({
    contractName: "Paypink",
    functionName: "getArticlePriceInEth",
    args: [slug],
    query: {
      enabled: !!slug && !!onChainArticle && onChainArticle.price > 0n,
    },
  });

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "Paypink" });
  const writeTx = useTransactor();

  const isPaying = payingEth;
  const isFree = onChainArticle ? onChainArticle.price === 0n : false;
  const priceUsd = onChainArticle ? formatUnits(onChainArticle.price, 18) : "0";
  // Add 10% slippage buffer for ETH payment (excess is refunded by the contract)
  const ethPaymentAmount = ethPriceForArticle ? (ethPriceForArticle * 110n) / 100n : 0n;
  const ethDisplayAmount = ethPriceForArticle ? formatEther(ethPriceForArticle) : "...";
  const isCreator = !!address && onChainArticle?.creator?.toLowerCase() === address.toLowerCase();
  const canAccessContent = isFree || hasPaid || isCreator;

  const checkIntegrity = useCallback(
    (body: string) => {
      const hash = onChainArticle?.contentHash;
      if (typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash)) {
        setIntegrityOk(verifyContentIntegrity(body, hash as `0x${string}`));
      }
    },
    [onChainArticle?.contentHash],
  );

  // Fetch article content from API
  const fetchContent = useCallback(async () => {
    if (!slug) return;

    setFetchStatus("loading");
    setFetchError("");

    try {
      const res = await fetch(`/api/articles/${slug}`, { signal: AbortSignal.timeout(15_000) });

      if (res.status === 402) {
        setFetchStatus("paywall");
        return;
      }

      if (res.status === 401) {
        setFetchStatus("paywall");
        setFetchError("Sign in with your wallet to read paid articles.");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        setFetchError(data.error || "Failed to load article.");
        setFetchStatus("error");
        return;
      }

      const data: ArticleContent = await res.json();
      setArticleContent(data);
      setFetchStatus("loaded");
      checkIntegrity(data.body);
    } catch {
      setFetchError("Network error. Please try again.");
      setFetchStatus("error");
    }
  }, [slug, checkIntegrity]);

  // Auto-fetch when we know the user can access the content
  useEffect(() => {
    if (!onChainArticle) return;
    if (canAccessContent && (fetchStatus === "idle" || fetchStatus === "paywall")) {
      fetchContent();
    } else if (!isFree && hasPaid === false && fetchStatus === "idle") {
      setFetchStatus("paywall");
    }
  }, [onChainArticle, canAccessContent, isFree, hasPaid, fetchStatus, fetchContent]);

  // Pay with ETH
  const handlePayEth = async () => {
    if (!onChainArticle || !ethPaymentAmount) return;

    setPayingEth(true);
    try {
      await writeTx(async () => {
        const hash = await writeContractAsync({
          functionName: "payForArticle",
          args: [slug],
          value: ethPaymentAmount,
        });
        if (!hash) throw new Error("Transaction rejected");
        return hash;
      });

      await refetchHasPaid();
      await fetchContent();
    } catch {
      // useTransactor already shows error notification
    } finally {
      setPayingEth(false);
    }
  };

  // --- Loading state ---
  if (isLoadingArticle) {
    return (
      <div className="flex items-center flex-col grow pt-10">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="mt-4 text-base-content/70">Loading article...</p>
      </div>
    );
  }

  // --- Article not found on-chain ---
  if (
    !onChainArticle ||
    !onChainArticle.creator ||
    onChainArticle.creator === "0x0000000000000000000000000000000000000000"
  ) {
    return (
      <div className="flex items-center flex-col grow pt-10">
        <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
        <p className="text-base-content/70">No article registered with slug &ldquo;{slug}&rdquo;.</p>
      </div>
    );
  }

  // --- Paywall / Preview ---
  if (fetchStatus === "paywall" || (fetchStatus === "idle" && !canAccessContent)) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-3xl grow">
        {/* Article metadata */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">{slug}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-base-content/70 mb-4">
            <span className="flex items-center gap-1">
              By <Address address={onChainArticle.creator} />
            </span>
            <span>{Number(onChainArticle.views)} views</span>
          </div>
          <div className="badge badge-lg badge-primary">{isFree ? "Free" : `$${priceUsd}`}</div>
        </div>

        {/* Paywall card */}
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body items-center text-center">
            <h2 className="card-title text-xl">This article requires payment</h2>
            <p className="text-base-content/70 mb-4">Pay ${priceUsd} to read the full article.</p>

            {fetchError && <p className="text-error text-sm mb-2">{fetchError}</p>}

            {!address ? (
              <p className="text-base-content/70">Connect your wallet to pay.</p>
            ) : !session?.address ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-base-content/70">Sign in with your wallet to pay.</p>
                <SignInButton />
              </div>
            ) : (
              <div className="flex gap-4">
                <button className="btn btn-primary" onClick={handlePayEth} disabled={isPaying || !ethPaymentAmount}>
                  {payingEth ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Paying...
                    </>
                  ) : (
                    `Pay ~${ethDisplayAmount} ETH`
                  )}
                </button>
                <div className="tooltip" data-tip="USDC payment coming soon (thirdweb migration in progress)">
                  <button className="btn btn-secondary" disabled>
                    {`Pay $${priceUsd} USDC`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Loading content ---
  if (fetchStatus === "loading") {
    return (
      <div className="flex items-center flex-col grow pt-10">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="mt-4 text-base-content/70">Loading content...</p>
      </div>
    );
  }

  // --- Error ---
  if (fetchStatus === "error") {
    return (
      <div className="flex items-center flex-col grow pt-10">
        <h1 className="text-2xl font-bold mb-4">Error</h1>
        <p className="text-error mb-4">{fetchError}</p>
        <button className="btn btn-primary" onClick={fetchContent}>
          Retry
        </button>
      </div>
    );
  }

  // --- Full article ---
  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl grow">
      {/* Content integrity warning */}
      {integrityOk === false && (
        <div className="alert alert-warning mb-6">
          <span>Content integrity check failed — the article body does not match the on-chain hash.</span>
        </div>
      )}

      {/* Article header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">{articleContent?.title || slug}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-base-content/70">
          <span className="flex items-center gap-1">
            By <Address address={onChainArticle.creator} />
          </span>
          <span>{Number(onChainArticle.views)} views</span>
          <span>{isFree ? "Free" : `$${priceUsd}`}</span>
          {integrityOk === true && <span className="badge badge-success badge-sm">Verified</span>}
        </div>
      </div>

      {/* Article body */}
      <article className="prose max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{articleContent?.body || ""}</ReactMarkdown>
      </article>

      {/* Tip */}
      <div className="divider"></div>
      <TipButton slug={slug} />
    </div>
  );
};

export default ArticlePage;
