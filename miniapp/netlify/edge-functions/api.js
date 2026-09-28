/**
 * Проксі /api/* → ігровий сервер (server у docker-compose).
 *
 * Браузер говорить лише з https://svitodiy.netlify.app, тож:
 *  - не потрібен власний домен і сертифікат для API;
 *  - немає CORS — запити same-origin.
 *
 * Адреса сервера — змінна середовища API_ORIGIN у Netlify
 * (Site configuration → Environment variables), напр. http://203.0.113.10:3000
 */
export default async (request) => {
  const origin = Netlify.env.get("API_ORIGIN");
  if (!origin) {
    return Response.json(
      { error: "not_configured", message: "Сервер гри ще не підключено. Зазирни трохи згодом." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const target = origin.replace(/\/$/, "") + url.pathname + url.search;

  const headers = new Headers();
  for (const name of ["authorization", "content-type", "accept"]) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }

  try {
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
    });
    return new Response(res.body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": res.headers.get("cache-control") ?? "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "upstream_unreachable", message: "Сервер гри зараз недоступний. Спробуй трохи згодом." },
      { status: 502 }
    );
  }
};

export const config = { path: "/api/*" };
