/**
 * Локальна перевірка мультиплеєра спільного острова: вигаданий мандрівник ходить колом.
 *
 * 1. Запусти сервер локально (не в продакшені!) з кімнатою для вигаданого гравця:
 *      PRESENCE_DEV_ROOM=shared-1 PRESENCE_DEV_IDS=999000001 npm run dev:server
 *    (shared-1 — спільний острів із telegram-bot/src/specialAccess.js; твій номер має бути в SHARED_HOME_PHONES.)
 * 2. node server/scripts/fake-peer.mjs [--scene home] [--name Тест] [--url http://localhost:3000]
 * 3. Відкрий острів у Mini App — побачиш «Тест», що ходить колом. Ctrl+C — він зникне.
 *
 * Підписує initData тим самим TELEGRAM_BOT_TOKEN, що й сервер (.env у корені репо).
 */
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const URL_BASE = arg("url", process.env.SERVER_URL || "http://localhost:3000").replace(/\/$/, "");
const SCENE = arg("scene", "island");
const NAME = arg("name", "Тест");
const ID = Number(arg("id", "999000001"));
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN не задано (.env)");

function initData() {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: ID, first_name: NAME }) });
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}
const auth = `tma ${initData()}`;

// Коло навколо двору (острів) або по кімнаті (хатинка), 64 px/с — як справжній мандрівник.
const C = SCENE === "home" ? { x: 120, y: 130, r: 40 } : { x: 256, y: 230, r: 60 };
const T0 = Date.now();
const at = (t) => {
  const a = ((t - T0) / 1000) * (64 / C.r);
  return { x: C.x + Math.cos(a) * C.r, y: C.y + Math.sin(a) * C.r, fx: -Math.sin(a), fy: Math.cos(a) };
};

let seq = 0;
let pending = [];
setInterval(() => {
  const p = at(Date.now());
  pending.push([Date.now(), p.x, p.y]);
  if (pending.length > 16) pending = pending.slice(-16);
}, 100);

async function tick() {
  const now = Date.now();
  const p = at(now);
  if (!pending.length) pending.push([now, p.x, p.y]); // без жодної точки інші нас не побачать
  const sent = pending.slice();
  let next = 2000;
  try {
    const res = await fetch(`${URL_BASE}/api/presence`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ seq: ++seq, fx: p.fx, fy: p.fy, s: sent.map(([t, x, y]) => [now - t, x, y, SCENE]) }),
    });
    const data = await res.json();
    if (!res.ok) console.log(`[fake-peer] ${res.status}`, data);
    else if (!data.shared) {
      console.log("[fake-peer] сервер не вважає цього гравця мешканцем спільного острова — перевір PRESENCE_DEV_ROOM / PRESENCE_DEV_IDS і NODE_ENV");
      process.exit(1);
    } else {
      pending = pending.filter(([t]) => t > (sent.at(-1)?.[0] ?? 0));
      next = data.next;
      process.stdout.write(`\r[fake-peer] ${NAME} у «${SCENE}», бачить: ${data.peers.map((q) => q.name).join(", ") || "нікого"}, наступний запит за ${next} мс   `);
    }
  } catch (e) {
    console.log("[fake-peer]", e.message);
  }
  setTimeout(tick, next);
}
tick();

process.on("SIGINT", async () => {
  await fetch(`${URL_BASE}/api/presence`, { method: "DELETE", headers: { Authorization: auth } }).catch(() => {});
  console.log(`\n[fake-peer] ${NAME} пішов`);
  process.exit(0);
});
