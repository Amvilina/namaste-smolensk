import type { IncomingMessage, ServerResponse } from "node:http";
import { loadCatalog, type CatalogDish } from "./catalog.ts";
import { loginPage, emptyPage } from "./pages.ts";
import { handleApi } from "./sales-api.ts";
import { fileSales, type SalesStore } from "./sales.ts";
import { verifyPassword } from "./passwords.ts";
import { ABSOLUTE_MS, readSession, signSession, WEEK_MS, type Session } from "./session.ts";
import { DUMMY_PASSWORD_HASH, users as defaultUsers, type Role, type StoredUser } from "./users.ts";

const COOKIE = "namaste_session";
const MAX_AGE_SEC = WEEK_MS / 1000;
const FAIL_LIMIT = 8;
const FAIL_WINDOW_MS = 10 * 60 * 1000;

export type AppOptions = {
  users?: StoredUser[];
  secret: string;
  now?: () => number;
  catalog?: CatalogDish[];
  sales?: SalesStore;
};

type Failure = { count: number; reset: number };

function home(role: Role): string {
  return role === "admin" ? "/admin" : "/worker";
}

function cookiesOf(req: IncomingMessage): Map<string, string> {
  const map = new Map<string, string>();
  const raw = req.headers.cookie;
  if (!raw) return map;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    map.set(part.slice(0, eq).trim(), decodeURIComponent(part.slice(eq + 1).trim()));
  }
  return map;
}

function clientIp(req: IncomingMessage): string {
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) return real;
  return req.socket.remoteAddress ?? "";
}

function sessionCookie(value: string, maxAge: number): string {
  return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > 4096) break;
    chunks.push(buf);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function sendHtml(res: ServerResponse, status: number, body: string, cookie?: string): void {
  const headers: Record<string, string | string[]> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  if (cookie) headers["set-cookie"] = cookie;
  res.writeHead(status, headers);
  res.end(body);
}

function redirect(res: ServerResponse, location: string, cookie?: string): void {
  const headers: Record<string, string | string[]> = {
    location,
    "cache-control": "no-store",
  };
  if (cookie) headers["set-cookie"] = cookie;
  res.writeHead(302, headers);
  res.end();
}

export function createApp(options: AppOptions) {
  const users = options.users ?? defaultUsers;
  const secret = options.secret;
  const now = options.now ?? Date.now;
  const catalog = options.catalog ?? [];
  const sales = options.sales ?? fileSales(process.env.DATA_DIR ?? "/tmp/namaste");
  const failures = new Map<string, Failure>();

  function openSession(req: IncomingMessage): { user: StoredUser; session: Session } | null {
    const token = cookiesOf(req).get(COOKIE);
    if (!token) return null;
    const session = readSession(token, secret, now());
    if (!session) return null;
    const user = users.find((item) => item.login === session.login && item.role === session.role);
    if (!user) return null;
    return { user, session };
  }

  function renewedCookie(session: Session): string {
    const at = now();
    const exp = Math.min(at + WEEK_MS, session.iat + ABSOLUTE_MS);
    const token = signSession({ login: session.login, role: session.role, iat: session.iat, exp }, secret);
    const maxAge = Math.max(1, Math.floor((exp - at) / 1000));
    return sessionCookie(encodeURIComponent(token), maxAge);
  }

  function blocked(ip: string): boolean {
    const row = failures.get(ip);
    if (!row || row.reset <= now()) return false;
    return row.count >= FAIL_LIMIT;
  }

  function markFailure(ip: string): void {
    const row = failures.get(ip);
    if (!row || row.reset <= now()) {
      failures.set(ip, { count: 1, reset: now() + FAIL_WINDOW_MS });
      return;
    }
    row.count += 1;
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://namaste.local");
    const method = req.method ?? "GET";
    const opened = openSession(req);

    if (
      await handleApi({
        req,
        res,
        url,
        session: opened?.session ?? null,
        sales,
        catalog,
        now,
        renew: renewedCookie,
      })
    ) {
      return;
    }

    if (method === "GET" && url.pathname === "/login") {
      if (opened) {
        redirect(res, home(opened.user.role), renewedCookie(opened.session));
        return;
      }
      sendHtml(res, 200, loginPage(url.searchParams.get("e") === "1"));
      return;
    }

    if (method === "POST" && url.pathname === "/login") {
      if (opened) {
        redirect(res, home(opened.user.role), renewedCookie(opened.session));
        return;
      }
      const ip = clientIp(req);
      const form = await readForm(req);
      const login = form.get("login") ?? "";
      const password = form.get("password") ?? "";
      if (blocked(ip)) {
        sendHtml(res, 429, loginPage(true, login));
        return;
      }
      const found = users.find((item) => item.login === login);
      const ok = await verifyPassword(found?.passwordHash ?? DUMMY_PASSWORD_HASH, password);
      if (!found || !ok) {
        markFailure(ip);
        sendHtml(res, 401, loginPage(true, login));
        return;
      }
      failures.delete(ip);
      const at = now();
      const token = signSession(
        { login: found.login, role: found.role, iat: at, exp: at + WEEK_MS },
        secret,
      );
      redirect(res, home(found.role), sessionCookie(encodeURIComponent(token), MAX_AGE_SEC));
      return;
    }

    if (method === "POST" && url.pathname === "/logout") {
      redirect(res, "/login", sessionCookie("", 0));
      return;
    }

    if (method === "GET" && (url.pathname === "/admin" || url.pathname === "/worker")) {
      if (!opened) {
        const stale = cookiesOf(req).get(COOKIE);
        redirect(res, "/login", stale ? sessionCookie("", 0) : undefined);
        return;
      }
      const page = url.pathname === "/admin" ? "admin" : "worker";
      const cookie = renewedCookie(opened.session);
      if (opened.user.role !== page) {
        redirect(res, home(opened.user.role), cookie);
        return;
      }
      sendHtml(res, 200, emptyPage(page === "admin" ? "Админка" : "Сотрудник"), cookie);
      return;
    }

    res.writeHead(404, { "cache-control": "no-store" });
    res.end();
  };
}
