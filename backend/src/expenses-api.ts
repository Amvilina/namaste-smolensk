import type { IncomingMessage, ServerResponse } from "node:http";
import { expensePeriod, newExpense, parseExpenseBody, type Expense, type ExpenseStore } from "./expenses.ts";
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

function anchorDay(role: string, bodyDay: unknown, today: string, fallback: string | null): string | null {
  if (typeof bodyDay === "string") {
    const parsed = parseDay(bodyDay, today);
    if (!parsed || (role !== "admin" && parsed !== today)) return null;
    return parsed;
  }
  if (bodyDay !== undefined) return null;
  return role === "admin" ? fallback : today;
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
  if (!ctx.session || (ctx.session.role !== "worker" && ctx.session.role !== "admin")) {
    send(res, ctx.session ? 403 : 401, { error: ctx.session ? "forbidden" : "unauthorized" });
    return true;
  }
  const cookie = ctx.renew(ctx.session);

  if (method === "GET" && url.pathname === "/api/expenses") {
    const items = await ctx.expenses.list();
    const stamp = (item: Expense) => item.day ?? item.month ?? "";
    items.sort((a, b) => stamp(b).localeCompare(stamp(a)) || b.createdAt.localeCompare(a.createdAt));
    send(res, 200, items, cookie);
    return true;
  }

  if (method === "POST" && url.pathname === "/api/expenses") {
    const body = (await readJson(req)) as { kind?: unknown; name?: unknown; amount?: unknown; month?: unknown; day?: unknown } | null;
    const parsed = parseExpenseBody(body);
    const now = ctx.now();
    const today = moscowDay(now);
    const day = anchorDay(ctx.session.role, body?.day, today, null);
    if (!parsed || !day || (body?.month !== undefined && body.month !== true && body.month !== false)) {
      send(res, 400, { error: "bad" }, cookie);
      return true;
    }
    const expense = newExpense(expensePeriod(body?.month === true, day), parsed, now);
    await ctx.expenses.add(expense);
    send(res, 201, expense, cookie);
    return true;
  }

  const match = url.pathname.match(/^\/api\/expenses\/([0-9a-f-]{36})$/);
  if (method === "PATCH" && match) {
    const body = (await readJson(req)) as { kind?: unknown; name?: unknown; amount?: unknown; month?: unknown; day?: unknown } | null;
    const parsed = parseExpenseBody(body);
    const current = (await ctx.expenses.list()).find((item) => item.id === match[1]);
    if (!current) {
      send(res, 404, { error: "missing" }, cookie);
      return true;
    }
    const today = moscowDay(ctx.now());
    const day = anchorDay(ctx.session.role, body?.day, today, current.day ?? (current.month ? `${current.month}-01` : null));
    if (!parsed || !day || (body?.month !== undefined && body.month !== true && body.month !== false)) {
      send(res, 400, { error: "bad" }, cookie);
      return true;
    }
    const next: Expense = {
      ...current,
      ...parsed,
      ...expensePeriod(body?.month === true, day),
      updatedAt: new Date(ctx.now()).toISOString(),
    };
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
