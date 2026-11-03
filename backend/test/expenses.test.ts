import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { memoryExpenses } from "../src/expenses.ts";
import { hashPassword } from "../src/passwords.ts";
import { memorySales, moscowDay } from "../src/sales.ts";
import type { StoredUser } from "../src/users.ts";

const secret = "test-session-secret-should-be-long-enough";

async function listen(handler: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function login(base: string, loginName: string, password: string): Promise<string> {
  const response = await fetch(base + "/login", {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ login: loginName, password }).toString(),
  });
  return (response.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";
}

test("воркер пишет затрату или инвестицию, за день или за месяц", async () => {
  const now = Date.parse("2026-10-19T10:00:00Z");
  const users: StoredUser[] = [
    { login: "worker", role: "worker", passwordHash: await hashPassword("worker-pass") },
    { login: "admin", role: "admin", passwordHash: await hashPassword("admin-pass") },
  ];
  const { server, base } = await listen(
    createApp({ users, secret, now: () => now, sales: memorySales(), expenses: memoryExpenses() }),
  );
  try {
    const worker = await login(base, "worker", "worker-pass");
    const created = await fetch(base + "/api/expenses", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ kind: "cost", name: "  Мука  ", amount: 200 }),
    });
    assert.equal(created.status, 201);
    const expense = (await created.json()) as {
      id: string;
      day: string | null;
      month: string | null;
      kind: string;
      name: string;
      amount: number;
    };
    assert.equal(expense.day, moscowDay(now));
    assert.equal(expense.month, null);
    assert.equal(expense.kind, "cost");
    assert.equal(expense.name, "Мука");
    assert.equal(expense.amount, 200);

    const edited = await fetch(base + "/api/expenses/" + expense.id, {
      method: "PATCH",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ kind: "investment", name: "Стол", amount: 400, month: true }),
    });
    assert.equal(edited.status, 200);
    const next = (await edited.json()) as { day: string | null; month: string | null; kind: string; name: string; amount: number };
    assert.equal(next.kind, "investment");
    assert.equal(next.name, "Стол");
    assert.equal(next.amount, 400);
    assert.equal(next.day, null);
    assert.equal(next.month, moscowDay(now).slice(0, 7));

    const future = await fetch(base + "/api/expenses/" + expense.id, {
      method: "PATCH",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ kind: "cost", name: "Мука", amount: 10, day: "2026-10-20" }),
    });
    assert.equal(future.status, 400);

    const bad = await fetch(base + "/api/expenses", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ kind: "other", name: "Пакет", amount: 10 }),
    });
    assert.equal(bad.status, 400);

    const negative = await fetch(base + "/api/expenses", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ kind: "cost", name: "Лампа", amount: -1 }),
    });
    assert.equal(negative.status, 400);

    const removed = await fetch(base + "/api/expenses/" + expense.id, { method: "DELETE", headers: { cookie: worker } });
    assert.equal(removed.status, 200);
    const left = (await (await fetch(base + "/api/expenses", { headers: { cookie: worker } })).json()) as { id: string }[];
    assert.equal(left.some((item) => item.id === expense.id), false);

    const admin = await login(base, "admin", "admin-pass");
    const visible = await fetch(base + "/api/expenses", { headers: { cookie: admin } });
    assert.equal(visible.status, 200);
    const older = await fetch(base + "/api/expenses", {
      method: "POST",
      headers: { cookie: admin, "content-type": "application/json" },
      body: JSON.stringify({ day: "2026-10-18", kind: "cost", name: "Смена", amount: 1, month: true }),
    });
    assert.equal(older.status, 201);
    const olderRow = (await older.json()) as { day: string | null; month: string | null };
    assert.equal(olderRow.day, null);
    assert.equal(olderRow.month, "2026-10");
  } finally {
    server.close();
  }
});
