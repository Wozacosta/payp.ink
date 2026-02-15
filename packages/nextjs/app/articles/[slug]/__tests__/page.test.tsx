// --- Import component statically (mocks are hoisted above) ---
import ArticlePage from "../page";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock external dependencies ---

const mockUseParams = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}));

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockUseAccount = vi.fn();
const mockUseWalletClient = vi.fn();
const mockUseSwitchChain = vi.fn();
vi.mock("wagmi", () => ({
  useAccount: () => mockUseAccount(),
  useWalletClient: () => mockUseWalletClient(),
  useSwitchChain: () => mockUseSwitchChain(),
}));

const mockUseScaffoldReadContract = vi.fn();
const mockWriteContractAsync = vi.fn();
vi.mock("~~/hooks/scaffold-eth", () => ({
  useScaffoldReadContract: (args: any) => mockUseScaffoldReadContract(args),
  useScaffoldWriteContract: () => ({
    writeContractAsync: mockWriteContractAsync,
    isPending: false,
  }),
  useTransactor: () => (fn: () => Promise<string>) => fn(),
}));

vi.mock("@scaffold-ui/components", () => ({
  Address: ({ address }: { address: string }) => <span data-testid="address">{address}</span>,
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  useConnectModal: () => ({ openConnectModal: vi.fn() }),
}));

vi.mock("@x402/core/client", () => ({ x402Client: vi.fn() }));
vi.mock("@x402/evm/exact/client", () => ({ registerExactEvmScheme: vi.fn() }));
vi.mock("@x402/fetch", () => ({ wrapFetchWithPayment: vi.fn() }));

vi.mock("~~/utils/scaffold-eth", () => ({
  notification: { success: vi.fn(), error: vi.fn() },
}));

// --- Constants ---

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CREATOR_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const READER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

type OnChainArticle = {
  slug: string;
  creator: string;
  price: bigint;
  contentHash: string;
  views: bigint;
  earned: bigint;
};

function makeArticle(overrides: Partial<OnChainArticle> = {}): OnChainArticle {
  return {
    slug: "test-article",
    creator: CREATOR_ADDRESS,
    price: 1000000000000000n, // 0.001 ETH
    contentHash: "0x" + "ab".repeat(32),
    views: 5n,
    earned: 3000000000000000n,
    ...overrides,
  };
}

