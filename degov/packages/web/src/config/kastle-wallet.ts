import { type Wallet } from "@rainbow-me/rainbowkit";
import { createConnector, injected } from "wagmi";

function getWindowProviderNamespace(namespace: string) {
  const walk = (obj: Record<string, any>, ns: string): any => {
    const [property, ...path] = ns.split(".");
    const next = obj[property];
    if (!next) return undefined;
    if (path.length === 0) return next;
    return walk(next, path.join("."));
  };
  if (typeof window === "undefined") return undefined;
  return walk(window as unknown as Record<string, any>, namespace);
}

function createKastleConnector() {
  return (walletDetails: any) => {
    const injectedConfig = {
      target: () => {
        const provider = getWindowProviderNamespace("kastle.ethereum");
        if (!provider) return undefined;
        return {
          id: walletDetails.rkDetails.id,
          name: walletDetails.rkDetails.name,
          provider,
        };
      },
    };
    return createConnector((config) => ({
      ...injected(injectedConfig)(config),
      ...walletDetails,
    }));
  };
}

export function isKastleBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).kastle;
}

export const kastleWallet = (): Wallet => ({
  id: "kastle",
  name: "Kastle",
  iconUrl: "https://media.rhyzome.co/media/kastle-symbol-logo.svg",
  downloadUrls: {
    chrome:
      "https://chromewebstore.google.com/detail/kastle/oambclflhjfppdmkghokjmpppmaebego",
  },
  iconBackground: "#FFFFFF",
  createConnector: createKastleConnector(),
});
