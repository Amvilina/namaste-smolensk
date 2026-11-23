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

test("заявка ГОС СЭС уходит админам в MAX", async () => {
  const sent: { userId: number; text: string }[] = [];
  const { server, base } = await listen(
    createApp({
      secret,
      leads: {
        ses: {
          token: "token",
          admins: [11, 22],
          send: async (userId, text) => {
            sent.push({ userId, text });
            return true;
          },
        },
      },
    }),
  );
  try {
    const response = await fetch(`${base}/api/lead/ses`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://xn----etb7amba7f.xn--p1ai" },
      body: JSON.stringify({
        phone: "+7 (900) 000-00-01",
        name: "Анна",
        plan: "Клопы",
        note: "Срочно",
        page: "https://xn----etb7amba7f.xn--p1ai/klopy.html",
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://xn----etb7amba7f.xn--p1ai");
    assert.deepEqual(sent.map((item) => item.userId), [11, 22]);
    assert.match(sent[0]?.text ?? "", /Клопы/);
    assert.match(sent[0]?.text ?? "", /гос-сэс\.рф\/klopy\.html/);
  } finally {
    server.close();
  }
});

test("портфолио: слишком быстро и затем нормальная заявка", async () => {
  const sent: string[] = [];
  const now = 1_000_000;
  const { server, base } = await listen(
    createApp({
      secret,
      leads: {
        now: () => now,
        portfolio: {
          token: "token",
          admins: [7],
          send: async (_userId, text) => {
            sent.push(text);
            return true;
          },
        },
      },
    }),
  );
  try {
    const fast = await fetch(`${base}/api/lead/portfolio`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://gcss-portfolio.ru" },
      body: JSON.stringify({ name: "Иван", phone: "+7 900 000-00-02", source: "crm", openedAt: now - 1000 }),
    });
    assert.equal(fast.status, 403);
    assert.equal(sent.length, 0);

    const response = await fetch(`${base}/api/lead/portfolio`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://gcss-portfolio.ru" },
      body: JSON.stringify({
        name: "Иван",
        phone: "+7 900 000-00-02",
        source: "crm-quiz",
        message: "Офис",
        openedAt: now - 11_000,
      }),
    });
    assert.equal(response.status, 200);
    assert.match(sent[0] ?? "", /Ответы квиза:\nОфис/);
  } finally {
    server.close();
  }
});

test("/myid портфолио отвечает только со своим секретом", async () => {
  const sent: { userId: number; text: string }[] = [];
  const { server, base } = await listen(
    createApp({
      secret,
      leads: {
        portfolio: {
          token: "token",
          webhookSecret: "hook",
          admins: [],
          send: async (userId, text) => {
            sent.push({ userId, text });
            return true;
          },
        },
      },
    }),
  );
  try {
    const denied = await fetch(`${base}/api/lead/portfolio/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ update_type: "message_created" }),
    });
    assert.equal(denied.status, 403);
    const response = await fetch(`${base}/api/lead/portfolio/webhook`, {
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
