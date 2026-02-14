import { NextRequest } from "next/server";
// --- Import after mocks ---
import { decodePaymentHeader, getRouteConfig, handler } from "../helpers";
import { GET } from "../route";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks (available inside vi.mock factories) ---

const { mockReadContract, mockDbSelect, mockWriteContract, mockX402Handler } = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
  mockDbSelect: vi.fn(),
  mockWriteContract: vi.fn(),
  mockX402Handler: vi.fn(),
}));

// --- Mock dependencies ---

vi.mock("~~/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockDbSelect(),
        }),
      }),
    }),
  },
}));

vi.mock("~~/db/schema", () => ({
  articles: { slug: "slug" },
}));

vi.mock("~~/services/web3/serverClient", () => ({
  publicClient: { readContract: (...args: any[]) => mockReadContract(...args) },
  paypinkContract: { address: "0x1234567890abcdef1234567890abcdef12345678", abi: [] },
}));

vi.mock("~~/services/web3/serverWallet", () => ({
  getServerWallet: () => ({ writeContract: mockWriteContract }),
}));

vi.mock("x402-next", () => ({
  withX402: () => (req: NextRequest) => mockX402Handler(req),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => val),
}));

// --- Helpers ---

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CREATOR_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const READER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function makeRequest(slug: string, headers?: Record<string, string>): NextRequest {
  const req = new NextRequest(new URL(`http://localhost:3000/api/articles/${slug}/x402`));
  if (headers) {
    Object.entries(headers).forEach(([k, v]) => req.headers.set(k, v));
  }
  return req;
}

function makePaymentHeader(from: string, value: string): string {
  return Buffer.from(JSON.stringify({ payload: { authorization: { from, value } } })).toString("base64");
}

function makeOnChainArticle(overrides: Record<string, unknown> = {}) {
  return {
    slug: "test-article",
    creator: CREATOR_ADDRESS,
    price: 1000000000000000n, // 0.001 ETH
    contentHash: "0x" + "ab".repeat(32),
    views: 5n,
    earned: 0n,
    ...overrides,
  };
}

function makeDbArticle(overrides: Record<string, unknown> = {}) {
  return {
    slug: "test-article",
    title: "Test Article",
    body: "# Hello\n\nArticle content here.",
    creatorAddress: CREATOR_ADDRESS,
    status: "published",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// --- Tests ---

describe("decodePaymentHeader", () => {
  it("returns null when X-PAYMENT header is missing", () => {
    const req = makeRequest("test-article");
    expect(decodePaymentHeader(req)).toBeNull();
  });

  it("decodes payload.authorization format (nested)", () => {
    const header = makePaymentHeader(READER_ADDRESS, "1000000");
    const req = makeRequest("test-article", { "X-PAYMENT": header });
    const result = decodePaymentHeader(req);
    expect(result).toEqual({ from: READER_ADDRESS, value: "1000000" });
  });

  it("decodes authorization format (flat)", () => {
    const header = Buffer.from(JSON.stringify({ authorization: { from: READER_ADDRESS, value: "500" } })).toString(
      "base64",
    );
    const req = makeRequest("test-article", { "X-PAYMENT": header });
    const result = decodePaymentHeader(req);
    expect(result).toEqual({ from: READER_ADDRESS, value: "500" });
  });

  it("prefers payload.authorization over authorization when both present", () => {
    const header = Buffer.from(
      JSON.stringify({
        payload: { authorization: { from: READER_ADDRESS, value: "100" } },
        authorization: { from: CREATOR_ADDRESS, value: "200" },
      }),
    ).toString("base64");
    const req = makeRequest("test-article", { "X-PAYMENT": header });
    const result = decodePaymentHeader(req);
    expect(result).toEqual({ from: READER_ADDRESS, value: "100" });
  });

  it("returns null on invalid base64", () => {
    const req = makeRequest("test-article", { "X-PAYMENT": "not-valid-base64!!!" });
    expect(decodePaymentHeader(req)).toBeNull();
  });

  it("returns null on non-JSON payload", () => {
    const header = Buffer.from("not json at all").toString("base64");
    const req = makeRequest("test-article", { "X-PAYMENT": header });
    expect(decodePaymentHeader(req)).toBeNull();
  });
});

describe("handler (paid article flow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when article is not in DB", async () => {
    mockDbSelect.mockResolvedValueOnce([]);
    const req = makeRequest("nonexistent", { "X-PAYMENT": makePaymentHeader(READER_ADDRESS, "1000") });
    const res = await handler(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Article not found" });
  });

  it("returns 404 when article is a draft", async () => {
    mockDbSelect.mockResolvedValueOnce([makeDbArticle({ status: "draft" })]);
    const req = makeRequest("draft-article", { "X-PAYMENT": makePaymentHeader(READER_ADDRESS, "1000") });
    const res = await handler(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 when payment header is missing", async () => {
    mockDbSelect.mockResolvedValueOnce([makeDbArticle()]);
    const req = makeRequest("test-article");
    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Payment data not found" });
  });

  it("calls recordX402Payment and serves content on success", async () => {
    mockDbSelect.mockResolvedValueOnce([makeDbArticle()]);
    mockWriteContract.mockResolvedValueOnce("0xtxhash");

    const req = makeRequest("test-article", {
      "X-PAYMENT": makePaymentHeader(READER_ADDRESS, "1000000000000000"),
    });
    const res = await handler(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slug).toBe("test-article");
    expect(body.title).toBe("Test Article");
    expect(body.body).toContain("Article content here.");
    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "recordX402Payment",
        args: ["test-article", READER_ADDRESS, 1000000000000000n],
      }),
    );
  });

  it("still serves content when recordX402Payment reverts with AlreadyPaid", async () => {
    mockDbSelect.mockResolvedValueOnce([makeDbArticle()]);
    mockWriteContract.mockRejectedValueOnce(new Error("Paypink__AlreadyPaid"));

    const req = makeRequest("test-article", {
      "X-PAYMENT": makePaymentHeader(READER_ADDRESS, "1000000000000000"),
    });
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect((await res.json()).slug).toBe("test-article");
  });

  it("returns 500 when recordX402Payment fails with non-AlreadyPaid error", async () => {
    mockDbSelect.mockResolvedValueOnce([makeDbArticle()]);
    mockWriteContract.mockRejectedValueOnce(new Error("out of gas"));

    const req = makeRequest("test-article", {
      "X-PAYMENT": makePaymentHeader(READER_ADDRESS, "1000000000000000"),
    });
    const res = await handler(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to record payment" });
  });
});

