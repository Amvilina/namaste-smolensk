import { createServer } from "node:http";
import { createApp } from "./app.ts";
import { loadCatalog } from "./catalog.ts";
import { subscribeMax } from "./orders.ts";
import { loadSecret } from "./secret.ts";

const port = Number(process.env.PORT ?? 8080);
const dataDir = process.env.DATA_DIR ?? "/tmp/namaste";
const secret = loadSecret(dataDir);
const server = createServer(
  createApp({
    secret,
    catalog: loadCatalog(),
  }),
);

function subscribe(tokenKey: string, secretKey: string, urlKey: string): void {
  const token = process.env[tokenKey] ?? "";
  const hookSecret = process.env[secretKey] ?? "";
  const hookUrl = process.env[urlKey] ?? "";
  if (token && hookSecret && hookUrl) void subscribeMax(token, hookSecret, hookUrl);
}

server.listen(port, () => {
  console.log(`admin listening on ${port}`);
  subscribe("MAX_BOT_TOKEN", "MAX_WEBHOOK_SECRET", "MAX_WEBHOOK_URL");
  subscribe("SES_MAX_BOT_TOKEN", "SES_MAX_WEBHOOK_SECRET", "SES_MAX_WEBHOOK_URL");
  subscribe("PORTFOLIO_MAX_BOT_TOKEN", "PORTFOLIO_MAX_WEBHOOK_SECRET", "PORTFOLIO_MAX_WEBHOOK_URL");
});
