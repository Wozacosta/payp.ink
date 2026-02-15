"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";

export const SignInButton = ({ className = "btn btn-primary btn-sm" }: { className?: string }) => {
  const { openConnectModal } = useConnectModal();

  return (
    <button className={className} onClick={openConnectModal} type="button">
      Sign In
    </button>
  );
};
