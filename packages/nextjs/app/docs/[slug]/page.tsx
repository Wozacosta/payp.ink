import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getDoc, getDocSlugs, getDocTitle } from "~~/lib/docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return getDocSlugs().map(slug => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const title = getDocTitle(slug);
  return { title: `${title} | Paypink Docs` };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = getDoc(slug);

  if (!content) {
    notFound();
  }

  return (
    <div className="flex justify-center px-4 py-10">
      <article className="prose lg:prose-lg max-w-3xl w-full">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </article>
    </div>
  );
}
