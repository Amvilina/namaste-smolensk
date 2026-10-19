import type { IncomingMessage, ServerResponse } from "node:http";
import { newExpense, parseExpenseBody, type Expense, type ExpenseStore } from "./expenses.ts";
import { moscowDay, parseDay } from "./sales.ts";
import type { Session } from "./session.ts";

type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  session: Session | null;
  expenses: ExpenseStore;
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

export async function handleExpenses(ctx: Ctx): Promise<boolean> {
  const { req, res, url } = ctx;
  if (!url.pathname.startsWith("/api/expenses")) return false;
  const method = req.method ?? "GET";
  if (!ctx.session || ctx.session.role !== "worker") {
    send(res, ctx.session ? 403 : 401, { error: ctx.session ? "forbidden" : "unauthorized" });
    return true;
  }
  const cookie = ctx.renew(ctx.session);

  if (method === "GET" && url.pathname === "/api/expenses") {
    const items = await ctx.expenses.list();
    items.sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
    send(res, 200, items, cookie);
    return true;
  }

  if (method === "POST" && url.pathname === "/api/expenses") {
    const body = (await readJson(req)) as { category?: unknown; label?: unknown; title?: unknown; lines?: unknown } | null;
    const parsed = parseExpenseBody(body);
    if (!parsed) {
      send(res, 400, { error: "bad" }, cookie);
      return true;
    }
    const now = ctx.now();
    const expense = newExpense(moscowDay(now), parsed, now);
    await ctx.expenses.add(expense);
    send(res, 201, expense, cookie);
    return true;
  }

  const match = url.pathname.match(/^\/api\/expenses\/([0-9a-f-]{36})$/);
  if (method === "PATCH" && match) {
    const body = (await readJson(req)) as { category?: unknown; label?: unknown; title?: unknown; lines?: unknown; day?: unknown } | null;
    const parsed = parseExpenseBody(body);
    const current = (await ctx.expenses.list()).find((item) => item.id === match[1]);
    if (!current) {
      send(res, 404, { error: "missing" }, cookie);
      return true;
    }
    const day = body?.day === undefined ? current.day : parseDay(body.day, moscowDay(ctx.now()));
    if (!parsed || !day) {
      send(res, 400, { error: "bad" }, cookie);
      return true;
    }
    const next: Expense = { ...current, ...parsed, day, updatedAt: new Date(ctx.now()).toISOString() };
    await ctx.expenses.replace(current.id, next);
    send(res, 200, next, cookie);
    return true;
  }

  if (method === "DELETE" && match) {
    const gone = await ctx.expenses.remove(match[1]);
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
