import { type NextRequest, NextResponse } from "next/server";
import { keccak256, toHex } from "viem";
import { db } from "~~/db";
import { articles } from "~~/db/schema";
import { getAuthAddress } from "~~/services/auth/getAuthAddress";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 200;

export async function POST(req: NextRequest) {
  const address = await getAuthAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { slug?: string; title?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { slug, title, body: articleBody } = body;
  if (!slug || !title || !articleBody) {
    return NextResponse.json({ error: "slug, title, and body are required" }, { status: 400 });
  }

  if (slug.length > MAX_SLUG_LENGTH || !SLUG_REGEX.test(slug)) {
    return NextResponse.json(
      { error: "Invalid slug. Use lowercase alphanumeric characters and hyphens, max 200 chars." },
      { status: 400 },
    );
  }

  const contentHash = keccak256(toHex(articleBody));

  try {
    await db.insert(articles).values({
      slug,
      title,
      body: articleBody,
      creatorAddress: address,
    });
  } catch (e: any) {
    const pgCode = e.code ?? e.cause?.code;
    if (pgCode === "23505") {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    console.error("DB insert error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ slug, contentHash }, { status: 201 });
}
