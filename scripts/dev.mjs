import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const backend = spawn("node", ["--watch", "--experimental-strip-types", "src/server.ts"], {
  cwd: join(root, "backend"),
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: "8080",
    DATA_DIR: join(root, "backend/data"),
  },
});

const web = spawn("npm", ["exec", "--", "vite"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  backend.kill("SIGTERM");
  web.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

backend.on("exit", (code) => {
  if (stopping) return;
  web.kill("SIGTERM");
  process.exit(code ?? 1);
});

web.on("exit", (code) => {
  if (stopping) return;
  backend.kill("SIGTERM");
  process.exit(code ?? 0);
});
