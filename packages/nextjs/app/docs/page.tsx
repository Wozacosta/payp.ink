import Link from "next/link";
import type { Metadata } from "next";
import { getDocs } from "~~/lib/docs";

export const metadata: Metadata = {
  title: "Docs | Paypink",
};

export default function DocsIndex() {
  const docs = getDocs();

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl grow">
      <h1 className="text-2xl font-bold mb-6">Docs</h1>
      {docs.length === 0 ? (
        <p className="text-base-content/70">No docs available yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {docs.map(doc => (
            <Link
              key={doc.slug}
              href={`/docs/${doc.slug}`}
              className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow"
            >
              <div className="card-body py-4 px-5">
                <h2 className="card-title text-lg">{doc.title}</h2>
                {doc.description && <p className="text-base-content/70 text-sm">{doc.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
