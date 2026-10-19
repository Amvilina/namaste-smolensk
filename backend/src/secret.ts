import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function loadSecret(dataDir: string): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) {
    if (fromEnv.length < 32) throw new Error("SESSION_SECRET короче 32 символов");
    return fromEnv;
  }
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, "session-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
