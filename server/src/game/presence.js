import crypto from "crypto";
import { sharedHomeId } from "../bot.js";
import { badRequest } from "./errors.js";
import { getWear } from "./wardrobe.js";

/**
 * Хто ще зараз на спільному острові — живі мандрівники (лише для спільного дому, SHARED_HOME_PHONES
 * у telegram-bot/src/specialAccess.js). Гравці на своєму острові сюди не потрапляють узагалі.
 *
 * Усе — у пам'яті процесу (сервер один, див. docker-compose.yml): це косметика, а не прогрес,
 * тож у Redis не пишемо й у бекап (userBackup.js бере все svitodiy:*) воно не потрапляє.
 * Після перезапуску сервера кімнати просто збираються заново за кілька секунд.
 *
 * Звʼязок — звичайне опитування через проксі Netlify (WebSocket через нього не пройде):
 * клієнт раз на `next` мс шле кілька своїх останніх точок і отримує точки інших.
 * `next` задає сервер — так частоту можна підкрутити без нового деплою Mini App.
 *
 * Тут же — «версія острова» (rev): кожна зміна спільного острова (будівлі, декор, город, хата,
 * пси, ресурси) її збільшує, а клієнт, що бачив старішу, тихо перезавантажує /state.
 */

/** Розміри сцен у px — ті самі, що MAP (miniapp/src/game/walk/layout.js) і HOME_MAP (walk/home.js). */
const SCENES = [
  { id: "island", w: 512, h: 448 },
  { id: "home", w: 240, h: 192 },
];

/** Скільки мовчить гравець, поки ми вважаємо його ще на острові. */
const STALE_MS = 8_000;
/** Скільки історії точок тримаємо й віддаємо (вистачає на інтерполяцію з запасом). */
const KEEP_MS = 2_500;
const MAX_SAMPLES = 32;
/** Скільки точок приймаємо за раз (клієнт пише 10 на секунду). */
const MAX_IN = 16;
/** Наскільки «в минуле» може бути точка (ago, мс) — давніше просто ігноруємо. */
const MAX_AGO = 3_000;
const MAX_MEMBERS = 8;
/** Чий острів у гравця — кешуємо: інакше кожне опитування ходило б у Redis за номером телефону. */
const ROOM_CACHE_MS = 60_000;
/** Одяг інших оновлюємо не частіше (а після перевдягання — одразу, див. wearChanged). */
const WEAR_TTL_MS = 60_000;
/** Порожню кімнату без змін забуваємо — разом з її rev. */
const ROOM_IDLE_MS = 30 * 60_000;

/** Через скільки мс клієнтові прийти знову. */
const NEXT_MS = { together: 500, apart: 2_000, alone: 5_000 };

/**
 * Лише для локальної перевірки (server/scripts/fake-peer.mjs): id гравців, яких без номера
 * телефону вважаємо мешканцями кімнати PRESENCE_DEV_ROOM. У продакшені (NODE_ENV=production,
 * див. server/Dockerfile) вимкнено повністю.
 */
