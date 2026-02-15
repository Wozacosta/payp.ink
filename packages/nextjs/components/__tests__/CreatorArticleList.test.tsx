import { CreatorArticleList } from "../CreatorArticleList";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const mockUseScaffoldReadContract = vi.fn();
vi.mock("~~/hooks/scaffold-eth", () => ({
  useScaffoldReadContract: (args: any) => mockUseScaffoldReadContract(args),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// --- Helpers ---

type OffChainArticle = {
  slug: string;
  title: string;
  status: string;
  createdAt: string;
};

type OnChainArticle = {
  slug: string;
  creator: string;
  price: bigint;
  contentHash: string;
  views: bigint;
  earned: bigint;
};

const CREATOR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

function makeOffChainArticle(overrides: Partial<OffChainArticle> = {}): OffChainArticle {
  return {
    slug: "test-article",
    title: "Test Article",
    status: "published",
    createdAt: "2025-01-15T10:00:00.000Z",
    ...overrides,
  };
}

function makeOnChainArticle(overrides: Partial<OnChainArticle> = {}): OnChainArticle {
  return {
    slug: "test-article",
    creator: CREATOR,
    price: 1000000000000000n,
    contentHash: "0x" + "ab".repeat(32),
    views: 42n,
    earned: 5000000000000000n,
    ...overrides,
  };
}

function mockApiResponse(articles: OffChainArticle[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ articles }),
  });
}

function mockApiError(status = 500) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error: "Server error" }),
  });
}

// --- Tests ---

describe("CreatorArticleList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseScaffoldReadContract.mockReturnValue({ data: undefined, isLoading: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading spinner initially", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {})); // never resolves
    render(<CreatorArticleList />);
    expect(screen.getByTestId("articles-loading")).toBeInTheDocument();
  });

  it("shows empty state when creator has no articles", async () => {
    mockApiResponse([]);
    render(<CreatorArticleList />);

    await waitFor(() => {
      expect(screen.getByText(/no articles yet/i)).toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    mockApiError();
    render(<CreatorArticleList />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load articles/i)).toBeInTheDocument();
    });
  });

  it("renders article titles from API", async () => {
    mockApiResponse([
      makeOffChainArticle({ slug: "first", title: "First Post" }),
      makeOffChainArticle({ slug: "second", title: "Second Post" }),
    ]);
    render(<CreatorArticleList />);

    await waitFor(() => {
      expect(screen.getByText("First Post")).toBeInTheDocument();
      expect(screen.getByText("Second Post")).toBeInTheDocument();
    });
  });

  it("shows status badges for articles", async () => {
    mockApiResponse([
      makeOffChainArticle({ slug: "pub", title: "Published", status: "published" }),
      makeOffChainArticle({ slug: "draft", title: "Draft One", status: "draft" }),
    ]);
    render(<CreatorArticleList />);

    await waitFor(() => {
      expect(screen.getByText("published")).toBeInTheDocument();
      expect(screen.getByText("draft")).toBeInTheDocument();
    });
  });

  it("links articles to their reader page", async () => {
    mockApiResponse([makeOffChainArticle({ slug: "my-post", title: "My Post" })]);
    render(<CreatorArticleList />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /My Post/i });
      expect(link).toHaveAttribute("href", "/articles/my-post");
    });
  });

  it("fetches from /api/dashboard", async () => {
    mockApiResponse([]);
    render(<CreatorArticleList />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/dashboard");
    });
  });

  it("shows error when fetch itself throws (network failure)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    render(<CreatorArticleList />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load articles/i)).toBeInTheDocument();
    });
  });

  it("displays on-chain price, views, and earned when data is loaded", async () => {
    mockUseScaffoldReadContract.mockReturnValue({
      data: makeOnChainArticle({ price: 1000000000000000n, views: 42n, earned: 5000000000000000n }),
      isLoading: false,
    });
    mockApiResponse([makeOffChainArticle()]);
    render(<CreatorArticleList />);

    await waitFor(() => {
      expect(screen.getByText("$0.001")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("0.005 ETH")).toBeInTheDocument();
    });
  });

  it("shows 'Free' when on-chain price is zero", async () => {
    mockUseScaffoldReadContract.mockReturnValue({
      data: makeOnChainArticle({ price: 0n }),
      isLoading: false,
    });
    mockApiResponse([makeOffChainArticle()]);
    render(<CreatorArticleList />);

    await waitFor(() => {
      expect(screen.getByText("Free")).toBeInTheDocument();
    });
  });

  it("shows em-dash fallback while on-chain data is loading", async () => {
    mockUseScaffoldReadContract.mockReturnValue({ data: undefined, isLoading: true });
    mockApiResponse([makeOffChainArticle()]);
    render(<CreatorArticleList />);

    await waitFor(() => {
      const dashes = screen.getAllByText("—");
      expect(dashes).toHaveLength(3); // price + views + earned
    });
  });
});
