import { createServer } from "node:http";
import { createApp } from "./app.ts";
import { loadSecret } from "./secret.ts";

const port = Number(process.env.PORT ?? 8080);
const secret = loadSecret(process.env.DATA_DIR ?? "/tmp/namaste");
const server = createServer(createApp({ secret }));

server.listen(port, () => {
  console.log(`admin listening on ${port}`);
});
