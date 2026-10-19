import type { IncomingMessage, ServerResponse } from "node:http";
import type { CatalogDish } from "./catalog.ts";
import { moscowDay, newSale, parseDay, parseLines, parsePay, type Sale, type SalesStore } from "./sales.ts";
import type { Session } from "./session.ts";

type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  session: Session | null;
  sales: SalesStore;
  catalog: CatalogDish[];
  now: () => number;
  renew: (session: Session) => string;
};

function send(res: ServerResponse, status: number, body: unknown, cookie?: string): void {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (cookie) headers["set-cookie"] = cookie;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > 32_768) return null;
    chunks.push(buf);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function workerCookie(ctx: Ctx): string | null {
  if (!ctx.session || ctx.session.role !== "worker") return null;
  return ctx.renew(ctx.session);
}

export async function handleApi(ctx: Ctx): Promise<boolean> {
  const { req, res, url } = ctx;
  const method = req.method ?? "GET";
  if (!url.pathname.startsWith("/api/")) return false;

  if (method === "GET" && url.pathname === "/api/me") {
    if (!ctx.session) {
      send(res, 401, { error: "unauthorized" });
      return true;
    }
    send(res, 200, { login: ctx.session.login, role: ctx.session.role }, ctx.renew(ctx.session));
    return true;
  }

  const cookie = workerCookie(ctx);
  if (!cookie) {
    send(res, ctx.session ? 403 : 401, { error: ctx.session ? "forbidden" : "unauthorized" });
    return true;
  }

  if (method === "GET" && url.pathname === "/api/menu") {
    send(res, 200, ctx.catalog, cookie);
    return true;
  }

  if (method === "GET" && url.pathname === "/api/sales") {
    const sales = await ctx.sales.list();
    sales.sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
    send(res, 200, sales, cookie);
    return true;
  }

  if (method === "POST" && url.pathname === "/api/sales") {
    const body = (await readJson(req)) as { lines?: unknown; pay?: unknown } | null;
    const lines = parseLines(body?.lines, ctx.catalog);
    const pay = parsePay(body?.pay, "cash");
    if (!lines || !pay) {
      send(res, 400, { error: "bad" }, cookie);
      return true;
    }
    const now = ctx.now();
    const sale = newSale(moscowDay(now), lines, now, pay);
    await ctx.sales.add(sale);
    send(res, 201, sale, cookie);
    return true;
  }

  const match = url.pathname.match(/^\/api\/sales\/([0-9a-f-]{36})$/);
  if (method === "PATCH" && match) {
    const body = (await readJson(req)) as { lines?: unknown; day?: unknown; pay?: unknown } | null;
    const lines = parseLines(body?.lines, ctx.catalog);
    const today = moscowDay(ctx.now());
    const day = parseDay(body?.day, today);
    const current = (await ctx.sales.list()).find((sale) => sale.id === match[1]);
    if (!current) {
      send(res, 404, { error: "missing" }, cookie);
      return true;
    }
    const pay = parsePay(body?.pay, current.pay === "card" ? "card" : "cash");
    if (!lines || !day || !pay) {
      send(res, 400, { error: "bad" }, cookie);
      return true;
    }
    const next: Sale = { ...current, day, pay, lines, updatedAt: new Date(ctx.now()).toISOString() };
    await ctx.sales.replace(current.id, next);
    send(res, 200, next, cookie);
    return true;
  }

  if (method === "DELETE" && match) {
    const gone = await ctx.sales.remove(match[1]);
    if (!gone) {
      send(res, 404, { error: "missing" }, cookie);
      return true;
    }
    send(res, 200, { ok: true }, cookie);
    return true;
  }

  send(res, 404, { error: "missing" }, cookie);
  return true;
}
