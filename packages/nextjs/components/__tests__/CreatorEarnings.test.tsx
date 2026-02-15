import { CreatorEarnings } from "../CreatorEarnings";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notification } from "~~/utils/scaffold-eth";

// --- Mocks ---

const mockUseScaffoldReadContract = vi.fn();
const mockWriteContractAsync = vi.fn();
vi.mock("~~/hooks/scaffold-eth", () => ({
  useScaffoldReadContract: (args: any) => mockUseScaffoldReadContract(args),
  useScaffoldWriteContract: () => ({
    writeContractAsync: mockWriteContractAsync,
    isPending: false,
  }),
}));

vi.mock("~~/utils/scaffold-eth", () => ({
  notification: { success: vi.fn(), error: vi.fn() },
}));

// --- Helpers ---

const CREATOR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

function mockBalances(ethBalance: bigint | undefined, tokenBalance: bigint | undefined) {
  mockUseScaffoldReadContract.mockImplementation((args: { functionName: string }) => {
    if (args.functionName === "getCreatorBalance") {
      return { data: ethBalance, isLoading: ethBalance === undefined };
    }
    if (args.functionName === "creatorTokenBalances") {
      return { data: tokenBalance, isLoading: tokenBalance === undefined };
    }
    return { data: undefined, isLoading: true };
  });
}

// --- Tests ---

describe("CreatorEarnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state when data is loading", () => {
    mockBalances(undefined, undefined);
    render(<CreatorEarnings address={CREATOR} />);
    expect(screen.getAllByTestId("loading-spinner").length).toBeGreaterThan(0);
  });

  it("displays ETH balance formatted in ether", () => {
    mockBalances(1000000000000000000n, 0n); // 1 ETH
    render(<CreatorEarnings address={CREATOR} />);
    expect(screen.getByText("1.0")).toBeInTheDocument();
    expect(screen.getByText("ETH")).toBeInTheDocument();
  });

  it("displays token balance formatted with 6 decimals (USDC)", () => {
    mockBalances(0n, 5000000n); // 5 USDC
    render(<CreatorEarnings address={CREATOR} />);
    expect(screen.getByText("5.0")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
  });

  it("displays zero balances", () => {
    mockBalances(0n, 0n);
    render(<CreatorEarnings address={CREATOR} />);
    const zeros = screen.getAllByText("0.0");
    expect(zeros).toHaveLength(2);
  });

  it("disables Withdraw ETH button when ETH balance is zero", () => {
    mockBalances(0n, 0n);
    render(<CreatorEarnings address={CREATOR} />);
    const ethBtn = screen.getByRole("button", { name: /Withdraw ETH/i });
    expect(ethBtn).toBeDisabled();
  });

  it("disables Withdraw USDC button when token balance is zero", () => {
    mockBalances(0n, 0n);
    render(<CreatorEarnings address={CREATOR} />);
    const tokenBtn = screen.getByRole("button", { name: /Withdraw USDC/i });
    expect(tokenBtn).toBeDisabled();
  });

  it("enables Withdraw ETH button when ETH balance > 0", () => {
    mockBalances(1000000000000000n, 0n); // 0.001 ETH
    render(<CreatorEarnings address={CREATOR} />);
    const ethBtn = screen.getByRole("button", { name: /Withdraw ETH/i });
    expect(ethBtn).not.toBeDisabled();
  });

  it("enables Withdraw USDC button when token balance > 0", () => {
    mockBalances(0n, 1000000n); // 1 USDC
    render(<CreatorEarnings address={CREATOR} />);
    const tokenBtn = screen.getByRole("button", { name: /Withdraw USDC/i });
    expect(tokenBtn).not.toBeDisabled();
  });

  it("calls withdraw() on ETH withdraw click", async () => {
    mockWriteContractAsync.mockResolvedValueOnce(undefined);
    mockBalances(1000000000000000000n, 0n);
    render(<CreatorEarnings address={CREATOR} />);

    fireEvent.click(screen.getByRole("button", { name: /Withdraw ETH/i }));

    await waitFor(() => {
      expect(mockWriteContractAsync).toHaveBeenCalledWith({
        functionName: "withdraw",
      });
    });
    expect(notification.success).toHaveBeenCalledWith("ETH withdrawn!");
  });

  it("calls withdrawTokens() on USDC withdraw click", async () => {
    mockWriteContractAsync.mockResolvedValueOnce(undefined);
    mockBalances(0n, 5000000n);
    render(<CreatorEarnings address={CREATOR} />);

    fireEvent.click(screen.getByRole("button", { name: /Withdraw USDC/i }));

    await waitFor(() => {
      expect(mockWriteContractAsync).toHaveBeenCalledWith({
        functionName: "withdrawTokens",
      });
    });
    expect(notification.success).toHaveBeenCalledWith("USDC withdrawn!");
  });

  it("shows error notification when ETH withdraw fails", async () => {
    mockWriteContractAsync.mockRejectedValueOnce(new Error("User rejected"));
    mockBalances(1000000000000000000n, 0n);
    render(<CreatorEarnings address={CREATOR} />);

    fireEvent.click(screen.getByRole("button", { name: /Withdraw ETH/i }));

    await waitFor(() => {
      expect(notification.error).toHaveBeenCalledWith("User rejected");
    });
  });

  it("shows shortMessage from contract error when available", async () => {
    mockWriteContractAsync.mockRejectedValueOnce({ shortMessage: "Insufficient balance" });
    mockBalances(1000000000000000000n, 0n);
    render(<CreatorEarnings address={CREATOR} />);

    fireEvent.click(screen.getByRole("button", { name: /Withdraw ETH/i }));

    await waitFor(() => {
      expect(notification.error).toHaveBeenCalledWith("Insufficient balance");
    });
  });

  it("shows error notification when USDC withdraw fails", async () => {
    mockWriteContractAsync.mockRejectedValueOnce(new Error("tx reverted"));
    mockBalances(0n, 5000000n);
    render(<CreatorEarnings address={CREATOR} />);

    fireEvent.click(screen.getByRole("button", { name: /Withdraw USDC/i }));

    await waitFor(() => {
      expect(notification.error).toHaveBeenCalledWith("tx reverted");
    });
  });
});
