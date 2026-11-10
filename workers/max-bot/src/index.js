/**
 * Заказы сайта → личные сообщения админам в MAX.
 * Секрет: MAX_BOT_TOKEN
 * Для входящих событий бота: MAX_WEBHOOK_SECRET
 * KV (когда понадобится лимит): binding BOT_KV
 *
 * POST /            заказ: phone, handoff, address?, lines[], comment?
 * POST /webhook     события MAX
 * POST /setup-webhook   подписка, заголовок X-Webhook-Setup
 */

import { consumeSlot, json, makeCors } from "../../lib/http.js";
import { sendMax, subscribeMax } from "./max.js";

const ALLOWED_ORIGINS = [
  "https://namaste-smolensk.ru",
  "https://www.namaste-smolensk.ru",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const MAX_ORDERS = 5;
const ADMINS = [274477448];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = makeCors(origin, ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (path === "/setup-webhook" && request.method === "POST") {
      return handleSetup(request, env);
    }

    if (path === "/webhook" && request.method === "POST") {
      return handleWebhook(request, env);
    }

    if (request.method !== "POST" || path !== "/") {
      return json({ ok: false, error: "Method not allowed", code: "method_not_allowed" }, 405, corsHeaders);
    }

    if (!env.MAX_BOT_TOKEN || ADMINS.length === 0) {
      return json({ ok: false, error: "Server misconfigured", code: "misconfigured" }, 500, corsHeaders);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON", code: "invalid_json" }, 400, corsHeaders);
    }

    return handleOrder(request, env, data, corsHeaders);
  },
};

async function handleOrder(request, env, data, corsHeaders) {
  const order = parseOrder(data);
  if (!order) {
    return json({ ok: false, error: "Invalid order", code: "validation" }, 400, corsHeaders);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const allowed = await consumeSlot(env.BOT_KV, `order:${ip}`, Date.now(), MAX_ORDERS);
  if (!allowed) {
    return json({ ok: false, error: "Too many requests", code: "rate_limited" }, 429, corsHeaders);
  }

  const text = orderText(order);
  for (const userId of ADMINS) {
    const sent = await sendMax(env, userId, text);
    if (!sent.ok) return json(sent.body, sent.status, corsHeaders);
  }
  return json({ ok: true }, 200, corsHeaders);
}

function parseOrder(data) {
  if (!data || typeof data !== "object") return null;

  const phone = String(data.phone || "").replace(/\D/g, "");
  const digits = phone.startsWith("8") ? `7${phone.slice(1)}` : phone;
  if (digits.length !== 11 || !digits.startsWith("7")) return null;

  const handoff = data.handoff === "pickup" ? "pickup" : data.handoff === "delivery" ? "delivery" : "";
  if (!handoff) return null;

  const address = String(data.address || "").trim().slice(0, 300);
  if (handoff === "delivery" && !address) return null;

  if (!Array.isArray(data.lines) || data.lines.length === 0 || data.lines.length > 30) return null;
  const lines = [];
  for (const raw of data.lines) {
    const name = String(raw?.name || "").trim().slice(0, 80);
    const qty = Number(raw?.qty);
    if (!name || !Number.isInteger(qty) || qty < 1 || qty > 99) return null;
    const extras = Array.isArray(raw?.extras)
      ? raw.extras.map((item) => String(item || "").trim().slice(0, 40)).filter(Boolean).slice(0, 12)
      : [];
    lines.push({ name, qty, extras });
  }

  const comment = String(data.comment || "").trim().slice(0, 300);
  return { phone: digits, handoff, address: handoff === "delivery" ? address : "", lines, comment };
}

function orderText(order) {
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

async function handleSetup(request, env) {
  if (!env.MAX_BOT_TOKEN || !env.MAX_WEBHOOK_SECRET) {
    return json({ ok: false, error: "misconfigured" }, 503, {});
  }
  if ((request.headers.get("X-Webhook-Setup") || "") !== env.MAX_WEBHOOK_SECRET) {
    return json({ ok: false, error: "forbidden" }, 403, {});
  }
  const webhookUrl = `${new URL(request.url).origin}/webhook`;
  const result = await subscribeMax(env, webhookUrl);
  return json(result.body, result.status, {});
}

async function handleWebhook(request, env) {
  if (env.MAX_WEBHOOK_SECRET) {
    const secret = request.headers.get("X-Max-Bot-Api-Secret") || "";
    if (secret !== env.MAX_WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
  }
  return new Response("ok");
}
