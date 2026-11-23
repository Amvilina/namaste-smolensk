import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.ts";

const secret = "test-session-secret-should-be-long-enough";

async function listen(handler: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

const order = {
  phone: "+7 (900) 000-00-01",
  handoff: "pickup",
  lines: [{ name: "Кыстыбый", qty: 1, extras: ["Сыр"] }],
};

test("заказ уходит обоим админам", async () => {
  const sent: { userId: number; text: string }[] = [];
  const { server, base } = await listen(
    createApp({
      secret,
      orders: {
        token: "token",
        send: async (userId, text) => {
          sent.push({ userId, text });
          return true;
        },
      },
    }),
  );
  try {
    const response = await fetch(`${base}/api/order`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(order),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(
      sent.map((item) => item.userId),
      [91599112, 381612318],
    );
    assert.match(sent[0]?.text ?? "", /Кыстыбый × 1/);
    assert.equal(sent[0]?.text, sent[1]?.text);
  } finally {
    server.close();
  }
});

test("без токена заказ не отправляется", async () => {
  let called = false;
  const { server, base } = await listen(
    createApp({
      secret,
      orders: {
        token: "",
        send: async () => {
          called = true;
          return true;
        },
      },
    }),
  );
  try {
    const response = await fetch(`${base}/api/order`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(order),
    });
    assert.equal(response.status, 500);
    assert.equal(called, false);
  } finally {
    server.close();
  }
});

test("/myid отвечает айди отправителя", async () => {
  const sent: { userId: number; text: string }[] = [];
  const { server, base } = await listen(
    createApp({
      secret,
      orders: {
        token: "token",
        webhookSecret: "hook",
        send: async (userId, text) => {
          sent.push({ userId, text });
          return true;
        },
      },
    }),
  );
  try {
    const denied = await fetch(`${base}/api/max/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ update_type: "message_created" }),
    });
    assert.equal(denied.status, 403);

    const response = await fetch(`${base}/api/max/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-max-bot-api-secret": "hook" },
      body: JSON.stringify({
        update_type: "message_created",
        message: { sender: { user_id: 42 }, body: { text: "/myid" } },
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(sent, [{ userId: 42, text: "42" }]);
  } finally {
    server.close();
  }
});