function setupMocks(
  overrides: {
    article?: OnChainArticle | null;
    isLoadingArticle?: boolean;
    hasPaid?: boolean | undefined;
    address?: string | undefined;
    sessionAddress?: string | undefined;
  } = {},
) {
  // Note: can't use destructuring defaults here because `undefined` triggers defaults in JS.
  // `setupMocks({ address: undefined })` would still get READER_ADDRESS with destructuring defaults.
  const article = overrides.article === undefined ? makeArticle() : overrides.article;
  const isLoadingArticle = overrides.isLoadingArticle ?? false;
  const hasPaid = overrides.hasPaid;
  const address = "address" in overrides ? overrides.address : READER_ADDRESS;
  const sessionAddress = "sessionAddress" in overrides ? overrides.sessionAddress : READER_ADDRESS;

  mockUseParams.mockReturnValue({ slug: "test-article" });
  mockUseSession.mockReturnValue({ data: sessionAddress ? { address: sessionAddress } : null });
  mockUseAccount.mockReturnValue({ address, chainId: 763373 });
  mockUseWalletClient.mockReturnValue({ data: null });
  mockUseSwitchChain.mockReturnValue({ switchChainAsync: vi.fn() });

  mockUseScaffoldReadContract.mockImplementation((args: any) => {
    if (args.functionName === "getArticle") {
      return { data: article ?? undefined, isLoading: isLoadingArticle };
    }
    if (args.functionName === "hasPaid") {
      return { data: hasPaid, refetch: vi.fn() };
    }
    if (args.functionName === "getArticlePriceInEth") {
      // Return a realistic ETH amount so pay buttons are enabled
      return { data: article?.price ? 5000000000000000n : 0n, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  });
}

// --- Tests ---

describe("ArticlePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading spinner while article data is loading", () => {
    setupMocks({ isLoadingArticle: true, article: null });
    render(<ArticlePage />);
    expect(screen.getByText("Loading article...")).toBeInTheDocument();
  });

  it("shows 'Article Not Found' when creator is zero address", () => {
    setupMocks({ article: makeArticle({ creator: ZERO_ADDRESS }) });
    render(<ArticlePage />);
    expect(screen.getByText("Article Not Found")).toBeInTheDocument();
  });

  it("shows 'Article Not Found' when article is undefined (not registered)", () => {
    setupMocks({ article: null });
    render(<ArticlePage />);
    expect(screen.getByText("Article Not Found")).toBeInTheDocument();
  });

  it("shows paywall when hasPaid === false and article is paid", async () => {
    setupMocks({ hasPaid: false });
    render(<ArticlePage />);

    await waitFor(() => {
      expect(screen.getByText("This article requires payment")).toBeInTheDocument();
    });
  });

  it("shows 'Connect your wallet' when not connected", async () => {
    setupMocks({ hasPaid: false, address: undefined, sessionAddress: undefined });

    render(<ArticlePage />);

    await waitFor(() => {
      expect(screen.getByText("This article requires payment")).toBeInTheDocument();
    });
    expect(screen.getByText("Connect your wallet to pay.")).toBeInTheDocument();
  });

  it("shows 'Sign in with your wallet' and Sign In button when connected but no session", async () => {
    setupMocks({ hasPaid: false, address: READER_ADDRESS, sessionAddress: undefined });
    render(<ArticlePage />);

    await waitFor(() => {
      expect(screen.getByText("This article requires payment")).toBeInTheDocument();
    });
    expect(screen.getByText("Sign in with your wallet to pay.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("auto-fetches content when article is free", async () => {
    setupMocks({ article: makeArticle({ price: 0n }) });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        slug: "test-article",
        title: "Free Article",
        body: "# Hello\n\nFree content.",
        creatorAddress: CREATOR_ADDRESS,
      }),
    });

    render(<ArticlePage />);

    await waitFor(() => {
      expect(screen.getByText("Free Article")).toBeInTheDocument();
    });
  });

  it("auto-fetches content when user is the creator (paywall bypass)", async () => {
    setupMocks({
      address: CREATOR_ADDRESS,
      sessionAddress: CREATOR_ADDRESS,
      hasPaid: false,
    });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        slug: "test-article",
        title: "My Article",
        body: "Creator content.",
        creatorAddress: CREATOR_ADDRESS,
      }),
    });

    render(<ArticlePage />);

    await waitFor(() => {
      expect(screen.getByText("My Article")).toBeInTheDocument();
    });
  });

  it("renders markdown content after successful fetch", async () => {
    setupMocks({ article: makeArticle({ price: 0n }) });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        slug: "test-article",
        title: "MD Test",
        body: "**bold** and *italic*",
        creatorAddress: CREATOR_ADDRESS,
      }),
    });

    render(<ArticlePage />);

    await waitFor(() => {
      expect(screen.getByText("bold")).toBeInTheDocument();
    });
  });

  it("shows integrity warning when content hash mismatches", async () => {
    const article = makeArticle({
      price: 0n,
      contentHash: "0x" + "ff".repeat(32),
    });
    setupMocks({ article });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        slug: "test-article",
        title: "Tampered",
        body: "Body that does not match the hash.",
        creatorAddress: CREATOR_ADDRESS,
      }),
    });

    render(<ArticlePage />);

    await waitFor(() => {
      expect(screen.getByText(/Content integrity check failed/)).toBeInTheDocument();
    });
  });

  it("enables both pay buttons when no payment is in progress", async () => {
    setupMocks({ hasPaid: false });
    render(<ArticlePage />);

    await waitFor(() => {
      expect(screen.getByText("This article requires payment")).toBeInTheDocument();
    });

    const payButtons = screen
      .getAllByRole("button")
      .filter(b => b.textContent?.includes("ETH") || b.textContent?.includes("USDC"));
    expect(payButtons).toHaveLength(2);
    for (const btn of payButtons) {
      expect(btn).not.toBeDisabled();
    }
  });
});
