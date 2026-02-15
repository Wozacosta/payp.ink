import { type NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "~~/db";
import { articles } from "~~/db/schema";
import { getAuthAddress } from "~~/services/auth/getAuthAddress";

export async function GET(req: NextRequest) {
  const address = await getAuthAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select({
        slug: articles.slug,
        title: articles.title,
        status: articles.status,
        chainId: articles.chainId,
        createdAt: articles.createdAt,
      })
      .from(articles)
      .where(eq(articles.creatorAddress, address))
      .orderBy(desc(articles.createdAt));

    return NextResponse.json({ articles: rows });
  } catch (e) {
    console.error("Dashboard query error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
