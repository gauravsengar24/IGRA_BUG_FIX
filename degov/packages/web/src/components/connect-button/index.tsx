"use client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, useSwitchChain } from "wagmi";

import { useDaoConfig } from "@/hooks/useDaoConfig";

import { Button } from "../ui/button";

import { Connected } from "./connected";

export const ConnectButton = ({
  onMenuToggle,
}: {
  onMenuToggle?: () => void;
}) => {
  const { openConnectModal } = useConnectModal();
  const dappConfig = useDaoConfig();
  const { chainId, address, isConnected, isConnecting, isReconnecting } =
    useAccount();
  const { switchChain } = useSwitchChain();

  if (isConnecting || isReconnecting) {
    return null;
  }

  if (!isConnected && openConnectModal) {
    return (
      <Button
        onClick={() => {
          openConnectModal();
          onMenuToggle?.();
        }}
        className="rounded-[100px] flex-1 max-w-[200px]"
      >
        Connect Wallet
      </Button>
    );
  }

  if (Number(chainId) !== Number(dappConfig?.chain?.id)) {
    return (
      <Button
        variant="destructive"
        className="rounded-[100px]"
        onClick={() => {
          if (dappConfig?.chain?.id) {
            switchChain({ chainId: Number(dappConfig.chain.id) });
          }
        }}
      >
        Switch Network
      </Button>
    );
  }

  if (address) {
    return (
      <div className="flex items-center gap-[10px]">
        <Connected address={address} onMenuToggle={onMenuToggle} />
      </div>
    );
  }

  return null;
};
