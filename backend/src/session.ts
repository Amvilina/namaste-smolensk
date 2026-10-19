import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "./users.ts";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;

export type Session = {
  login: string;
  role: Role;
  iat: number;
  exp: number;
};

export function signSession(session: Session, secret: string): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(token: string, secret: string, now: number): Session | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Session>;
    if (typeof parsed.login !== "string" || parsed.login.length === 0) return null;
    if (parsed.role !== "admin" && parsed.role !== "worker") return null;
    if (typeof parsed.iat !== "number" || parsed.iat > now) return null;
    if (now >= parsed.iat + ABSOLUTE_MS) return null;
    if (typeof parsed.exp !== "number" || parsed.exp <= now) return null;
    return { login: parsed.login, role: parsed.role, iat: parsed.iat, exp: parsed.exp };
  } catch {
    return null;
  }
}
