const WINDOW_MS = 60_000;

export function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

export function makeCors(origin, allowed) {
  const allow = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function consumeSlot(kv, key, now, max) {
  if (!kv) return true;
  const raw = await kv.get(key);
  let entry = { n: 0, reset: now + WINDOW_MS };
  if (raw) {
    try {
      entry = JSON.parse(raw);
    } catch {
      entry = { n: 0, reset: now + WINDOW_MS };
    }
    if (now >= entry.reset) entry = { n: 0, reset: now + WINDOW_MS };
  }
  if (entry.n >= max) return false;
  entry.n += 1;
  const ttlSec = Math.max(60, Math.ceil((entry.reset - now) / 1000));
  await kv.put(key, JSON.stringify(entry), { expirationTtl: ttlSec });
  return true;
}
