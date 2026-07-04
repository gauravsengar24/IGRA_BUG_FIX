"use client";

class AuthDebug {
  private sessionId = Math.random().toString(36).slice(2, 8);

  log(msg: string): void {
    const ts = Date.now();
    const line = `[auth:${this.sessionId}] ${msg}`;
    console.log(line);
    try {
      fetch("/api/debug-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msg: line, t: ts }),
      }).catch(() => {});
    } catch {}
  }
}

export const authDebug = new AuthDebug();
