import { TipButton } from "../TipButton";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notification } from "~~/utils/scaffold-eth";

// --- Mocks ---

const mockUseAccount = vi.fn();
vi.mock("wagmi", () => ({
  useAccount: () => mockUseAccount(),
}));

const mockWriteContractAsync = vi.fn();
vi.mock("~~/hooks/scaffold-eth", () => ({
  useScaffoldWriteContract: () => ({
    writeContractAsync: mockWriteContractAsync,
  }),
  useTransactor: () => (fn: () => Promise<string>) => fn(),
}));

let capturedOnValueChange: ((val: { valueInEth: string }) => void) | undefined;
vi.mock("@scaffold-ui/components", () => ({
  EtherInput: (props: { onValueChange: (val: { valueInEth: string }) => void; placeholder?: string }) => {
    capturedOnValueChange = props.onValueChange;
    return <input data-testid="ether-input" placeholder={props.placeholder} />;
  },
}));

vi.mock("~~/utils/scaffold-eth", () => ({
  notification: { success: vi.fn(), error: vi.fn() },
}));

// --- Helpers ---

const READER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function renderConnected() {
  mockUseAccount.mockReturnValue({ address: READER_ADDRESS });
  return render(<TipButton slug="my-article" />);
}

function renderDisconnected() {
  mockUseAccount.mockReturnValue({ address: undefined });
  return render(<TipButton slug="my-article" />);
}

function openFormAndSetAmount(amount: string) {
  fireEvent.click(screen.getByText("Tip the author"));
  act(() => {
    capturedOnValueChange?.({ valueInEth: amount });
  });
}

// --- Tests ---

describe("TipButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnValueChange = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when wallet is not connected", () => {
    const { container } = renderDisconnected();
    expect(container.innerHTML).toBe("");
  });

  it("shows 'Tip the author' button when connected", () => {
    renderConnected();
    expect(screen.getByText("Tip the author")).toBeInTheDocument();
  });

  it("opens tip form when button is clicked", () => {
    renderConnected();
    fireEvent.click(screen.getByText("Tip the author"));
    expect(screen.getByTestId("ether-input")).toBeInTheDocument();
    expect(screen.getByText("Send tip")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("closes tip form when Cancel is clicked", () => {
    renderConnected();
    fireEvent.click(screen.getByText("Tip the author"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Tip the author")).toBeInTheDocument();
    expect(screen.queryByTestId("ether-input")).not.toBeInTheDocument();
  });

  it("shows error when amount is zero", async () => {
    renderConnected();
    openFormAndSetAmount("0");

    fireEvent.click(screen.getByText("Send tip"));

    await waitFor(() => {
      expect(notification.error).toHaveBeenCalledWith("Enter a tip amount.");
    });
    expect(mockWriteContractAsync).not.toHaveBeenCalled();
  });

  it("shows error when trying to send with no amount", async () => {
    renderConnected();
    fireEvent.click(screen.getByText("Tip the author"));
    fireEvent.click(screen.getByText("Send tip"));

    await waitFor(() => {
      expect(notification.error).toHaveBeenCalledWith("Enter a tip amount.");
    });
    expect(mockWriteContractAsync).not.toHaveBeenCalled();
  });

  it("calls tipBySlug with correct args on successful tip", async () => {
    mockWriteContractAsync.mockResolvedValueOnce("0xabc");
    renderConnected();
    openFormAndSetAmount("0.05");

    fireEvent.click(screen.getByText("Send tip"));

    await waitFor(() => {
      expect(mockWriteContractAsync).toHaveBeenCalledWith({
        functionName: "tipBySlug",
        args: ["my-article"],
        value: 50000000000000000n,
      });
    });
  });

  it("closes form after successful tip", async () => {
    mockWriteContractAsync.mockResolvedValueOnce("0xabc");
    renderConnected();
    openFormAndSetAmount("0.01");

    fireEvent.click(screen.getByText("Send tip"));

    await waitFor(() => {
      expect(screen.getByText("Tip the author")).toBeInTheDocument();
    });
  });

  it("does not crash when contract call fails", async () => {
    mockWriteContractAsync.mockRejectedValueOnce(new Error("User rejected"));
    renderConnected();
    openFormAndSetAmount("0.01");

    fireEvent.click(screen.getByText("Send tip"));

    // Form should remain open (tip failed, user can retry)
    await waitFor(() => {
      expect(screen.getByText("Send tip")).not.toBeDisabled();
    });
  });

  it("disables Send tip button while tipping is in progress", async () => {
    let resolveWrite: () => void = () => {};
    mockWriteContractAsync.mockImplementation(
      () =>
        new Promise<void>(r => {
          resolveWrite = r;
        }),
    );

    renderConnected();
    openFormAndSetAmount("0.01");

    fireEvent.click(screen.getByText("Send tip"));

    await waitFor(() => {
      // "Sending..." is split across <span> (spinner) + text node — use a function matcher
      const sendBtn = screen.getByRole("button", { name: /Sending/i });
      expect(sendBtn).toBeDisabled();
    });

    // Resolve to clean up
    await act(async () => resolveWrite());
  });
});
