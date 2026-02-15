"use client";

import { useState } from "react";
import { EtherInput } from "@scaffold-ui/components";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldWriteContract, useTransactor } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

type TipButtonProps = {
  slug: string;
};

export const TipButton = ({ slug }: TipButtonProps) => {
  const { address } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [isTipping, setIsTipping] = useState(false);

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "Paypink" });
  const writeTx = useTransactor();

  const handleTip = async () => {
    // Client-side only guard — the contract does not revert on zero-value tips
    if (!tipAmount || parseFloat(tipAmount) <= 0) {
      notification.error("Enter a tip amount.");
      return;
    }

    setIsTipping(true);
    try {
      await writeTx(async () => {
        const hash = await writeContractAsync({
          functionName: "tipBySlug",
          args: [slug],
          value: parseEther(tipAmount),
        });
        if (!hash) throw new Error("Transaction rejected");
        return hash;
      });
      setTipAmount("");
      setIsOpen(false);
    } catch {
      // useTransactor already shows error notification
    } finally {
      setIsTipping(false);
    }
  };

  if (!address) return null;

  if (!isOpen) {
    return (
      <button className="btn btn-outline btn-sm" onClick={() => setIsOpen(true)}>
        Tip the author
      </button>
    );
  }

  return (
    <div className="card bg-base-200 p-4 flex flex-col gap-3 w-full max-w-sm">
      <h3 className="font-semibold text-sm">Tip the author</h3>
      <EtherInput placeholder="0.01" onValueChange={({ valueInEth }) => setTipAmount(valueInEth)} />
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm flex-1" onClick={handleTip} disabled={isTipping}>
          {isTipping ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Sending...
            </>
          ) : (
            "Send tip"
          )}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setIsOpen(false)} disabled={isTipping}>
          Cancel
        </button>
      </div>
    </div>
  );
};
