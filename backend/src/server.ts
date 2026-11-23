import { createServer, type IncomingMessage } from "node:http";
import { createApp } from "./app.ts";
import { loadCatalog } from "./catalog.ts";
import { createLeads, subscribeLeads } from "./leads.ts";
import { subscribeMax } from "./orders.ts";
import { loadSecret } from "./secret.ts";

const port = Number(process.env.PORT ?? 8080);
const dataDir = process.env.DATA_DIR ?? "/tmp/namaste";
const secret = loadSecret(dataDir);
const app = createApp({
  secret,
  catalog: loadCatalog(),
});
const leads = createLeads();

function clientIp(req: IncomingMessage): string {
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) return real;
  return req.socket.remoteAddress ?? "";
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://namaste.local");
  if (await leads(req, res, url, clientIp(req))) return;
  await app(req, res);
});

server.listen(port, () => {
  console.log(`admin listening on ${port}`);
  const token = process.env.MAX_BOT_TOKEN ?? "";
  const hookSecret = process.env.MAX_WEBHOOK_SECRET ?? "";
  const hookUrl = process.env.MAX_WEBHOOK_URL ?? "";
  if (token && hookSecret && hookUrl) void subscribeMax(token, hookSecret, hookUrl);
  subscribeLeads();
});
