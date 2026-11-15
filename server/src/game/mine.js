import { addResourceToInventory, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { decoKey, takeCooldown } from "./keys.js";

/**
 * Шахта на рідному острові (лише Mini App): ставлять у будівництві, далі сама добуває камінь —
 * по одному раз на everyMs. Тапнув — забрав, що набралося. Вміщає cap — що понад, те не добувається,
 * тож навідуватись варто хоча б раз на cap × everyMs.
 *
 * Декор з полем c — з якого моменту рахуємо видобуток (ставлять при будівництві й зсувають при зборі).
 * Рахуємо ліниво, як каучук у гевеї (rubber.js).
 */
export const MINE = {
  kind: "mine",
  res: "stone",
  everyMs: 30_000,
  cap: 20,
  // Жолоб праворуч біля купи руди (px від якоря): сюди кладуть стрічку конвеєра (belts.js).
  port: { dx: 18, dy: -2 },
};

const ID = /^[a-z0-9]{6,16}$/;

/** Скільки каменю набралося на мить now. */
export function mineReady(item, now = Date.now()) {
  const from = Number(item.c) || Number(item.t) || now;
  return Math.max(0, Math.min(MINE.cap, Math.floor((now - from) / MINE.everyMs)));
}

/** Забрати камінь із шахти. У спільному домі шахта спільна, камінь — тому, хто забрав. */
export async function collectMine(userId, id) {
  if (typeof id !== "string" || !ID.test(id)) throw badRequest("Невідома шахта.");
  const { owner } = await homeOwner(userId);
  // Замок на шахту: подвійний тап чи двоє мешканців разом не заберуть одне двічі.
  if (!(await takeCooldown(`${owner}:${id}`, "mine", 600))) throw new GameError(429, "cooldown", "Секунду — ще вантажиш вагонетку.");
  // Під замком острова, як і конвеєр (belts.js), що теж бере камінь із шахти: удвох не візьмуть один камінь двічі.
  // energy.js імпортує decor.js, а той — цей модуль, тож беремо замок, лише коли треба.
  const { withEnergyLock } = await import("./energy.js");
  const res = await withEnergyLock(owner, () => takeMine(userId, owner, id), { wait: true });
  if (!res) throw new GameError(429, "cooldown", "Секунду — ще вантажиш вагонетку.");
  return res;
}

async function takeMine(userId, owner, id) {
  const r = getRedis();
  const raw = await r.hGet(decoKey(owner), id);
  let item = null;
  try {
    item = raw && JSON.parse(raw);
  } catch {
    /* зіпсований запис */
  }
  if (!item || item.k !== MINE.kind) throw new GameError(404, "not_found", "Тут немає шахти.");
  const now = Date.now();
  const from = Number(item.c) || Number(item.t) || now;
  const n = mineReady(item, now);
  if (n < 1) throw conflict("empty", "⛏️ Ще копають — камінь буде за мить.");
  // Повна шахта — відлік з нуля; інакше залишок часу до наступного каменю не губиться.
  const c = (now - from) / MINE.everyMs >= MINE.cap ? now : from + n * MINE.everyMs;
  await r.hSet(decoKey(owner), id, JSON.stringify({ ...item, c }));
  await addResourceToInventory(userId, MINE.res, n);
  return { got: { [MINE.res]: n } };
}

/** Для каталогу. */
export function mineCatalog() {
  return { kind: MINE.kind, res: MINE.res, everySec: MINE.everyMs / 1000, cap: MINE.cap, port: MINE.port };
}
