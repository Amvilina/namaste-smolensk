import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { memoryExpenses } from "../src/expenses.ts";
import { hashPassword } from "../src/passwords.ts";
import { memorySales, moscowDay } from "../src/sales.ts";
import type { StoredUser } from "../src/users.ts";
import { memoryWriteoffs } from "../src/writeoffs.ts";

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

test("воркер списывает блюдо и продукт сразу", async () => {
  const now = Date.parse("2026-10-19T10:00:00Z");
  const users: StoredUser[] = [
    { login: "worker", role: "worker", passwordHash: await hashPassword("worker-pass") },
    { login: "admin", role: "admin", passwordHash: await hashPassword("admin-pass") },
  ];
  const { server, base } = await listen(
    createApp({
      users,
      secret,
      now: () => now,
      sales: memorySales(),
      expenses: memoryExpenses(),
      writeoffs: memoryWriteoffs(),
    }),
  );
  try {
    const worker = await login(base, "worker", "worker-pass");
    const created = await fetch(base + "/api/writeoffs", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ kind: "dish", name: "  Шаурма  ", volume: "2 шт" }),
    });
    assert.equal(created.status, 201);
    const item = (await created.json()) as { id: string; day: string; kind: string; name: string; volume: string };
    assert.equal(item.day, moscowDay(now));
    assert.equal(item.kind, "dish");
    assert.equal(item.name, "Шаурма");
    assert.equal(item.volume, "2 шт");

    const edited = await fetch(base + "/api/writeoffs/" + item.id, {
      method: "PATCH",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ kind: "product", name: "Курица", volume: "500 г" }),
    });
    assert.equal(edited.status, 200);
    const next = (await edited.json()) as { day: string; kind: string; name: string; volume: string };
    assert.equal(next.kind, "product");
    assert.equal(next.name, "Курица");
    assert.equal(next.volume, "500 г");
    assert.equal(next.day, item.day);

    const empty = await fetch(base + "/api/writeoffs", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ kind: "product", name: "Курица", volume: "  " }),
    });
    assert.equal(empty.status, 400);

    const removed = await fetch(base + "/api/writeoffs/" + item.id, { method: "DELETE", headers: { cookie: worker } });
    assert.equal(removed.status, 200);

    const admin = await login(base, "admin", "admin-pass");
    const visible = await fetch(base + "/api/writeoffs", { headers: { cookie: admin } });
    assert.equal(visible.status, 200);
    const older = await fetch(base + "/api/writeoffs", {
      method: "POST",
      headers: { cookie: admin, "content-type": "application/json" },
      body: JSON.stringify({ day: "2026-10-18", kind: "dish", name: "Чай", volume: "1 шт" }),
    });
    assert.equal(older.status, 201);
    assert.equal(((await older.json()) as { day: string }).day, "2026-10-18");
  } finally {
    server.close();
  }
});
