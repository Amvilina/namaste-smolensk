import { createServer } from "node:http";
import { createApp } from "./app.ts";
import { loadCatalog } from "./catalog.ts";
import { loadSecret } from "./secret.ts";
import { fileSales } from "./sales.ts";

const port = Number(process.env.PORT ?? 8080);
const dataDir = process.env.DATA_DIR ?? "/tmp/namaste";
const secret = loadSecret(dataDir);
const server = createServer(
  createApp({ secret, catalog: loadCatalog(), sales: fileSales(dataDir) }),
);

server.listen(port, () => {
  console.log(`admin listening on ${port}`);
});