describe("getRouteConfig (dynamic pricing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default $0.01 when slug is missing", async () => {
    // URL with no slug segment before /x402 — construct a URL that .at(-2) yields empty
    const req = new NextRequest(new URL("http://localhost:3000/x402"));
    const config = await getRouteConfig(req);
    expect(config.price).toBe("$0.01");
    expect(config.network).toBe("base-sepolia");
  });

  it("formats price from wei to USD (0.001 ETH → $0.00 rounds to $0.01 minimum)", async () => {
    mockReadContract.mockResolvedValueOnce(makeOnChainArticle({ price: 1000000000000000n })); // 0.001 ETH
    const req = makeRequest("test-article");
    const config = await getRouteConfig(req);
    expect(config.price).toBe("$0.01");
  });

  it("formats 1 ETH as $1.00", async () => {
    mockReadContract.mockResolvedValueOnce(makeOnChainArticle({ price: 1000000000000000000n })); // 1 ETH
    const req = makeRequest("test-article");
    const config = await getRouteConfig(req);
    expect(config.price).toBe("$1.00");
  });

  it("formats 0.555 ETH as $0.56 (rounds up)", async () => {
    mockReadContract.mockResolvedValueOnce(makeOnChainArticle({ price: 555000000000000000n }));
    const req = makeRequest("test-article");
    const config = await getRouteConfig(req);
    expect(config.price).toBe("$0.56");
  });

  it("enforces $0.01 minimum floor", async () => {
    mockReadContract.mockResolvedValueOnce(makeOnChainArticle({ price: 1n })); // tiny wei amount
    const req = makeRequest("test-article");
    const config = await getRouteConfig(req);
    expect(config.price).toBe("$0.01");
  });

  it("includes article description in config", async () => {
    mockReadContract.mockResolvedValueOnce(makeOnChainArticle({ price: 1000000000000000000n }));
    const req = makeRequest("test-article");
    const config = await getRouteConfig(req);
    expect(config.config).toEqual({ description: "Access article: test-article" });
  });

  it("falls back to $0.01 when readContract throws", async () => {
    mockReadContract.mockRejectedValueOnce(new Error("RPC down"));
    const req = makeRequest("test-article");
    const config = await getRouteConfig(req);
    expect(config.price).toBe("$0.01");
    expect(config.network).toBe("base-sepolia");
  });
});

describe("GET (routing wrapper)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockX402Handler.mockImplementation(
      () =>
        new Response(JSON.stringify({ x402: true }), {
          status: 402,
          headers: { "Content-Type": "application/json" },
        }),
    );
  });

  it("returns 404 when article is not registered on-chain (zero address creator)", async () => {
    mockReadContract.mockResolvedValueOnce(makeOnChainArticle({ creator: ZERO_ADDRESS }));

    const res = await GET(makeRequest("unregistered-article"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Article not found on-chain");
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockX402Handler).not.toHaveBeenCalled();
  });

  it("serves free article directly (bypasses x402) when price is 0", async () => {
    mockReadContract.mockResolvedValueOnce(makeOnChainArticle({ price: 0n }));
    mockDbSelect.mockResolvedValueOnce([makeDbArticle()]);

    const res = await GET(makeRequest("test-article"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slug).toBe("test-article");
    expect(body.title).toBe("Test Article");
    expect(mockX402Handler).not.toHaveBeenCalled();
  });

  it("falls through to x402 handler when article has a price", async () => {
    mockReadContract.mockResolvedValueOnce(makeOnChainArticle({ price: 1000000000000000n }));

    const req = makeRequest("test-article");
    await GET(req);

    expect(mockX402Handler).toHaveBeenCalledWith(req);
  });

  it("falls through to x402 handler when readContract throws", async () => {
    mockReadContract.mockRejectedValueOnce(new Error("RPC error"));

    const req = makeRequest("test-article");
    await GET(req);

    expect(mockX402Handler).toHaveBeenCalledWith(req);
  });

  it("falls through to x402 for free article not found in DB", async () => {
    mockReadContract.mockResolvedValueOnce(makeOnChainArticle({ price: 0n }));
    mockDbSelect.mockResolvedValueOnce([]);

    const req = makeRequest("test-article");
    await GET(req);

    expect(mockX402Handler).toHaveBeenCalledWith(req);
  });

  it("falls through to x402 for free article that is still a draft", async () => {
    mockReadContract.mockResolvedValueOnce(makeOnChainArticle({ price: 0n }));
    mockDbSelect.mockResolvedValueOnce([makeDbArticle({ status: "draft" })]);

    const req = makeRequest("test-article");
    await GET(req);

    expect(mockX402Handler).toHaveBeenCalledWith(req);
  });
});
