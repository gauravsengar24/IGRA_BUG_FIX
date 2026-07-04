import * as CryptoJS from "crypto-js";
import { NextResponse } from "next/server";

import { Resp } from "@/types/api";
import { degovGraphqlApi } from "@/utils/remote-api";


import { nonceCache } from "../../common/nonce-cache";

// Define a type for the source of the nonce for better type-safety
type NonceSource = "generated" | "remote";

export async function POST() {
  const t0 = Date.now();
  const log = (step: string) => console.log(`[auth:nonce] ${step} +${Date.now() - t0}ms`);

  let nonce = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
  let source: NonceSource = "generated";

  const graphqlEndpoint = degovGraphqlApi();
  log(`start graphql=${graphqlEndpoint ?? "none"}`);

  if (graphqlEndpoint) {
    try {
      const graphqlQuery = {
        query: `
          query QueryNonce {
            nonce(input: {})
          }
        `,
      };

      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(graphqlQuery),
      });
      log(`graphql-response status=${response.status}`);

      if (!response.ok) {
        throw new Error(
          `GraphQL request failed with status ${response.status}`
        );
      }

      const body = await response.json();

      if (body.data && body.data.nonce) {
        nonce = body.data.nonce;
        source = "remote";
      } else {
        log(`graphql-nonce:missing body=${JSON.stringify(body).slice(0, 200)}`);
      }
    } catch (error) {
      log(`graphql-nonce:error ${error}`);
    }
  }

  nonceCache.set(nonce);
  log(`done source=${source} nonce=${nonce.slice(0, 8)}...`);

  return NextResponse.json(Resp.ok({ nonce, source }));
}
