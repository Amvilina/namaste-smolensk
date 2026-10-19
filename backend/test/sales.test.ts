import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.ts";
import type { CatalogDish } from "../src/catalog.ts";
import { hashPassword } from "../src/passwords.ts";
import { memorySales, moscowDay } from "../src/sales.ts";
import type { StoredUser } from "../src/users.ts";

const secret = "test-session-secret-should-be-long-enough";
const catalog: CatalogDish[] = [
  { id: "shashlik-sheya", name: "Шашлык свиной (шея)", amount: "100 г", image: "/shashlik-sheya.webp", price: 190, extras: [] },
  { id: "tea", name: "Чай", amount: "0,3 л", image: "/tea.webp", price: 50, extras: [] },
  {
    id: "coffee",
    name: "Кофе",
    amount: "0,3 л",
    image: "/coffee.webp",
    price: 50,
    extras: [{ id: "milk", name: "Молоко", price: 10 }],
  },
];

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

test("воркер записывает несколько товаров и правит цену", async () => {
  const now = Date.parse("2026-10-19T10:00:00Z");
  const users: StoredUser[] = [
    { login: "worker", role: "worker", passwordHash: await hashPassword("worker-pass") },
    { login: "admin", role: "admin", passwordHash: await hashPassword("admin-pass") },
  ];
  const { server, base } = await listen(
    createApp({ users, secret, now: () => now, catalog, sales: memorySales() }),
  );
  try {
    const worker = await login(base, "worker", "worker-pass");
    const created = await fetch(base + "/api/sales", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({
        lines: [
          { dishId: "shashlik-sheya", price: 200, qty: 2 },
          { dishId: "tea", price: 50, qty: 1 },
        ],
      }),
    });
    assert.equal(created.status, 201);
    const sale = (await created.json()) as { id: string; day: string; pay: string; lines: { name: string; price: number }[] };
    assert.equal(sale.day, moscowDay(now));
    assert.equal(sale.pay, "cash");
    assert.equal(sale.lines[0]?.name, "Шашлык свиной (шея)");
    assert.equal(sale.lines[0]?.price, 200);
    assert.equal(sale.lines.length, 2);

    const edited = await fetch(base + "/api/sales/" + sale.id, {
      method: "PATCH",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({
        day: "2026-10-18",
        lines: [{ dishId: "tea", price: 40, qty: 3 }],
      }),
    });
    assert.equal(edited.status, 200);
    const next = (await edited.json()) as { day: string; lines: { qty: number; price: number }[] };
    assert.equal(next.day, "2026-10-18");
    assert.equal(next.lines[0]?.qty, 3);
    assert.equal(next.lines[0]?.price, 40);

    const future = await fetch(base + "/api/sales/" + sale.id, {
      method: "PATCH",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({
        day: "2026-10-20",
        lines: [{ dishId: "tea", price: 40, qty: 1 }],
      }),
    });
    assert.equal(future.status, 400);

    const withMilk = await fetch(base + "/api/sales", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ lines: [{ dishId: "coffee", price: 60, qty: 1, extras: ["milk"] }] }),
    });
    assert.equal(withMilk.status, 201);
    const coffee = (await withMilk.json()) as { lines: { extras: { name: string; price: number }[] }[] };
    assert.equal(coffee.lines[0]?.extras[0]?.name, "Молоко");
    assert.equal(coffee.lines[0]?.extras[0]?.price, 10);

    const twoCups = await fetch(base + "/api/sales", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({
        lines: [
          { dishId: "coffee", price: 60, qty: 1, extras: ["milk"] },
          { dishId: "coffee", price: 50, qty: 1, extras: [] },
        ],
      }),
    });
    assert.equal(twoCups.status, 201);
    const cups = (await twoCups.json()) as { lines: { dishId: string; extras: { id: string }[] }[] };
    assert.equal(cups.lines.length, 2);
    assert.equal(cups.lines[0]?.dishId, "coffee");
    assert.equal(cups.lines[1]?.dishId, "coffee");
    assert.equal(cups.lines[0]?.extras[0]?.id, "milk");
    assert.equal(cups.lines[1]?.extras.length, 0);

    const foreign = await fetch(base + "/api/sales", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ lines: [{ dishId: "coffee", price: 50, qty: 1, extras: ["beef"] }] }),
    });
    assert.equal(foreign.status, 400);

    const own = await fetch(base + "/api/sales", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ pay: "card", lines: [{ name: "Пирожок", price: 70, qty: 2 }] }),
    });
    assert.equal(own.status, 201);
    const ownSale = (await own.json()) as { pay: string; lines: { dishId: string; name: string; qty: number }[] };
    assert.equal(ownSale.pay, "card");
    assert.equal(ownSale.lines[0]?.name, "Пирожок");
    assert.equal(ownSale.lines[0]?.dishId, "");
    assert.equal(ownSale.lines[0]?.qty, 2);

    const blank = await fetch(base + "/api/sales", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ pay: "cash", lines: [{ name: "   ", price: 10, qty: 1 }] }),
    });
    assert.equal(blank.status, 400);

    const badPay = await fetch(base + "/api/sales", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ pay: "crypto", lines: [{ dishId: "tea", price: 50, qty: 1 }] }),
    });
    assert.equal(badPay.status, 400);

    const unknown = await fetch(base + "/api/sales", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ lines: [{ dishId: "nope", price: 10, qty: 1 }] }),
    });
    assert.equal(unknown.status, 400);

    const empty = await fetch(base + "/api/sales/" + sale.id, {
      method: "PATCH",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ day: "2026-10-18", lines: [] }),
    });
    assert.equal(empty.status, 400);

    const removed = await fetch(base + "/api/sales/" + sale.id, {
      method: "DELETE",
      headers: { cookie: worker },
    });
    assert.equal(removed.status, 200);
    const left = (await (await fetch(base + "/api/sales", { headers: { cookie: worker } })).json()) as { id: string }[];
    assert.equal(left.some((item) => item.id === sale.id), false);

    const admin = await login(base, "admin", "admin-pass");
    const visible = await fetch(base + "/api/sales", { headers: { cookie: admin } });
    assert.equal(visible.status, 200);
    const older = await fetch(base + "/api/sales", {
      method: "POST",
      headers: { cookie: admin, "content-type": "application/json" },
      body: JSON.stringify({ day: "2026-10-18", lines: [{ dishId: "tea", price: 50, qty: 1 }], pay: "cash" }),
    });
    assert.equal(older.status, 201);
    assert.equal(((await older.json()) as { day: string }).day, "2026-10-18");
    const workerDay = await fetch(base + "/api/sales", {
      method: "POST",
      headers: { cookie: worker, "content-type": "application/json" },
      body: JSON.stringify({ day: "2026-10-01", lines: [{ dishId: "tea", price: 50, qty: 1 }], pay: "cash" }),
    });
    assert.equal(workerDay.status, 201);
    assert.equal(((await workerDay.json()) as { day: string }).day, moscowDay(now));

    const menu = await fetch(base + "/api/menu", { headers: { cookie: worker } });
    assert.equal(menu.status, 200);
    const dishes = (await menu.json()) as { id: string }[];
    assert.equal(dishes.some((dish) => dish.id === "tea"), true);
  } finally {
    server.close();
  }
});
