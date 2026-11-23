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

server.listen(port, () => {
  console.log(`admin listening on ${port}`);
  const token = process.env.MAX_BOT_TOKEN ?? "";
  const hookSecret = process.env.MAX_WEBHOOK_SECRET ?? "";
  const hookUrl = process.env.MAX_WEBHOOK_URL ?? "";
  if (token && hookSecret && hookUrl) {
    void subscribeMax(token, hookSecret, hookUrl);
  }
});
