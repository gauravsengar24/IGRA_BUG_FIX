import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { SiweMessage } from "siwe";

import type { DUser } from "@/types/api";
import { Resp } from "@/types/api";

import * as config from "../../common/config";
import { databaseConnection } from "../../common/database";
import * as graphql from "../../common/graphql";
import { nonceCache } from "../../common/nonce-cache";
import { snowflake } from "../../common/toolkit";

import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const log = (step: string) => console.log(`[auth:login] ${step} +${Date.now() - t0}ms`);
  try {
    log("start");
    const degovConfig = await config.degovConfig(request);
    const daocode = degovConfig.code;

    const jwtSecretKey = process.env.JWT_SECRET_KEY;
    if (!jwtSecretKey) {
      log("error:missing-jwt-secret");
      return NextResponse.json(
        Resp.err("please contact admin about login issue, missing key"),
        { status: 400 }
      );
    }

    const { message, signature } = await request.json();
    log("parsed-body");

    let fields;
    try {
      const siweMessage = new SiweMessage(message);
      fields = await siweMessage.verify({ signature });
      log(`siwe-verify:ok address=${fields.data.address}`);
    } catch (err) {
      log(`siwe-verify:failed ${err}`);
      return NextResponse.json(Resp.err("invalid message"), { status: 400 });
    }

    const nonce = fields.data.nonce;
    const nonceValid = nonceCache.isValid(nonce);
    log(`nonce-check nonce=${nonce.slice(0, 8)}... valid=${nonceValid}`);
    if (!nonceValid) {
      return NextResponse.json(
        Resp.err(`nonce (${nonce}) expired or invalid, please get a new nonce`),
        { status: 400 }
      );
    }

    nonceCache.remove(nonce);

    const address = fields.data.address.toLowerCase();
    const token = await new SignJWT({ address })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5h")
      .sign(new TextEncoder().encode(jwtSecretKey));
    log("jwt-signed");

    const sql = databaseConnection();
    const [storedUser] =
      await sql`select * from d_user where address = ${address} and dao_code = ${daocode} limit 1`;
    log(`db-lookup user=${storedUser ? "existing" : "new"}`);
    if (!storedUser) {
      const contributor = await graphql.inspectContributor({
        address,
        request,
      });
      let power = "0";
      if (contributor) {
        power = contributor.power;
      }
      const hexPower = `0x${BigInt(power).toString(16).padStart(64, "0")}`;

      const newUser: DUser = {
        id: snowflake.generate(),
        dao_code: daocode,
        address,
        power: hexPower,
        last_login_time: new Date().toISOString(),
      };
      await sql`insert into d_user ${sql(
        newUser,
        "id",
        "dao_code",
        "address",
        "last_login_time",
        "power"
      )}`;
      log("db-insert:ok");
    } else {
      storedUser.last_login_time = new Date().toISOString();
      await sql`
        update d_user set
        last_login_time=${storedUser.last_login_time},
        utime=${storedUser.last_login_time}
        where id=${storedUser.id};
      `;
      log("db-update:ok");
    }
    log("success");
    return NextResponse.json(Resp.ok({ token }));
  } catch (err) {
    log(`exception: ${err}`);
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(Resp.errWithData("logion failed", message), {
      status: 400,
    });
  }
}
