import { NextRequest } from "next/server";
// Static import — mocks are hoisted so this resolves against the mocked deps
import { GET } from "../route";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------- mocks (vi.hoisted runs before vi.mock factories) ----------

const { mockReadContract, mockX402Handler, mockLimit, mockDbChain, MOCK_CONTRACT, mockWithX402 } = vi.hoisted(() => {
  const mockReadContract = vi.fn();
  const mockX402Handler = vi.fn();
  const mockLimit = vi.fn();
  const mockDbChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: mockLimit,
  };
  const MOCK_CONTRACT = { address: "0x1234567890abcdef1234567890abcdef12345678", abi: [] };
  const mockWithX402 = vi.fn(() => mockX402Handler);
  return { mockReadContract, mockX402Handler, mockLimit, mockDbChain, MOCK_CONTRACT, mockWithX402 };
});

vi.mock("~~/services/web3/serverClient", () => ({
  publicClient: { readContract: mockReadContract },
  paypinkContract: MOCK_CONTRACT,
}));

vi.mock("~~/services/web3/serverWallet", () => ({
  getServerWallet: vi.fn(),
}));

vi.mock("~~/db", () => ({
  db: { select: vi.fn(() => mockDbChain) },
}));

vi.mock("~~/db/schema", () => ({
  articles: { slug: "slug" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
}));

vi.mock("x402-next", () => ({
  withX402: mockWithX402,
}));

// ---------- helpers ----------

function makeRequest(slug: string) {
  return new NextRequest(new URL(`http://localhost/api/articles/${slug}/x402`));
}

function mockOnChainArticle(overrides: Partial<{ creator: string; price: bigint }> = {}) {
  return {
    slug: "test-article",
    creator: overrides.creator ?? "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
    price: overrides.price ?? 0n,
    contentHash: "0xabc",
    views: 0n,
    earned: 0n,
  };
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// drizzle .limit(1) returns an array
const publishedArticle = [
  {
    slug: "test-article",
    title: "Test Title",
    body: "# Hello World",
    creatorAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
    status: "published" as const,
    chainId: 31337,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const draftArticle = [
  {
    ...publishedArticle[0],
    status: "draft" as const,
  },
];

// ---------- tests ----------

describe("GET /api/articles/[slug]/x402", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore the chainable after clearAllMocks wipes mockReturnThis
    mockDbChain.from.mockReturnThis();
    mockDbChain.where.mockReturnThis();
  });

  describe("free article bypass", () => {
    it("serves content directly when article is free and published", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 0n }));
      mockLimit.mockResolvedValue(publishedArticle);

      const res = await GET(makeRequest("test-article"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        slug: "test-article",
        title: "Test Title",
        body: "# Hello World",
        creatorAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
      });
      expect(mockX402Handler).not.toHaveBeenCalled();
    });

    it("returns 404 when free article is not in DB", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 0n }));
      mockLimit.mockResolvedValue([]);

      const res = await GET(makeRequest("nonexistent"));

      expect(res.status).toBe(404);
      expect(mockX402Handler).not.toHaveBeenCalled();
    });

    it("returns 404 when free article is in DB but status is draft", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 0n }));
      mockLimit.mockResolvedValue(draftArticle);

      const res = await GET(makeRequest("test-article"));

      expect(res.status).toBe(404);
      expect(mockX402Handler).not.toHaveBeenCalled();
    });
  });

  describe("article not registered on-chain", () => {
    it("returns 404 when creator is zero address", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ creator: ZERO_ADDRESS }));

      const res = await GET(makeRequest("unregistered-slug"));
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toBe("Article not found on-chain");
      expect(mockX402Handler).not.toHaveBeenCalled();
    });
  });

  describe("paid article falls through to x402", () => {
    it("delegates to x402Handler when article has a price", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 1000000000000000n }));

      const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 402 });
      mockX402Handler.mockResolvedValue(mockResponse);

      const req = makeRequest("paid-article");
      const res = await GET(req);

      expect(mockX402Handler).toHaveBeenCalledWith(req);
      expect(res.status).toBe(402);
    });

    it("falls through to x402Handler when readContract throws", async () => {
      mockReadContract.mockRejectedValue(new Error("RPC timeout"));

      const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 402 });
      mockX402Handler.mockResolvedValue(mockResponse);

      const req = makeRequest("flaky-rpc");
      const res = await GET(req);

      expect(mockX402Handler).toHaveBeenCalledWith(req);
      expect(res.status).toBe(402);
    });
  });
});
