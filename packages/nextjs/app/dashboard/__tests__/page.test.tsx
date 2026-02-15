// --- Import after mocks ---
import DashboardPage from "../page";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const mockUseAccount = vi.fn();
vi.mock("wagmi", () => ({
  useAccount: () => mockUseAccount(),
}));

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("~~/components/CreatorEarnings", () => ({
  CreatorEarnings: ({ address }: { address: string }) => (
    <div data-testid="creator-earnings">Earnings for {address}</div>
  ),
}));

vi.mock("~~/components/CreatorArticleList", () => ({
  CreatorArticleList: ({ address }: { address: string }) => (
    <div data-testid="creator-article-list">Articles for {address}</div>
  ),
}));

// --- Helpers ---

const CREATOR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function setupConnectedAndSignedIn() {
  mockUseAccount.mockReturnValue({ address: CREATOR });
  mockUseSession.mockReturnValue({
    data: { address: CREATOR },
    status: "authenticated",
  });
}

function setupConnectedNotSignedIn() {
  mockUseAccount.mockReturnValue({ address: CREATOR });
  mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
}

function setupDisconnected() {
  mockUseAccount.mockReturnValue({ address: undefined });
  mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
}

// --- Tests ---

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows connect wallet message when not connected", () => {
    setupDisconnected();
    render(<DashboardPage />);
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("creator-earnings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("creator-article-list")).not.toBeInTheDocument();
  });

  it("shows sign in message when connected but not signed in", () => {
    setupConnectedNotSignedIn();
    render(<DashboardPage />);
    expect(screen.getByText(/sign in with your wallet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("creator-earnings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("creator-article-list")).not.toBeInTheDocument();
  });

  it("renders earnings and article list when authenticated", () => {
    setupConnectedAndSignedIn();
    render(<DashboardPage />);
    expect(screen.getByTestId("creator-earnings")).toBeInTheDocument();
    expect(screen.getByTestId("creator-article-list")).toBeInTheDocument();
  });

  it("passes address to CreatorEarnings", () => {
    setupConnectedAndSignedIn();
    render(<DashboardPage />);
    expect(screen.getByText(`Earnings for ${CREATOR}`)).toBeInTheDocument();
  });

  it("passes address to CreatorArticleList", () => {
    setupConnectedAndSignedIn();
    render(<DashboardPage />);
    expect(screen.getByText(`Articles for ${CREATOR}`)).toBeInTheDocument();
  });

  it("shows the page title", () => {
    setupConnectedAndSignedIn();
    render(<DashboardPage />);
    expect(screen.getByText("Creator Dashboard")).toBeInTheDocument();
  });

  it("shows the page title even when disconnected", () => {
    setupDisconnected();
    render(<DashboardPage />);
    expect(screen.getByText("Creator Dashboard")).toBeInTheDocument();
  });
});
