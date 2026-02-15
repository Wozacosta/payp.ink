"use client";

import { useState } from "react";
import Link from "next/link";
import { EtherInput } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { SignInButton } from "~~/components/SignInButton";
import { useScaffoldWriteContract, useTransactor } from "~~/hooks/scaffold-eth";
import { getErrorMessage } from "~~/utils/getErrorMessage";
import { notification } from "~~/utils/scaffold-eth";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 200;

type FlowStatus = "idle" | "saving-draft" | "registering" | "publishing" | "published";
type FlowStep = "saving-draft" | "registering" | "publishing";

const CreateArticle: NextPage = () => {
  const { address } = useAccount();
  const { data: session } = useSession();

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [price, setPrice] = useState("");
  const [body, setBody] = useState("");
  const [formKey, setFormKey] = useState(0);

  // Flow state
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("idle");
  const [error, setError] = useState("");
  const [savedContentHash, setSavedContentHash] = useState<`0x${string}` | "">("");
  const [savedSlug, setSavedSlug] = useState("");
  const [retryFrom, setRetryFrom] = useState<"registering" | "publishing" | null>(null);

  const { writeContractAsync } = useScaffoldWriteContract("Paypink");
  const writeTx = useTransactor();

  const isSlugValid = slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_REGEX.test(slug);
  const isFormValid = title.trim().length > 0 && isSlugValid && body.trim().length > 0;
  const isBusy = flowStatus !== "idle" && flowStatus !== "published";

  const clearRetryState = () => {
    if (retryFrom) {
      setSavedSlug("");
      setSavedContentHash("");
      setRetryFrom(null);
      setError("");
    }
  };

  const handleSlugChange = (value: string) => {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    clearRetryState();
  };

  const handleFlowError = (e: unknown, step: FlowStep) => {
    const message = getErrorMessage(e);

    if (step === "registering") {
      setError(`Blockchain registration failed: ${message}`);
      setRetryFrom("registering");
    } else if (step === "publishing") {
      setError(`Publishing failed: ${message}`);
      setRetryFrom("publishing");
    } else {
      setError(message);
    }
    setFlowStatus("idle");
  };

  const saveDraft = async (): Promise<{ slug: string; contentHash: `0x${string}` } | null> => {
    setFlowStatus("saving-draft");
    setError("");

    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, title, body }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Unknown error" }));
      if (res.status === 409) {
        setError("This slug already exists. Choose a different one.");
      } else if (res.status === 401) {
        setError("You need to sign in with your wallet first.");
      } else {
        setError(data.error || "Failed to save draft.");
      }
      setFlowStatus("idle");
      return null;
    }

    const data = await res.json();
    setSavedSlug(data.slug);
    setSavedContentHash(data.contentHash);
    return data;
  };

  const registerOnChain = async (articleSlug: string, contentHash: `0x${string}`) => {
    setFlowStatus("registering");
    setError("");

    const priceWei = parseEther(price || "0");

    await writeTx(async () => {
      const hash = await writeContractAsync({
        functionName: "registerArticle",
        args: [articleSlug, priceWei, contentHash],
      });
      if (!hash) throw new Error("Transaction rejected");
      return hash;
    });
  };

  const publishArticle = async (articleSlug: string) => {
    setFlowStatus("publishing");
    setError("");

    const res = await fetch(`/api/articles/${articleSlug}/publish`, {
      method: "PATCH",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(data.error || "Failed to publish article.");
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;

    let currentStep: FlowStep = "saving-draft";
    try {
      const draft = await saveDraft();
      if (!draft) return;

      currentStep = "registering";
      await registerOnChain(draft.slug, draft.contentHash);

      currentStep = "publishing";
      await publishArticle(draft.slug);

      setFlowStatus("published");
      notification.success("Article published!");
    } catch (e: unknown) {
      handleFlowError(e, currentStep);
    }
  };

  const handleRetry = async () => {
    if (!retryFrom || !savedSlug || !savedContentHash) return;

    let currentStep: FlowStep = retryFrom;
    try {
      if (retryFrom === "registering") {
        await registerOnChain(savedSlug, savedContentHash);
        currentStep = "publishing";
        await publishArticle(savedSlug);
      } else {
        await publishArticle(savedSlug);
      }

      setFlowStatus("published");
      setRetryFrom(null);
      notification.success("Article published!");
    } catch (e: unknown) {
      handleFlowError(e, currentStep);
    }
  };

  const resetForm = () => {
    setTitle("");
    setSlug("");
    setPrice("");
    setBody("");
    setSavedSlug("");
    setSavedContentHash("");
    setFlowStatus("idle");
    setError("");
    setRetryFrom(null);
    setFormKey(k => k + 1);
  };

  // Auth guard
  if (!address) {
    return (
      <div className="flex items-center flex-col grow pt-10">
        <h1 className="text-2xl font-bold mb-4">Create Article</h1>
        <p className="text-base-content/70">Connect your wallet to create an article.</p>
      </div>
    );
  }

  if (!session?.address) {
    return (
      <div className="flex items-center flex-col grow pt-10">
        <h1 className="text-2xl font-bold mb-4">Create Article</h1>
        <p className="text-base-content/70 mb-4">Sign in with your wallet to create an article.</p>
        <SignInButton />
      </div>
    );
  }

  // Success state
  if (flowStatus === "published") {
    return (
      <div className="flex items-center flex-col grow pt-10">
        <div className="card bg-base-100 shadow-xl p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">Article Published!</h1>
          <p className="text-base-content/70 mb-6">
            Your article <span className="font-semibold">&ldquo;{title}&rdquo;</span> is now live.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href={`/articles/${savedSlug}`} className="btn btn-primary">
              View Article
            </Link>
            <button className="btn btn-ghost" onClick={resetForm}>
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col grow px-4 py-8 max-w-7xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Create Article</h1>

      {/* Error banner */}
      {error && (
        <div className="alert alert-error mb-6">
          <span>{error}</span>
          {retryFrom && (
            <button className="btn btn-sm" onClick={handleRetry} disabled={isBusy}>
              Retry
            </button>
          )}
        </div>
      )}

      {/* Step indicator */}
      {isBusy && (
        <div className="alert alert-info mb-6">
          <span className="loading loading-spinner loading-sm"></span>
          <span>
            {flowStatus === "saving-draft" && "Saving draft..."}
            {flowStatus === "registering" && "Confirm the transaction in your wallet..."}
            {flowStatus === "publishing" && "Publishing article..."}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Form */}
        <div className="flex flex-col gap-4">
          {/* Title */}
          <fieldset className="fieldset">
            <label className="label font-semibold">Title</label>
            <input
              type="text"
              className="input w-full"
              placeholder="My Article Title"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                clearRetryState();
              }}
              disabled={isBusy}
            />
          </fieldset>

          {/* Slug */}
          <fieldset className="fieldset">
            <label className="label font-semibold">Slug</label>
            <input
              type="text"
              className={`input w-full ${slug.length > 0 && !isSlugValid ? "input-error" : ""}`}
              placeholder="my-article-slug"
              value={slug}
              onChange={e => handleSlugChange(e.target.value)}
              maxLength={MAX_SLUG_LENGTH}
              disabled={isBusy}
            />
            <p className={`label text-xs ${slug.length > 0 && !isSlugValid ? "text-error" : ""}`}>
              {slug.length > 0 && !isSlugValid
                ? "Lowercase letters, numbers, and hyphens only"
                : `${slug.length}/${MAX_SLUG_LENGTH}`}
            </p>
          </fieldset>

          {/* Price */}
          <fieldset className="fieldset">
            <label className="label font-semibold">Price</label>
            <EtherInput
              key={formKey}
              placeholder="0 (free)"
              onValueChange={({ valueInEth }) => {
                setPrice(valueInEth);
                clearRetryState();
              }}
              disabled={isBusy}
            />
          </fieldset>

          {/* Body */}
          <fieldset className="fieldset">
            <label className="label font-semibold">Body (Markdown)</label>
            <textarea
              className="w-full h-96 rounded-lg border border-base-content/20 bg-base-100 p-3 font-mono text-sm focus:outline-none focus:border-base-content"
              placeholder={"# Your Article\n\nWrite your content in **markdown**..."}
              value={body}
              onChange={e => {
                setBody(e.target.value);
                clearRetryState();
              }}
              disabled={isBusy}
            />
          </fieldset>

          {/* Submit */}
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!isFormValid || isBusy}>
            {isBusy ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Publishing...
              </>
            ) : (
              "Publish Article"
            )}
          </button>
        </div>

        {/* Right column: Live Preview */}
        <div className="flex flex-col">
          <label className="label font-semibold">Live Preview</label>
          <div className="card bg-base-100 shadow-sm border border-base-300 p-6 min-h-96 overflow-auto">
            {body ? (
              <article className="prose max-w-none">
                {title && <h1>{title}</h1>}
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              </article>
            ) : (
              <p className="text-base-content/40 italic">Start typing to see the preview...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateArticle;
