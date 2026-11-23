import type { IncomingMessage, ServerResponse } from "node:http";
import { sendMax } from "./orders.ts";

const WINDOW_MS = 60_000;
const MAX_LEADS = 5;
const MIN_DWELL_MS = 10_000;

const SES_ORIGINS = [
  "https://гос-сэс.рф",
  "https://www.гос-сэс.рф",
  "https://xn----etb7amba7f.xn--p1ai",
  "https://www.xn----etb7amba7f.xn--p1ai",
  "http://127.0.0.1:8765",
  "http://localhost:8765",
];

const PORTFOLIO_ORIGINS = [
  "https://gcss.ru",
  "https://www.gcss.ru",
  "https://gcss-portfolio.ru",
  "https://www.gcss-portfolio.ru",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

type Hit = { n: number; reset: number };

export type LeadBotDeps = {
  token?: string;
  webhookSecret?: string;
  admins?: number[];
  send?: (userId: number, text: string) => Promise<boolean>;
};

export type LeadDeps = {
  now?: () => number;
  ses?: LeadBotDeps;
  portfolio?: LeadBotDeps;
};

type SesLead = {
  phone: string;
  contact: string;
  name: string;
  plan: string;
  page: string;
  note: string;
};

function ids(raw: string | undefined, override?: number[]): number[] {
  if (override) return override;
  return [...new Set(
    String(raw ?? "")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0),
  )];
}

function allow(hits: Map<string, Hit>, ip: string, now: number): boolean {
  const row = hits.get(ip);
  if (!row || now >= row.reset) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (row.n >= MAX_LEADS) return false;
  row.n += 1;
  return true;
}

function cors(origin: string, allowed: string[]): Record<string, string> {
  if (!allowed.includes(origin)) return { vary: "Origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function reply(res: ServerResponse, status: number, body: unknown, extra: Record<string, string>): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra,
  });
  res.end(JSON.stringify(body));
}

function plain(res: ServerResponse, status: number, body: string): void {
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
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function parseSes(data: unknown): SesLead | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const rawPhone = String(raw.phone ?? "").trim().slice(0, 64);
  const digitsOnly = rawPhone.replace(/\D/g, "");
  const digits = digitsOnly.startsWith("8") && digitsOnly.length === 11 ? `7${digitsOnly.slice(1)}` : digitsOnly;
  const phoneOk = digits.length === 11 && digits.startsWith("7");
  const handle = rawPhone.replace(/\s/g, "");
  const tgOk = /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(handle);
  if (!phoneOk && !tgOk) return null;
  return {
    phone: phoneOk ? digits : "",
    contact: phoneOk ? "" : handle.startsWith("@") ? handle : `@${handle}`,
    name: String(raw.name ?? "").trim().slice(0, 80),
    plan: String(raw.plan ?? "").trim().slice(0, 80),
    page: String(raw.page ?? "").trim().slice(0, 300),
    note: String(raw.note ?? "").replace(/\r/g, "").trim().slice(0, 700),
  };
}

function sesText(lead: SesLead): string {
  const lines = ["Заявка с сайта ГОС СЭС"];
  if (lead.phone) {
    const national = lead.phone.slice(1);
    lines.push(`Телефон: +7 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8, 10)}`);
  }
  if (lead.contact) lines.push(`Telegram: ${lead.contact}`);
  if (lead.name) lines.push(`Имя: ${lead.name}`);
  if (lead.plan) lines.push(`Услуга: ${lead.plan}`);
  if (lead.note) lines.push(lead.note);
  if (lead.page) lines.push(`Страница: ${readablePage(lead.page)}`);
  return lines.join("\n").slice(0, 4000);
}

function readablePage(page: string): string {
  let url: URL;
  try {
    url = new URL(page);
  } catch {
    return page;
  }
  const host = url.hostname
    .split(".")
    .map((label) => (label.startsWith("xn--") ? decodePunycode(label.slice(4)) : label))
    .join(".");
  let path = url.pathname;
  if (path.endsWith("/index.html")) path = `${path.slice(0, -"index.html".length)}` || "/";
  return `${url.protocol}//${host}${path}${url.search}`;
}

