import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { ABSOLUTE_MS, signSession, WEEK_MS } from "../src/session.ts";
import { ARGON_OPTIONS, hashPassword, verifyPassword } from "../src/passwords.ts";
import { DUMMY_PASSWORD_HASH, users, type StoredUser } from "../src/users.ts";

const secret = "test-session-secret-should-be-long-enough";
const adminPassword = "test-admin-password-1";
const workerPassword = "test-worker-password-2";

async function listen(handler: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function ask(
  base: string,
  path: string,
  init: { method?: string; cookie?: string; body?: string } = {},
) {
  const response = await fetch(base + path, {
    method: init.method ?? "GET",
    redirect: "manual",
    headers: {
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.body,
  });
  return {
    status: response.status,
    location: response.headers.get("location"),
    text: await response.text(),
    cookies: response.headers.getSetCookie(),
  };
}

function cookiePair(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

test("пароли пользователей хранятся как argon2id", async () => {
  const source = readFileSync(new URL("../src/users.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /password\s*[:=]\s*["'][^$]/);
  assert.equal(users.map((user) => user.login).join(), "admin,worker");
  for (const user of users) {
    assert.match(user.passwordHash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    assert.equal(await verifyPassword(user.passwordHash, user.login), false);
    assert.equal(await verifyPassword(user.passwordHash, "password"), false);
    assert.equal(await verifyPassword(user.passwordHash, "admin"), false);
  }
  assert.match(DUMMY_PASSWORD_HASH, /^\$argon2id\$/);
});

test("хеш проверяется только со своим паролем", async () => {
  const passwordHash = await hashPassword("correct-horse-battery");
  assert.equal(await verifyPassword(passwordHash, "correct-horse-battery"), true);
  assert.equal(await verifyPassword(passwordHash, "wrong"), false);
  assert.equal(await verifyPassword("not-a-hash", "wrong"), false);
  assert.equal(ARGON_OPTIONS.memoryCost, 19456);
});

test("вход пускает на свою пустую страницу и не пускает на чужую", async () => {
  const fixture: StoredUser[] = [
    { login: "admin", role: "admin", passwordHash: await hashPassword(adminPassword) },
    { login: "worker", role: "worker", passwordHash: await hashPassword(workerPassword) },
  ];
  const { server, base } = await listen(createApp({ users: fixture, secret }));
  try {
    const closed = await ask(base, "/admin");
    assert.equal(closed.status, 302);
    assert.equal(closed.location, "/login");

    const bad = await ask(base, "/login", {
      method: "POST",
      body: new URLSearchParams({ login: "admin", password: "nope" }).toString(),
    });
    assert.equal(bad.status, 401);
    assert.match(bad.text, /Неверный логин или пароль/);
    assert.equal(bad.cookies.length, 0);
    assert.doesNotMatch(bad.text, /nope/);

    const unknown = await ask(base, "/login", {
      method: "POST",
      body: new URLSearchParams({ login: "ghost", password: adminPassword }).toString(),
    });
    assert.equal(unknown.status, 401);

    const admin = await ask(base, "/login", {
      method: "POST",
      body: new URLSearchParams({ login: "admin", password: adminPassword }).toString(),
    });
    assert.equal(admin.status, 302);
    assert.equal(admin.location, "/admin");
    assert.match(admin.cookies[0] ?? "", /HttpOnly/i);
    assert.equal(admin.cookies.join("").includes(adminPassword), false);
    const adminCookie = cookiePair(admin.cookies[0] ?? "");

    const adminPage = await ask(base, "/admin", { cookie: adminCookie });
    assert.equal(adminPage.status, 200);
    assert.match(adminPage.text, /<title>Админка<\/title>/);
    assert.match(adminPage.text, /Выйти/);

    const denied = await ask(base, "/worker", { cookie: adminCookie });
    assert.equal(denied.status, 302);
    assert.equal(denied.location, "/admin");

    const worker = await ask(base, "/login", {
      method: "POST",
      body: new URLSearchParams({ login: "worker", password: workerPassword }).toString(),
    });
    assert.equal(worker.location, "/worker");
    const workerCookie = cookiePair(worker.cookies[0] ?? "");
    const workerPage = await ask(base, "/worker", { cookie: workerCookie });
    assert.equal(workerPage.status, 200);
    assert.match(workerPage.text, /<title>Сотрудник<\/title>/);
    const workerAway = await ask(base, "/admin", { cookie: workerCookie });
    assert.equal(workerAway.location, "/worker");

    const out = await ask(base, "/logout", { method: "POST", cookie: adminCookie });
    assert.equal(out.status, 302);
    assert.equal(out.location, "/login");
    assert.match(out.cookies[0] ?? "", /Max-Age=0/i);
    const after = await ask(base, "/admin", { cookie: cookiePair(out.cookies[0] ?? "") });
    assert.equal(after.status, 302);
    assert.equal(after.location, "/login");
  } finally {
    server.close();
  }
});

function sessionPayload(setCookie: string): { iat: number; exp: number } {
  const token = decodeURIComponent(cookiePair(setCookie).split("=")[1] ?? "");
  const body = token.split(".")[0] ?? "";
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { iat: number; exp: number };
}

test("неделя продлевается при заходе, через 90 дней пароль снова", async () => {
  const fixture: StoredUser[] = [
    { login: "admin", role: "admin", passwordHash: await hashPassword(adminPassword) },
  ];
  let clock = 1_700_000_000_000;
  const { server, base } = await listen(createApp({ users: fixture, secret, now: () => clock }));
  try {
    const admin = await ask(base, "/login", {
      method: "POST",
      body: new URLSearchParams({ login: "admin", password: adminPassword }).toString(),
    });
    assert.match(admin.cookies[0] ?? "", /Max-Age=604800/);
    const first = sessionPayload(admin.cookies[0] ?? "");
    assert.equal(first.exp - first.iat, WEEK_MS);

    clock = first.iat + 2 * 24 * 60 * 60 * 1000;
    const visit = await ask(base, "/admin", { cookie: cookiePair(admin.cookies[0] ?? "") });
    const slid = sessionPayload(visit.cookies[0] ?? "");
    assert.equal(slid.iat, first.iat);
    assert.equal(slid.exp, clock + WEEK_MS);

    const agedIat = clock - (ABSOLUTE_MS - 24 * 60 * 60 * 1000);
    const aged = signSession({ login: "admin", role: "admin", iat: agedIat, exp: clock + WEEK_MS }, secret);
    const late = await ask(base, "/admin", { cookie: `namaste_session=${encodeURIComponent(aged)}` });
    const capped = sessionPayload(late.cookies[0] ?? "");
    assert.equal(capped.iat, agedIat);
    assert.equal(capped.exp, agedIat + ABSOLUTE_MS);

    clock = agedIat + ABSOLUTE_MS;
    const forced = await ask(base, "/admin", { cookie: cookiePair(late.cookies[0] ?? "") });
    assert.equal(forced.status, 302);
    assert.equal(forced.location, "/login");
  } finally {
    server.close();
  }
});
