"use client";

import { useState } from "react";
import { formatEther, formatUnits } from "viem";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

type CreatorEarningsProps = {
  address: `0x${string}`;
};

export const CreatorEarnings = ({ address }: CreatorEarningsProps) => {
  const [isWithdrawingEth, setIsWithdrawingEth] = useState(false);
  const [isWithdrawingTokens, setIsWithdrawingTokens] = useState(false);

  const { data: ethBalance, isLoading: ethLoading } = useScaffoldReadContract({
    contractName: "Paypink",
    functionName: "getCreatorBalance",
    args: [address],
  });

  const { data: tokenBalance, isLoading: tokenLoading } = useScaffoldReadContract({
    contractName: "Paypink",
    functionName: "creatorTokenBalances",
    args: [address],
  });

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "Paypink" });

  const handleWithdrawEth = async () => {
    setIsWithdrawingEth(true);
    try {
      await writeContractAsync({ functionName: "withdraw" });
      notification.success("ETH withdrawn!");
    } catch (e: unknown) {
      const message = (e as any)?.shortMessage || (e instanceof Error ? e.message : "Withdrawal failed.");
      notification.error(message);
    } finally {
      setIsWithdrawingEth(false);
    }
  };

  const handleWithdrawTokens = async () => {
    setIsWithdrawingTokens(true);
    try {
      await writeContractAsync({ functionName: "withdrawTokens" });
      notification.success("USDC withdrawn!");
    } catch (e: unknown) {
      const message = (e as any)?.shortMessage || (e instanceof Error ? e.message : "Withdrawal failed.");
      notification.error(message);
    } finally {
      setIsWithdrawingTokens(false);
    }
  };

  const ethValue = ethBalance != null ? formatEther(ethBalance) : null;
  const tokenValue = tokenBalance != null ? formatUnits(tokenBalance, 6) : null;

  // Trim trailing zeros for display but keep at least one decimal
  const formatDisplay = (value: string) => {
    const num = parseFloat(value);
    return num % 1 === 0 ? num.toFixed(1) : parseFloat(num.toFixed(6)).toString();
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* ETH Earnings */}
      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body p-5">
          <h3 className="card-title text-sm text-base-content/70">ETH Earnings</h3>
          <div className="flex items-baseline gap-2">
            {ethLoading || ethValue == null ? (
              <span className="loading loading-spinner loading-md" data-testid="loading-spinner"></span>
            ) : (
              <>
                <span className="text-2xl font-bold">{formatDisplay(ethValue)}</span>
                <span className="text-base-content/70">ETH</span>
              </>
            )}
          </div>
          <div className="card-actions mt-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleWithdrawEth}
              disabled={isWithdrawingEth || !ethBalance || ethBalance === 0n}
            >
              {isWithdrawingEth ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Withdrawing...
                </>
              ) : (
                "Withdraw ETH"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* USDC Earnings */}
      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body p-5">
          <h3 className="card-title text-sm text-base-content/70">USDC Earnings</h3>
          <div className="flex items-baseline gap-2">
            {tokenLoading || tokenValue == null ? (
              <span className="loading loading-spinner loading-md" data-testid="loading-spinner"></span>
            ) : (
              <>
                <span className="text-2xl font-bold">{formatDisplay(tokenValue)}</span>
                <span className="text-base-content/70">USDC</span>
              </>
            )}
          </div>
          <div className="card-actions mt-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleWithdrawTokens}
              disabled={isWithdrawingTokens || !tokenBalance || tokenBalance === 0n}
            >
              {isWithdrawingTokens ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Withdrawing...
                </>
              ) : (
                "Withdraw USDC"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
