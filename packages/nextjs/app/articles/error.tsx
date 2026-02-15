"use client";

export default function ArticlesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl grow">
      <div className="alert alert-error">
        <span>Failed to load articles: {error.message}</span>
        <button className="btn btn-sm" onClick={reset}>
          Retry
        </button>
      </div>
    </div>
  );
}
