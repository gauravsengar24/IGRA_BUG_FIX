"use client";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";

import { siweService } from "@/lib/auth/siwe-service";
import { authDebug } from "@/lib/auth/debug";

const nonceSourceMap = new Map<string, "generated" | "remote">();

export const authenticationAdapter = createAuthenticationAdapter({
  getNonce: async () => {
    authDebug.log("getNonce:start");
    try {
      const { nonce, source } = await siweService.getNonce();
      nonceSourceMap.set(nonce, source);
      authDebug.log(`getNonce:ok source=${source} nonce=${nonce.slice(0, 8)}...`);
      return nonce;
    } catch (err) {
      authDebug.log(`getNonce:error ${err}`);
      throw err;
    }
  },

  createMessage: ({ nonce, address, chainId }) => {
    authDebug.log(`createMessage address=${address} chainId=${chainId}`);
    return siweService.createMessage({ address, nonce, chainId });
  },

  verify: async ({ message, signature }) => {
    authDebug.log(`verify:start sig=${String(signature).slice(0, 10)}...`);

    try {
      await siweService.signOut();
      authDebug.log("verify:cleared-old-tokens");
    } catch (err) {
      authDebug.log(`verify:signOut-error ${err}`);
    }

    const lines = message.split("\n");
    const addressLine = lines.find((line) =>
      line.trim().match(/^0x[a-fA-F0-9]{40}$/)
    );
    if (!addressLine) {
      authDebug.log("verify:error cannot-parse-address");
      return false;
    }
    const address = addressLine.trim() as `0x${string}`;

    const nonceLine = lines.find((line) => line.startsWith("Nonce: "));
    const nonce = nonceLine?.replace("Nonce: ", "") || "";
    const nonceSource = nonceSourceMap.get(nonce);
    authDebug.log(`verify:parsed address=${address} nonceSource=${nonceSource ?? "NOT_FOUND"}`);

    try {
      authDebug.log("verify:calling-verifySignature");
      const result = await siweService.verifySignature({
        message,
        signature: signature as `0x${string}`,
        address: address as `0x${string}`,
        nonceSource,
      });

      authDebug.log(`verify:result success=${result.success} error=${result.error ?? "none"}`);

      if (nonce) {
        nonceSourceMap.delete(nonce);
      }

      return result.success;
    } catch (err) {
      authDebug.log(`verify:exception ${err}`);
      return false;
    }
  },

  signOut: async () => {
    authDebug.log("signOut:called");
    await siweService.signOut();
    nonceSourceMap.clear();
  },
});