const DEV = process.env.NODE_ENV !== "production" && process.env.PRESENCE_DEV_ROOM
  ? { room: process.env.PRESENCE_DEV_ROOM, ids: new Set((process.env.PRESENCE_DEV_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) }
  : null;

/** Сіль для непрозорих id: інші гравці не бачать чужий Telegram id. Нова з кожним запуском. */
const SALT = crypto.randomBytes(16);
const peerIdOf = (userId) => crypto.createHmac("sha256", SALT).update(String(userId)).digest("base64url").slice(0, 10);

/* ───── Чий острів ───── */

/** @type {Map<string, { room: string|null, at: number }>} */
const roomCache = new Map();
/** @type {Map<string, Promise<string|null>>} */
const roomLoading = new Map();

/** Кімната (id спільного острова) гравця або null — свій острів, присутності немає. */
export function roomOf(userId) {
  const id = String(userId);
  if (DEV?.ids.has(id)) return Promise.resolve(DEV.room);
  const hit = roomCache.get(id);
  if (hit && Date.now() - hit.at < ROOM_CACHE_MS) return Promise.resolve(hit.room);
  if (!roomLoading.has(id)) {
    roomLoading.set(
      id,
      sharedHomeId(id)
        .then((room) => {
          roomCache.set(id, { room: room ?? null, at: Date.now() });
          return room ?? null;
        })
        .finally(() => roomLoading.delete(id))
    );
  }
  return roomLoading.get(id);
}

/* ───── Кімнати ───── */

/**
 * @typedef {{ pid: string, name: string, at: number, seq: number, fx: number, fy: number,
 *   samples: [number, number, number, number][], wear: object|null, wearAt: number, wearLoading: boolean }} Member
 * samples — [час сервера, x, y, сцена (індекс у SCENES)]
 * @type {Map<string, { members: Map<string, Member>, rev: number, seen: Map<string, number>, touched: number }>}
 */
const rooms = new Map();

function roomState(room) {
  let r = rooms.get(room);
  if (!r) {
    r = { members: new Map(), rev: 0, seen: new Map(), touched: Date.now() };
    rooms.set(room, r);
  }
  return r;
}

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [id, r] of rooms) {
    for (const [uid, m] of r.members) if (now - m.at > STALE_MS * 2) r.members.delete(uid);
    if (!r.members.size && now - r.touched > ROOM_IDLE_MS) rooms.delete(id);
  }
  for (const [id, c] of roomCache) if (now - c.at > ROOM_CACHE_MS * 10) roomCache.delete(id);
}, 5_000);
sweep.unref?.();

/* ───── Версія острова ───── */

/**
 * Хтось змінив спільний острів (виклик — після успішної дії, ДО getState).
 * Ніколи не кидає: присутність не має ламати саму дію.
 */
export async function bumpIsland(userId) {
  try {
    const room = await roomOf(userId);
    if (!room) return;
    const r = roomState(room);
    r.rev += 1;
    r.touched = Date.now();
  } catch (err) {
    console.error("[presence] bump failed:", err.message);
  }
}

/**
 * На початку getState: запам'ятати версію острова, яку гравець зараз побачить.
 * commit() — після того, як стан прочитано (якщо острів змінили посеред читання —
 * збережемо стару версію, і клієнт дочитає ще раз).
 */
export async function islandSnapshot(userId) {
  const room = await roomOf(userId).catch(() => null);
  if (!room) return { shared: false, commit() {} };
  const r = roomState(room);
  const rev = r.rev;
  const id = String(userId);
  return {
    shared: true,
    commit() {
      if ((r.seen.get(id) ?? -1) < rev) r.seen.set(id, rev);
    },
  };
}

/** Перевдягся — інші побачать новий одяг з наступним опитуванням. */
export function wearChanged(userId) {
  const id = String(userId);
  for (const r of rooms.values()) {
    const m = r.members.get(id);
    if (m) m.wearAt = 0;
  }
}

/* ───── Опитування ───── */

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function nameOf(tgUser) {
  const raw = tgUser.first_name || tgUser.username || "Мандрівник";
  return String(raw).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 16) || "Мандрівник";
}

/** Одяг з Redis — у фоні, раз на хвилину; поки вантажиться, лишається старий. */
function refreshWear(userId, m, now) {
  if (m.wearLoading || (m.wear && now - m.wearAt < WEAR_TTL_MS)) return;
  m.wearLoading = true;
  m.wearAt = now;
  getWear(userId)
    .then((w) => {
      m.wear = { hat: w.hat, top: w.top, bottom: w.bottom };
    })
    .catch(() => {})
    .finally(() => {
      m.wearLoading = false;
    });
}

