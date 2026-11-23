import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createLeads, type LeadDeps } from "../src/leads.ts";

async function listen(deps: LeadDeps): Promise<{ server: Server; base: string }> {
  const handle = createLeads(deps);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://leads.local");
    const ip = req.socket.remoteAddress ?? "";
    if (!(await handle(req, res, url, ip))) {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

test("заявка ГОС СЭС уходит админам в MAX", async () => {
  const sent: { userId: number; text: string }[] = [];
  const { server, base } = await listen(
    {
        ses: {
          token: "token",
          admins: [11, 22],
          send: async (userId, text) => {
            sent.push({ userId, text });
            return true;
          },
        },
    },
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
  const { server, base } = await listen({
    now: () => now,
    portfolio: {
      token: "token",
      admins: [7],
      send: async (_userId, text) => {
        sent.push(text);
        return true;
      },
    },
  });
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

test("кнопка открывает счётчик с сайта и шлёт цель", async () => {
  const sent: { text: string; link?: string }[] = [];
  const now = 2_000_000;
  const { server, base } = await listen({
    now: () => now,
    portfolio: {
      token: "token",
      webhookSecret: "hook",
      admins: [7],
      send: async (_userId, text, link) => {
        sent.push({ text, link });
        return true;
      },
    },
  });
  try {
    const response = await fetch(`${base}/api/lead/portfolio`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://gcss-portfolio.ru" },
      body: JSON.stringify({
        name: "Иван",
        phone: "+7 900 000-00-02",
        source: "crm",
        openedAt: now - 11_000,
        metrika: { goal: "crm-form", pageUrl: "https://gcss-portfolio.ru/" },
      }),
    });
    assert.equal(response.status, 200);
    const link = sent[0]?.link ?? "";
    assert.match(link, /\/api\/lead\/portfolio\/goal\?/);
    const page = await fetch(`${base}${new URL(link).pathname}${new URL(link).search}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /mc\.yandex\.ru\/metrika\/tag\.js\?id=112716152/);
    assert.match(html, /reachGoal',"crm-form"/);
  } finally {
    server.close();
  }
});

test("/myid портфолио отвечает только со своим секретом", async () => {
  const sent: { userId: number; text: string }[] = [];
  const { server, base } = await listen({
    portfolio: {
      token: "token",
      webhookSecret: "hook",
      admins: [],
      send: async (userId, text) => {
        sent.push({ userId, text });
        return true;
      },
    },
  });
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
