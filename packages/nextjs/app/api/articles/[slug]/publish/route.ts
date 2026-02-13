import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/db";
import { articles } from "~~/db/schema";
import { getAuthAddress } from "~~/services/auth/getAuthAddress";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const address = await getAuthAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const [article] = await db.select().from(articles).where(eq(articles.slug, slug)).limit(1);
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  if (article.creatorAddress.toLowerCase() !== address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (article.status === "published") {
    return NextResponse.json({ slug, status: "published" });
  }

  await db.update(articles).set({ status: "published", updatedAt: new Date() }).where(eq(articles.slug, slug));

  return NextResponse.json({ slug, status: "published" });
}
