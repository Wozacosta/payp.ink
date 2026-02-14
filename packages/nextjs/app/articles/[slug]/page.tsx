"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Address } from "@scaffold-ui/components";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { NextPage } from "next";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatEther, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { getSlugHash } from "~~/services/web3/slugHash";
import { verifyContentIntegrity } from "~~/utils/contentHash";
import { notification } from "~~/utils/scaffold-eth";

type ArticleContent = {
  slug: string;
  title: string;
  body: string;
  creatorAddress: string;
};

const ArticlePage: NextPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { address, chainId: activeChainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { data: session } = useSession();

  const [articleContent, setArticleContent] = useState<ArticleContent | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "loaded" | "paywall" | "error">("idle");
  const [fetchError, setFetchError] = useState("");
  const [payingEth, setPayingEth] = useState(false);
  const [payingUsdc, setPayingUsdc] = useState(false);
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

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "Paypink" });

  const isPaying = payingEth || payingUsdc;
  const isFree = onChainArticle ? onChainArticle.price === 0n : false;
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
      const res = await fetch(`/api/articles/${slug}`);

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
    if (!onChainArticle) return;

    setPayingEth(true);
    try {
      await writeContractAsync({
        functionName: "payForArticle",
        args: [slug],
        value: onChainArticle.price,
      });

      notification.success("Payment successful!");
      await refetchHasPaid();
      await fetchContent();
    } catch (e: unknown) {
      const message = (e as any)?.shortMessage || (e instanceof Error ? e.message : "Payment failed.");
      notification.error(message);
    } finally {
      setPayingEth(false);
    }
  };

  // Pay with USDC (x402) — requires Base Sepolia
  const handlePayUsdc = async () => {
    if (!walletClient || !address) {
      notification.error("Wallet not connected.");
      return;
    }

    setPayingUsdc(true);
    const previousChainId = activeChainId;
    try {
      // x402 settles on Base Sepolia — switch chain if needed
      if (activeChainId !== baseSepolia.id) {
        await switchChainAsync({ chainId: baseSepolia.id });
      }

      const signer = {
        address: address as `0x${string}`,
        signTypedData: (msg: {
          domain: Record<string, unknown>;
          types: Record<string, unknown>;
          primaryType: string;
          message: Record<string, unknown>;
        }) => walletClient.signTypedData(msg as any),
      };

      const client = new x402Client();
      registerExactEvmScheme(client, { signer });
      const fetchWithPayment = wrapFetchWithPayment(fetch, client);

      const res = await fetchWithPayment(`/api/articles/${slug}/x402`);

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Payment failed" }));
        notification.error(data.error || "USDC payment failed.");
        return;
      }

      const data: ArticleContent = await res.json();
      setArticleContent(data);
      setFetchStatus("loaded");
      notification.success("Payment successful!");
      await refetchHasPaid();
      checkIntegrity(data.body);
    } catch (e: unknown) {
      const message = (e as any)?.shortMessage || (e instanceof Error ? e.message : "USDC payment failed.");
      notification.error(message);
    } finally {
      // Switch back to the original chain
      if (previousChainId && previousChainId !== baseSepolia.id) {
        await switchChainAsync({ chainId: previousChainId }).catch(() => {});
      }
      setPayingUsdc(false);
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
          <div className="badge badge-lg badge-primary">
            {isFree ? "Free" : `${formatEther(onChainArticle.price)} ETH`}
          </div>
        </div>

        {/* Paywall card */}
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body items-center text-center">
            <h2 className="card-title text-xl">This article requires payment</h2>
            <p className="text-base-content/70 mb-4">
              Pay {formatEther(onChainArticle.price)} ETH or ${formatUnits(onChainArticle.price, 18)} USDC to read the
              full article.
            </p>

            {fetchError && <p className="text-error text-sm mb-2">{fetchError}</p>}

            {!address ? (
              <p className="text-base-content/70">Connect your wallet to pay.</p>
            ) : !session?.address ? (
              <p className="text-base-content/70">Sign in with your wallet to pay.</p>
            ) : (
              <div className="flex gap-4">
                <button className="btn btn-primary" onClick={handlePayEth} disabled={isPaying}>
                  {payingEth ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Paying...
                    </>
                  ) : (
                    `Pay ${formatEther(onChainArticle.price)} ETH`
                  )}
                </button>
                <button className="btn btn-secondary" onClick={handlePayUsdc} disabled={isPaying}>
                  {payingUsdc ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Paying...
                    </>
                  ) : (
                    `Pay $${formatUnits(onChainArticle.price, 18)} USDC`
                  )}
                </button>
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
          <span>{isFree ? "Free" : `${formatEther(onChainArticle.price)} ETH`}</span>
          {integrityOk === true && <span className="badge badge-success badge-sm">Verified</span>}
        </div>
      </div>

      {/* Article body */}
      <article className="prose max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{articleContent?.body || ""}</ReactMarkdown>
      </article>
    </div>
  );
};

export default ArticlePage;
