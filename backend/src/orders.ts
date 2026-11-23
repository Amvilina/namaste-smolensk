import type { IncomingMessage, ServerResponse } from "node:http";

const ADMINS = [91599112, 381612318];
const API = "https://platform-api.max.ru";
const WINDOW_MS = 60_000;
const MAX_ORDERS = 5;

type Line = { name: string; qty: number; extras: string[] };
type Order = {
  phone: string;
  handoff: "pickup" | "delivery";
  address: string;
  lines: Line[];
  comment: string;
};

export type OrderDeps = {
  token?: string;
  webhookSecret?: string;
  now?: () => number;
  send?: (userId: number, text: string) => Promise<boolean>;
};

function allow(hits: Map<string, { n: number; reset: number }>, ip: string, now: number): boolean {
  const row = hits.get(ip);
  if (!row || now >= row.reset) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (row.n >= MAX_ORDERS) return false;
  row.n += 1;
  return true;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
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

function parseOrder(data: unknown): Order | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const phone = String(raw.phone ?? "").replace(/\D/g, "");
  const digits = phone.startsWith("8") ? `7${phone.slice(1)}` : phone;
  if (digits.length !== 11 || !digits.startsWith("7")) return null;
  const handoff = raw.handoff === "pickup" ? "pickup" : raw.handoff === "delivery" ? "delivery" : "";
  if (!handoff) return null;
  const address = String(raw.address ?? "").trim().slice(0, 300);
  if (handoff === "delivery" && !address) return null;
  if (!Array.isArray(raw.lines) || raw.lines.length === 0 || raw.lines.length > 30) return null;
  const lines: Line[] = [];
  for (const item of raw.lines) {
    if (!item || typeof item !== "object") return null;
    const line = item as Record<string, unknown>;
    const name = String(line.name ?? "").trim().slice(0, 80);
    const qty = Number(line.qty);
    if (!name || !Number.isInteger(qty) || qty < 1 || qty > 99) return null;
    const extras = Array.isArray(line.extras)
      ? line.extras.map((extra) => String(extra ?? "").trim().slice(0, 40)).filter(Boolean).slice(0, 12)
      : [];
    lines.push({ name, qty, extras });
  }
  return {
    phone: digits,
    handoff,
    address: handoff === "delivery" ? address : "",
    lines,
    comment: String(raw.comment ?? "").trim().slice(0, 300),
  };
}

function orderText(order: Order): string {
  const national = order.phone.slice(1);
  const phone = `+7 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8, 10)}`;
  const lines = [
    "Новый заказ",
    `Телефон: ${phone}`,
    `Получение: ${order.handoff === "pickup" ? "Самовывоз" : "Доставка"}`,
  ];
  if (order.address) lines.push(`Адрес: ${order.address}`);
  lines.push("");
  for (const line of order.lines) {
    lines.push(`— ${line.name} × ${line.qty}`);
    if (line.extras.length) lines.push(`  ${line.extras.join(", ")}`);
  }
  if (order.comment) lines.push("", order.comment);
  return lines.join("\n").slice(0, 4000);
}

export async function sendMax(token: string, userId: number, message: string): Promise<boolean> {
  const url = new URL("/messages", API);
  url.searchParams.set("user_id", String(userId));
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
  return response.ok;
}

export async function subscribeMax(token: string, secret: string, webhookUrl: string): Promise<void> {
  const response = await fetch(new URL("/subscriptions", API), {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      update_types: ["message_created"],
      secret,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("max subscribe", response.status, detail.slice(0, 200));
  }
}

export function createOrders(deps: OrderDeps = {}) {
  const hits = new Map<string, { n: number; reset: number }>();
  const now = deps.now ?? Date.now;
  const token = deps.token ?? process.env.MAX_BOT_TOKEN ?? "";
  const webhookSecret = deps.webhookSecret ?? process.env.MAX_WEBHOOK_SECRET ?? "";
  const send = deps.send ?? ((userId: number, message: string) => sendMax(token, userId, message));

  return async function handleOrders(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    ip: string,
  ): Promise<boolean> {
    const method = req.method ?? "GET";
    if (method === "POST" && url.pathname === "/api/order") {
      if (!token) {
        json(res, 500, { ok: false, error: "Server misconfigured", code: "misconfigured" });
        return true;
      }
      const order = parseOrder(await readJson(req));
      if (!order) {
        json(res, 400, { ok: false, error: "Invalid order", code: "validation" });
        return true;
      }
      if (!allow(hits, ip, now())) {
        json(res, 429, { ok: false, error: "Too many requests", code: "rate_limited" });
        return true;
      }
      const message = orderText(order);
      for (const userId of ADMINS) {
        try {
          if (!(await send(userId, message))) {
            json(res, 502, { ok: false, error: "Max failed", code: "max_failed" });
            return true;
          }
        } catch {
          json(res, 502, { ok: false, error: "Max unavailable", code: "max_network" });
          return true;
        }
      }
      json(res, 200, { ok: true });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/max/webhook") {
      if (!webhookSecret || req.headers["x-max-bot-api-secret"] !== webhookSecret) {
        text(res, 403, "forbidden");
        return true;
      }
      const update = await readJson(req);
      const message = update && typeof update === "object" ? (update as Record<string, unknown>).message : null;
      const sender = message && typeof message === "object" ? (message as Record<string, unknown>).sender : null;
      const body = message && typeof message === "object" ? (message as Record<string, unknown>).body : null;
      const userId = sender && typeof sender === "object" ? Number((sender as Record<string, unknown>).user_id) : 0;
      const isBot = sender && typeof sender === "object" && (sender as Record<string, unknown>).is_bot === true;
      const command = String(body && typeof body === "object" ? (body as Record<string, unknown>).text ?? "" : "")
        .trim()
        .split(/\s+/)[0]
        ?.split("@")[0]
        .toLowerCase();
      const kind = update && typeof update === "object" ? (update as Record<string, unknown>).update_type : "";
      if (kind === "message_created" && userId && !isBot && command === "/myid" && token) {
        try {
          await send(userId, String(userId));
        } catch {
          text(res, 502, "failed");
          return true;
        }
      }
      text(res, 200, "ok");
      return true;
    }

    return false;
  };
}