/**
 * Тіло: { seq, fx, fy, s: [[ago, x, y, scene], ...] } — scene: 'island' | 'home',
 * ago — скільки мс тому (за годинником клієнта) була точка. Час ставимо свій, серверний.
 * @param {{ id: number, first_name?: string, username?: string }} tgUser
 */
export async function postPresence(tgUser, body) {
  const userId = String(tgUser.id);
  const room = await roomOf(userId);
  if (!room) return { shared: false };
  if (!body || typeof body !== "object" || !Array.isArray(body.s)) throw badRequest("Неправильні дані.");

  const now = Date.now();
  const r = roomState(room);
  let m = r.members.get(userId);
  if (!m) {
    if (r.members.size >= MAX_MEMBERS) return { shared: true, peers: [], changed: false, next: NEXT_MS.alone, serverTime: now };
    m = { pid: peerIdOf(userId), name: "", at: now, seq: -1, fx: 0, fy: 1, samples: [], wear: null, wearAt: 0, wearLoading: false };
    r.members.set(userId, m);
  }
  m.name = nameOf(tgUser);
  m.at = now;
  r.touched = now;

  // Старий пакет (прийшов після новішого) — точки не беремо, але відповідаємо як звичайно.
  const seq = num(body.seq);
  if (seq != null && seq > m.seq) {
    m.seq = seq;
    const fx = num(body.fx);
    const fy = num(body.fy);
    if (fx != null && fy != null && (fx || fy)) {
      const len = Math.hypot(fx, fy);
      m.fx = clamp(fx / len, -1, 1);
      m.fy = clamp(fy / len, -1, 1);
    }
    const last = m.samples.at(-1)?.[0] ?? 0;
    const fresh = [];
    for (const p of body.s.slice(-MAX_IN)) {
      if (!Array.isArray(p)) continue;
      const ago = num(p[0]);
      const x = num(p[1]);
      const y = num(p[2]);
      const sc = SCENES.findIndex((s) => s.id === p[3]);
      if (ago == null || x == null || y == null || sc < 0 || ago < 0 || ago > MAX_AGO) continue;
      const at = Math.round(now - ago);
      if (at <= last || at <= (fresh.at(-1)?.[0] ?? 0)) continue;
      const { w, h } = SCENES[sc];
      fresh.push([at, Math.round(clamp(x, 0, w) * 10) / 10, Math.round(clamp(y, 0, h) * 10) / 10, sc]);
    }
    if (fresh.length) m.samples = [...m.samples, ...fresh].filter((p) => now - p[0] <= KEEP_MS).slice(-MAX_SAMPLES);
  }
  refreshWear(userId, m, now);

  const myScene = m.samples.at(-1)?.[3];
  const peers = [];
  let together = false;
  for (const [uid, o] of r.members) {
    if (uid === userId || now - o.at > STALE_MS) continue;
    const s = o.samples.filter((p) => now - p[0] <= KEEP_MS);
    // Стоїть на місці довше за KEEP_MS — віддаємо хоча б останню точку.
    if (!s.length && o.samples.length) s.push(o.samples.at(-1));
    if (!s.length) continue;
    if (s.at(-1)[3] === myScene) together = true;
    peers.push({
      id: o.pid,
      name: o.name,
      wear: o.wear,
      fx: o.fx,
      fy: o.fy,
      s: s.map(([at, x, y, sc]) => [at, x, y, SCENES[sc].id]),
    });
  }

  return {
    shared: true,
    peers,
    // Острів змінили після того, як гравець востаннє бачив стан, — хай перечитає /state.
    changed: r.rev > (r.seen.get(userId) ?? -1),
    next: together ? NEXT_MS.together : peers.length ? NEXT_MS.apart : NEXT_MS.alone,
    serverTime: now,
  };
}

/** Пішов з острова (закрив екран / сховав апку) — інші перестануть його бачити одразу. */
export async function leavePresence(userId) {
  const room = await roomOf(userId);
  if (room) rooms.get(room)?.members.delete(String(userId));
  return {};
}