function decodePunycode(input: string): string {
  const base = 36;
  const tMin = 1;
  const tMax = 26;
  const skew = 38;
  const damp = 700;
  const output: number[] = [];
  const delimiter = input.lastIndexOf("-");
  if (delimiter > 0) {
    for (let j = 0; j < delimiter; j += 1) output.push(input.charCodeAt(j));
  }
  let i = 0;
  let n = 128;
  let bias = 72;
  let pos = delimiter > 0 ? delimiter + 1 : 0;
  const adapt = (delta: number, numPoints: number, firstTime: boolean) => {
    let next = firstTime ? Math.floor(delta / damp) : delta >> 1;
    next += Math.floor(next / numPoints);
    let k = 0;
    while (next > ((base - tMin) * tMax) >> 1) {
      next = Math.floor(next / (base - tMin));
      k += base;
    }
    return k + Math.floor(((base - tMin + 1) * next) / (next + skew));
  };
  while (pos < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = base; ; k += base) {
      if (pos >= input.length) return input;
      const code = input.charCodeAt(pos);
      pos += 1;
      const digit = code >= 48 && code <= 57 ? code - 22 : code >= 65 && code <= 90 ? code - 65 : code >= 97 && code <= 122 ? code - 97 : base;
      if (digit >= base) return input;
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) break;
      w *= base - t;
    }
    const outLen = output.length + 1;
    bias = adapt(i - oldi, outLen, oldi === 0);
    n += Math.floor(i / outLen);
    i %= outLen;
    output.splice(i, 0, n);
    i += 1;
  }
  return String.fromCodePoint(...output);
}

function portfolioText(name: string, phone: string, source: string, message: string): string {
  const lines = ["🆕 Заявка с сайта", `Имя: ${name}`, `Телефон: ${phone}`, `Откуда: ${source}`];
  if (message) {
    lines.push("", source === "crm-quiz" ? "Ответы квиза:" : "Комментарий:", message);
  }
  return lines.join("\n").slice(0, 4000);
}

async function fanout(
  res: ServerResponse,
  corsHeaders: Record<string, string>,
  admins: number[],
  send: (userId: number, text: string) => Promise<boolean>,
  text: string,
): Promise<void> {
  for (const userId of admins) {
    try {
      if (!(await send(userId, text))) {
        reply(res, 502, { ok: false, error: "Max failed", code: "max_failed" }, corsHeaders);
        return;
      }
    } catch {
      reply(res, 502, { ok: false, error: "Max unavailable", code: "max_network" }, corsHeaders);
      return;
    }
  }
  reply(res, 200, { ok: true }, corsHeaders);
}

function commandOf(update: unknown): { userId: number; command: string; bot: boolean } | null {
  if (!update || typeof update !== "object") return null;
  const root = update as Record<string, unknown>;
  if (root.update_type !== "message_created") return null;
  const message = root.message;
  if (!message || typeof message !== "object") return null;
  const sender = (message as Record<string, unknown>).sender;
  const body = (message as Record<string, unknown>).body;
  if (!sender || typeof sender !== "object") return null;
  const userId = Number((sender as Record<string, unknown>).user_id);
  const bot = (sender as Record<string, unknown>).is_bot === true;
  const command = String(body && typeof body === "object" ? (body as Record<string, unknown>).text ?? "" : "")
    .trim()
    .split(/\s+/)[0]
    ?.split("@")[0]
    .toLowerCase();
  if (!userId || !command) return null;
  return { userId, command, bot };
}

