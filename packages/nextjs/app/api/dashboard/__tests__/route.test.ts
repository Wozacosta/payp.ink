import { NextRequest } from "next/server";
// --- Import after mocks ---
import { GET } from "../route";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const { mockGetAuthAddress, mockDbSelect } = vi.hoisted(() => ({
  mockGetAuthAddress: vi.fn(),
  mockDbSelect: vi.fn(),
}));

vi.mock("~~/services/auth/getAuthAddress", () => ({
  getAuthAddress: (...args: any[]) => mockGetAuthAddress(...args),
}));

vi.mock("~~/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => mockDbSelect(),
        }),
      }),
    }),
  },
}));

vi.mock("~~/db/schema", () => ({
  articles: {
    slug: "slug",
    title: "title",
    status: "status",
    creatorAddress: "creator_address",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => val),
  desc: vi.fn((col: any) => col),
}));

// --- Helpers ---

const CREATOR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function makeRequest(): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/dashboard"));
}

function makeDbArticle(overrides: Record<string, unknown> = {}) {
  return {
    slug: "my-article",
    title: "My Article",
    status: "published",
    createdAt: new Date("2025-01-15T10:00:00Z"),
    ...overrides,
  };
}

// --- Tests ---

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthAddress.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns empty array when creator has no articles", async () => {
    mockGetAuthAddress.mockResolvedValueOnce(CREATOR);
    mockDbSelect.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ articles: [] });
  });

  it("returns creator's articles with correct fields", async () => {
    mockGetAuthAddress.mockResolvedValueOnce(CREATOR);
    mockDbSelect.mockResolvedValueOnce([
      makeDbArticle(),
      makeDbArticle({ slug: "second-post", title: "Second Post", status: "draft" }),
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.articles).toHaveLength(2);
    expect(body.articles[0]).toMatchObject({
      slug: "my-article",
      title: "My Article",
      status: "published",
    });
    expect(body.articles[1]).toMatchObject({
      slug: "second-post",
      title: "Second Post",
      status: "draft",
    });
  });

  it("includes both drafts and published articles", async () => {
    mockGetAuthAddress.mockResolvedValueOnce(CREATOR);
    mockDbSelect.mockResolvedValueOnce([
      makeDbArticle({ status: "draft" }),
      makeDbArticle({ slug: "pub", title: "Published", status: "published" }),
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.articles).toHaveLength(2);
    expect(body.articles[0].status).toBe("draft");
    expect(body.articles[1].status).toBe("published");
  });

  it("returns 500 on database error", async () => {
    mockGetAuthAddress.mockResolvedValueOnce(CREATOR);
    mockDbSelect.mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});
