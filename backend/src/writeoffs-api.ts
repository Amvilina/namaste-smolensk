import type { IncomingMessage, ServerResponse } from "node:http";
import { moscowDay, parseDay } from "./sales.ts";
import type { Session } from "./session.ts";
import { newWriteoff, parseWriteoffBody, type Writeoff, type WriteoffStore } from "./writeoffs.ts";

type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  session: Session | null;
  writeoffs: WriteoffStore;
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

export async function handleWriteoffs(ctx: Ctx): Promise<boolean> {
  const { req, res, url } = ctx;
  if (!url.pathname.startsWith("/api/writeoffs")) return false;
  const method = req.method ?? "GET";
  if (!ctx.session || ctx.session.role !== "worker") {
    send(res, ctx.session ? 403 : 401, { error: ctx.session ? "forbidden" : "unauthorized" });
    return true;
  }
  const cookie = ctx.renew(ctx.session);

  if (method === "GET" && url.pathname === "/api/writeoffs") {
    const items = await ctx.writeoffs.list();
    items.sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
    send(res, 200, items, cookie);
    return true;
  }

  if (method === "POST" && url.pathname === "/api/writeoffs") {
    const body = (await readJson(req)) as { kind?: unknown; name?: unknown; volume?: unknown } | null;
    const parsed = parseWriteoffBody(body);
    if (!parsed) {
      send(res, 400, { error: "bad" }, cookie);
      return true;
    }
    const now = ctx.now();
    const item = newWriteoff(moscowDay(now), parsed, now);
    await ctx.writeoffs.add(item);
    send(res, 201, item, cookie);
    return true;
  }

  const match = url.pathname.match(/^\/api\/writeoffs\/([0-9a-f-]{36})$/);
  if (method === "PATCH" && match) {
    const body = (await readJson(req)) as { kind?: unknown; name?: unknown; volume?: unknown; day?: unknown } | null;
    const parsed = parseWriteoffBody(body);
    const current = (await ctx.writeoffs.list()).find((item) => item.id === match[1]);
    if (!current) {
      send(res, 404, { error: "missing" }, cookie);
      return true;
    }
    const day = body?.day === undefined ? current.day : parseDay(body.day, moscowDay(ctx.now()));
    if (!parsed || !day) {
      send(res, 400, { error: "bad" }, cookie);
      return true;
    }
    const next: Writeoff = { ...current, ...parsed, day, updatedAt: new Date(ctx.now()).toISOString() };
    await ctx.writeoffs.replace(current.id, next);
    send(res, 200, next, cookie);
    return true;
  }

  if (method === "DELETE" && match) {
    const gone = await ctx.writeoffs.remove(match[1]);
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
