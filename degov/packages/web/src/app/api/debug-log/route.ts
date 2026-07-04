import { appendFileSync } from "fs";
import { NextResponse } from "next/server";

const LOG_FILE = "/tmp/degov-auth-debug.log";

export async function POST(request: Request) {
  try {
    const { msg, t } = await request.json();
    const line = `[${new Date(t).toISOString()}] ${msg}\n`;
    console.log(line.trim());
    appendFileSync(LOG_FILE, line);
  } catch {}
  return NextResponse.json({ ok: true });
}
