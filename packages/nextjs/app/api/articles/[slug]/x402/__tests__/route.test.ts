import { NextRequest } from "next/server";
import { GET } from "../route";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------- mocks (vi.hoisted runs before vi.mock factories) ----------

const { mockReadContract, mockLimit, mockDbChain, mockSettlePayment, mockWriteContract, MOCK_CONTRACT } = vi.hoisted(
  () => {
    const mockReadContract = vi.fn();
    const mockWriteContract = vi.fn();
    const mockLimit = vi.fn();
    const mockDbChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: mockLimit,
    };
    const MOCK_CONTRACT = { address: "0x1234567890abcdef1234567890abcdef12345678", abi: [] };
    const mockSettlePayment = vi.fn();
    return { mockReadContract, mockWriteContract, mockLimit, mockDbChain, mockSettlePayment, MOCK_CONTRACT };
  },
);

vi.mock("~~/services/web3/serverClient", () => ({
  publicClient: { readContract: mockReadContract },
  paypinkContract: MOCK_CONTRACT,
}));

vi.mock("~~/services/web3/serverWallet", () => ({
  getServerWallet: vi.fn(() => ({
    writeContract: mockWriteContract,
    account: { address: "0xSERVER" },
  })),
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

vi.mock("thirdweb/x402", () => ({
  settlePayment: mockSettlePayment,
  facilitator: vi.fn(() => ({ type: "mock-facilitator" })),
}));

vi.mock("thirdweb", () => ({
  createThirdwebClient: vi.fn(() => ({ type: "mock-client" })),
}));

vi.mock("thirdweb/chains", () => ({
  defineChain: vi.fn((id: number) => ({ id, type: "mock-chain" })),
}));

vi.mock("../helpers", () => ({
  getX402Chain: vi.fn(() => ({ id: 763373, type: "mock-chain" })),
  thirdwebFacilitator: { type: "mock-facilitator" },
}));

// ---------- helpers ----------

function makeRequest(slug: string, headers?: Record<string, string>) {
  const url = new URL(`http://localhost/api/articles/${slug}/x402`);
  return new NextRequest(url, { headers });
}

function routeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
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
const MOCK_PAYER = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";

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

      const res = await GET(makeRequest("test-article"), routeParams("test-article"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        slug: "test-article",
        title: "Test Title",
        body: "# Hello World",
        creatorAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
      });
      expect(mockSettlePayment).not.toHaveBeenCalled();
    });

    it("returns 404 when free article is not in DB", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 0n }));
      mockLimit.mockResolvedValue([]);

      const res = await GET(makeRequest("nonexistent"), routeParams("nonexistent"));

      expect(res.status).toBe(404);
    });

    it("returns 404 when free article is in DB but status is draft", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 0n }));
      mockLimit.mockResolvedValue(draftArticle);

      const res = await GET(makeRequest("test-article"), routeParams("test-article"));

      expect(res.status).toBe(404);
    });
  });

  describe("article not registered on-chain", () => {
    it("returns 404 when creator is zero address", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ creator: ZERO_ADDRESS }));

      const res = await GET(makeRequest("unregistered-slug"), routeParams("unregistered-slug"));
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toBe("Article not found on-chain");
    });
  });

  describe("paid article — settlePayment delegation", () => {
    it("returns 402 when no payment header is provided", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 1000000000000000000n }));
      mockSettlePayment.mockResolvedValue({
        status: 402,
        responseBody: { paymentRequirements: [] },
        responseHeaders: { "x-payment": "required" },
      });

      const res = await GET(makeRequest("test-article"), routeParams("test-article"));

      expect(res.status).toBe(402);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it("serves content and records payment on-chain when payment settles (x-payment header)", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 1000000000000000000n }));
      mockSettlePayment.mockResolvedValue({
        status: 200,
        responseHeaders: {},
        paymentReceipt: { success: true, transaction: "0xtx", network: "eip155:763373", payer: MOCK_PAYER },
      });
      mockLimit.mockResolvedValue(publishedArticle);
      mockWriteContract.mockResolvedValue(undefined);

      const res = await GET(
        makeRequest("test-article", { "x-payment": "mock-payment-data" }),
        routeParams("test-article"),
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        slug: "test-article",
        title: "Test Title",
        body: "# Hello World",
        creatorAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
      });
      // $1.00 article → 1_000000 USDC (6 decimals)
      // Address is EIP-55 checksummed by getAddress() in the route
      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "recordX402Payment",
          args: ["test-article", expect.stringMatching(/^0x[a-fA-F0-9]{40}$/), 1_000000n],
        }),
      );
    });

    it("accepts v2 payment-signature header", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 1000000000000000000n }));
      mockSettlePayment.mockResolvedValue({
        status: 200,
        responseHeaders: {},
        paymentReceipt: { success: true, transaction: "0xtx", network: "eip155:763373", payer: MOCK_PAYER },
      });
      mockLimit.mockResolvedValue(publishedArticle);
      mockWriteContract.mockResolvedValue(undefined);

      const res = await GET(
        makeRequest("test-article", { "payment-signature": "mock-v2-payment" }),
        routeParams("test-article"),
      );

      expect(res.status).toBe(200);
      expect(mockSettlePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentData: "mock-v2-payment",
        }),
      );
    });
  });

  describe("error handling", () => {
    it("returns 502 when facilitator times out", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 1000000000000000000n }));
      mockSettlePayment.mockRejectedValue(new Error("network timeout"));

      const res = await GET(makeRequest("test-article"), routeParams("test-article"));
      const json = await res.json();

      expect(res.status).toBe(502);
      expect(json.error).toBe("Payment settlement timed out");
    });

    it("returns 502 when on-chain read fails", async () => {
      mockReadContract.mockRejectedValue(new Error("RPC error"));

      const res = await GET(makeRequest("test-article"), routeParams("test-article"));
      const json = await res.json();

      expect(res.status).toBe(502);
      expect(json.error).toBe("Failed to read article from chain");
    });

    it("returns 500 when payer address is missing from settlement receipt", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 1000000000000000000n }));
      mockSettlePayment.mockResolvedValue({
        status: 200,
        responseHeaders: {},
        paymentReceipt: { success: true, transaction: "0xtx", network: "eip155:763373" },
      });

      const res = await GET(makeRequest("test-article"), routeParams("test-article"));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Payment verification failed");
    });

    it("serves content when recordX402Payment reverts with AlreadyPaid", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 1000000000000000000n }));
      mockSettlePayment.mockResolvedValue({
        status: 200,
        responseHeaders: {},
        paymentReceipt: { success: true, transaction: "0xtx", network: "eip155:763373", payer: MOCK_PAYER },
      });
      mockLimit.mockResolvedValue(publishedArticle);
      mockWriteContract.mockRejectedValue(new Error("Paypink__AlreadyPaid"));

      const res = await GET(
        makeRequest("test-article", { "x-payment": "mock-payment-data" }),
        routeParams("test-article"),
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.slug).toBe("test-article");
    });

    it("returns 500 when recordX402Payment fails with non-AlreadyPaid error", async () => {
      mockReadContract.mockResolvedValue(mockOnChainArticle({ price: 1000000000000000000n }));
      mockSettlePayment.mockResolvedValue({
        status: 200,
        responseHeaders: {},
        paymentReceipt: { success: true, transaction: "0xtx", network: "eip155:763373", payer: MOCK_PAYER },
      });
      mockLimit.mockResolvedValue(publishedArticle);
      mockWriteContract.mockRejectedValue(new Error("execution reverted"));

      const res = await GET(
        makeRequest("test-article", { "x-payment": "mock-payment-data" }),
        routeParams("test-article"),
      );
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Failed to record payment");
    });
  });
});
