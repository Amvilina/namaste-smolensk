// platform-api.max.ru отдаёт сертификат HARICA, его принимает fetch в Workers.
// platform-api2.max.ru подписан УЦ Минцифры: Workers этот корень не доверяет.
const API = "https://platform-api.max.ru";

function headers(env) {
  return {
    Authorization: env.MAX_BOT_TOKEN,
    "Content-Type": "application/json",
  };
}

async function readBody(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function sendMax(env, userId, text) {
  const url = new URL("/messages", API);
  url.searchParams.set("user_id", String(userId));

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: headers(env),
      body: JSON.stringify({ text }),
    });
  } catch {
    return { ok: false, status: 502, body: { ok: false, error: "Max unavailable", code: "max_network" } };
  }

  const body = await readBody(res);
  if (!res.ok) {
    const detail = body?.message ? String(body.message).slice(0, 120) : "";
    return {
      ok: false,
      status: 502,
      body: { ok: false, error: "Max failed", code: "max_failed", detail: detail || undefined },
    };
  }

  const messageId = body?.message?.body?.mid || body?.message?.mid;
  return { ok: true, messageId: messageId ? String(messageId) : undefined };
}

export async function subscribeMax(env, webhookUrl) {
  let res;
  try {
    res = await fetch(new URL("/subscriptions", API), {
      method: "POST",
      headers: headers(env),
      body: JSON.stringify({
        url: webhookUrl,
        update_types: ["message_created", "bot_started"],
        secret: env.MAX_WEBHOOK_SECRET,
      }),
    });
  } catch {
    return { ok: false, status: 502, body: { ok: false, error: "max_network" } };
  }

  const body = await readBody(res);
  return { ok: res.ok, status: res.ok ? 200 : 502, body };
}