export function createLeads(deps: LeadDeps = {}) {
  const now = deps.now ?? Date.now;
  const sesHits = new Map<string, Hit>();
  const portfolioHits = new Map<string, Hit>();
  const sesToken = deps.ses?.token ?? process.env.SES_MAX_BOT_TOKEN ?? "";
  const portfolioToken = deps.portfolio?.token ?? process.env.PORTFOLIO_MAX_BOT_TOKEN ?? "";
  const sesSecret = deps.ses?.webhookSecret ?? process.env.SES_MAX_WEBHOOK_SECRET ?? "";
  const portfolioSecret = deps.portfolio?.webhookSecret ?? process.env.PORTFOLIO_MAX_WEBHOOK_SECRET ?? "";
  const sesAdmins = ids(process.env.SES_MAX_ADMINS, deps.ses?.admins);
  const portfolioAdmins = ids(process.env.PORTFOLIO_MAX_ADMINS, deps.portfolio?.admins);
  const sendSes = deps.ses?.send ?? ((userId: number, text: string) => sendMax(sesToken, userId, text));
  const sendPortfolio = deps.portfolio?.send ?? ((userId: number, text: string) => sendMax(portfolioToken, userId, text));

  return async function handleLeads(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    ip: string,
  ): Promise<boolean> {
    const method = req.method ?? "GET";
    const ses = url.pathname === "/api/lead/ses";
    const portfolio = url.pathname === "/api/lead/portfolio";
    const sesHook = url.pathname === "/api/lead/ses/webhook";
    const portfolioHook = url.pathname === "/api/lead/portfolio/webhook";
    if (!ses && !portfolio && !sesHook && !portfolioHook) return false;

    if (sesHook || portfolioHook) {
      if (method !== "POST") return false;
      const secret = sesHook ? sesSecret : portfolioSecret;
      const token = sesHook ? sesToken : portfolioToken;
      const send = sesHook ? sendSes : sendPortfolio;
      if (!secret || req.headers["x-max-bot-api-secret"] !== secret) {
        plain(res, 403, "forbidden");
        return true;
      }
      const update = await readJson(req);
      const message = commandOf(update);
      if (message && !message.bot && message.command === "/myid" && token) {
        try {
          await send(message.userId, String(message.userId));
        } catch {
          plain(res, 502, "failed");
          return true;
        }
      }
      plain(res, 200, "ok");
      return true;
    }

    const allowed = ses ? SES_ORIGINS : PORTFOLIO_ORIGINS;
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const headers = cors(origin, allowed);
    if (method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return true;
    }
    if (method !== "POST") {
      reply(res, 405, { ok: false, error: "Method not allowed", code: "method_not_allowed" }, headers);
      return true;
    }

    const token = ses ? sesToken : portfolioToken;
    const admins = ses ? sesAdmins : portfolioAdmins;
    const send = ses ? sendSes : sendPortfolio;
    if (!token || admins.length === 0) {
      reply(res, 500, { ok: false, error: "Server misconfigured", code: "misconfigured" }, headers);
      return true;
    }

    const data = await readJson(req);
    if (data === undefined) {
      reply(res, 400, { ok: false, error: "Invalid JSON", code: "invalid_json" }, headers);
      return true;
    }

    if (ses) {
      const lead = parseSes(data);
      if (!lead) {
        reply(res, 400, { ok: false, error: "Invalid lead", code: "validation" }, headers);
        return true;
      }
      if (!allow(sesHits, ip, now())) {
        reply(res, 429, { ok: false, error: "Too many requests", code: "rate_limited" }, headers);
        return true;
      }
      await fanout(res, headers, admins, send, sesText(lead));
      return true;
    }

    if (!data || typeof data !== "object") {
      reply(res, 400, { ok: false, error: "Name and phone required", code: "validation" }, headers);
      return true;
    }
    const raw = data as Record<string, unknown>;
    const name = String(raw.name ?? "").trim().slice(0, 80);
    const phone = String(raw.phone ?? "").trim().slice(0, 40);
    const source = String(raw.source ?? "crm").trim().slice(0, 60);
    const message = String(raw.message ?? "").trim().slice(0, 1000);
    const openedAt = Number(raw.openedAt);
    if (!name || !phone) {
      reply(res, 400, { ok: false, error: "Name and phone required", code: "validation" }, headers);
      return true;
    }
    if (!Number.isFinite(openedAt)) {
      reply(res, 400, { ok: false, error: "openedAt required", code: "opened_at_required" }, headers);
      return true;
    }
    if (now() - openedAt < MIN_DWELL_MS) {
      reply(res, 403, { ok: false, error: "Too fast", code: "too_fast", dwellMs: now() - openedAt }, headers);
      return true;
    }
    if (!allow(portfolioHits, ip, now())) {
      reply(res, 429, { ok: false, error: "Too many requests", code: "rate_limited" }, headers);
      return true;
    }
    await fanout(res, headers, admins, send, portfolioText(name, phone, source, message));
    return true;
  };
}
