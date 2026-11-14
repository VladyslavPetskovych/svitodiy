import { addFishToInventory, consumeResources, getFishMeta, getRedis } from "../bot.js";
import { getCables } from "./cables.js";
import { getDecor } from "./decor.js";
import { drain, settleLocked, withEnergyLock, writeCharge } from "./energy.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { FISH_HUT, HUT_MAX_LEVEL, hutCap, hutCount, hutLevel } from "./fishhut-def.js";
import { homeOwner } from "./household.js";
import { decoKey } from "./keys.js";
import { batteryCap, networksOf } from "./power.js";

/**
 * Рибальська хата (лише Mini App): стоїть на березі чи помості біля води й сама ловить рибу,
 * поки в її мережі є струм. Кожна риба коштує FISH_HUT.energy Вт·год з акумуляторів тієї ж мережі.
 * Налаштування (рівні, ціни покращень, місце для конвеєра) — у fishhut-def.js.
 *
 * Рахуємо ліниво, як сітки й акумулятори: у записі хати (decoKey) поле fc — коли востаннє ловила,
 * f — риба в хаті ({ id → штук }), lv — рівень. При читанні стану (і перед збором чи покращенням)
 * дивимось, скільки кроків everyMs минуло, — стільки риб і ловимо, доки є місце й енергія.
 * Час, коли хата стояла повна чи без струму, пропадає: риба не «накопичується в борг».
 */

/**
 * Що ловить хата: звичайна річкова й морська риба, зрідка — рідкісна. Міфічної сітка не тримає.
 * На 3 рівні глибший невід дістає ще й вугра.
 */
const TABLE = {
  perch: 12,
  trout: 10,
  carp: 10,
  river_bream: 8,
  pike: 4,
  whisker_cat: 2,
  coral_perch: 1.5,
  zander: 1,
};
const DEEP = { ...TABLE, storm_eel: 0.6 };

const ID = /^[a-z0-9]{6,16}$/;

function pick(table) {
  const entries = Object.entries(table).filter(([id]) => getFishMeta(id));
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of entries) if ((r -= w) < 0) return id;
  return entries.at(-1)[0];
}

function parse(raw) {
  try {
    const v = raw && JSON.parse(raw);
    return v?.k === FISH_HUT.kind ? v : null;
  } catch {
    return null;
  }
}

/**
 * Половити всіма хатами острова (вже під замком енергії). deco — з уже зарахованим зарядом.
 * Пише нові записи хат і заряд акумуляторів; повертає декор з оновленими хатами й акумуляторами.
 * @param {string} owner
 * @param {{ id: string, k: string, x: number, y: number, e?: number }[]} deco
 * @param {[number, number][]} cells
 * @param {number} now
 */
export async function fishLocked(owner, deco, cells, now) {
  const huts = deco.filter((d) => d.k === FISH_HUT.kind);
  if (!huts.length) return deco;
  const r = getRedis();
  const key = decoKey(owner);
  const { networks } = networksOf(cells, deco, now);
  /** Заряд акумуляторів по ходу: дві хати однієї мережі не витратять одну й ту саму енергію. */
  const charge = new Map(deco.filter((d) => batteryCap(d.k) > 0).map((d) => [d.id, Math.min(batteryCap(d.k), d.e ?? 0)]));
  const changed = new Map();

  for (const d of huts) {
    const item = parse(await r.hGet(key, d.id));
    if (!item) continue;
    // Щойно поставлена чи стара хата без відліку — починаємо зараз.
    if (!item.fc) {
      const next = { ...item, fc: now };
      await r.hSet(key, d.id, JSON.stringify(next));
      changed.set(d.id, next);
      continue;
    }
    const { everyMs } = FISH_HUT.levels[hutLevel(item) - 1];
    const steps = Math.floor((now - item.fc) / everyMs);
    if (steps < 1) continue;

    const net = networks.find((n) => n.devices.includes(d.id));
    const batteries = net ? deco.filter((b) => net.devices.includes(b.id) && charge.has(b.id)) : [];
    const have = batteries.reduce((s, b) => s + charge.get(b.id), 0);
    const space = Math.max(0, hutCap(item) - hutCount(item));
    const n = Math.max(0, Math.min(steps, space, Math.floor((have + 1e-9) / FISH_HUT.energy)));

    const f = { ...(item.f ?? {}) };
    const table = hutLevel(item) >= 3 ? DEEP : TABLE;
    for (let i = 0; i < n; i++) {
      const id = pick(table);
      f[id] = (f[id] ?? 0) + 1;
    }
    if (n > 0) {
      const used = drain(
        batteries.map((b) => ({ id: b.id, e: charge.get(b.id) })),
        n * FISH_HUT.energy
      );
      for (const [id, e] of used) charge.set(id, e);
      await writeCharge(owner, used);
    }
    // Ловила весь час — відлік від кінця останнього кроку; ні (повна чи без струму) — решта часу пропала.
    const fc = n === steps ? item.fc + steps * everyMs : now - ((now - item.fc) % everyMs);
    const next = { ...item, f, fc };
    await r.hSet(key, d.id, JSON.stringify(next));
    changed.set(d.id, next);
  }

  return deco.map((d) => {
    const hut = changed.get(d.id);
    if (hut) return { ...d, f: hut.f ?? {}, fc: hut.fc, ...(hut.lv && { lv: hut.lv }) };
    if (charge.has(d.id) && charge.get(d.id) !== Math.min(batteryCap(d.k), d.e ?? 0)) return { ...d, e: charge.get(d.id) };
    return d;
  });
}

/** Половити при читанні стану. Якщо зараз рахує інший запит — повертаємо як є (відлік не зсунувся). */
export async function settleFishHuts(userId, deco, cells, now = Date.now()) {
  if (!deco.some((d) => d.k === FISH_HUT.kind)) return deco;
  const { owner } = await homeOwner(userId);
  return (await withEnergyLock(owner, () => fishLocked(owner, deco, cells, now))) ?? deco;
}

/**
 * Взяти з хати до max риб (вже під замком). Так збирає гравець, так братиме й конвеєр.
 * @returns {Promise<Record<string, number>>} що взяли
 */
export async function takeFish(owner, hutId, max = Infinity) {
  const r = getRedis();
  const key = decoKey(owner);
  const item = parse(await r.hGet(key, hutId));
  if (!item) throw new GameError(404, "not_found", "Тут немає рибальської хати.");
  /** @type {Record<string, number>} */
  const got = {};
  const left = { ...(item.f ?? {}) };
  let room = max;
  // Спершу найцінніша — конвеєр із малою пропускною здатністю везе найкраще.
  const order = Object.keys(left).sort((a, b) => (getFishMeta(b)?.sellPrice ?? 0) - (getFishMeta(a)?.sellPrice ?? 0));
  for (const id of order) {
    if (room <= 0) break;
    const n = Math.min(room, Number(left[id]) || 0);
    if (n <= 0) continue;
    got[id] = n;
    left[id] -= n;
    if (left[id] <= 0) delete left[id];
    room -= n;
  }
  if (Object.keys(got).length) await r.hSet(key, hutId, JSON.stringify({ ...item, f: left }));
  return got;
}

/** Спершу дозарядити й доловити (щоб гравець забрав усе, що вже мало бути), потім — fn під тим самим замком. */
async function withHut(userId, hutId, fn) {
  if (typeof hutId !== "string" || !ID.test(hutId)) throw badRequest("Невідома хата.");
  const { owner } = await homeOwner(userId);
  const result = await withEnergyLock(
    owner,
    async () => {
      const now = Date.now();
      const cells = await getCables(userId);
      const deco = await settleLocked(owner, await getDecor(userId), cells, now);
      if (!deco.some((d) => d.id === hutId && d.k === FISH_HUT.kind)) throw new GameError(404, "not_found", "Тут немає рибальської хати.");
      await fishLocked(owner, deco, cells, now);
      return fn(owner);
    },
    { wait: true }
  );
  if (!result) throw new GameError(429, "cooldown", "Секунду — хата ще розбирає улов.");
  return result;
}

/** Забрати весь улов з хати в рюкзак. */
export async function collectFishHut(userId, hutId) {
  return withHut(userId, hutId, async (owner) => {
    const got = await takeFish(owner, hutId);
    if (!Object.keys(got).length) throw conflict("empty", "🐟 У хаті ще порожньо.");
    for (const [id, n] of Object.entries(got)) await addFishToInventory(userId, id, n);
    return { got };
  });
}

/** Покращити хату: більша комора й швидший мотор. */
export async function upgradeFishHut(userId, hutId) {
  return withHut(userId, hutId, async (owner) => {
    const r = getRedis();
    const key = decoKey(owner);
    const item = parse(await r.hGet(key, hutId));
    if (!item) throw new GameError(404, "not_found", "Тут немає рибальської хати.");
    const lv = hutLevel(item);
    if (lv >= HUT_MAX_LEVEL) throw conflict("max", "🛖 Хата вже найкраща.");
    const next = FISH_HUT.levels[lv];
    if (!(await consumeResources(userId, next.cost))) throw conflict("not_enough", "Не вистачає матеріалів.");
    await r.hSet(key, hutId, JSON.stringify({ ...item, lv: lv + 1 }));
    return { level: lv + 1, cap: next.cap };
  });
}

/** Для каталогу. */
export function fishHutCatalog() {
  return {
    kind: FISH_HUT.kind,
    energy: FISH_HUT.energy,
    levels: FISH_HUT.levels.map((l) => ({ cap: l.cap, everyMin: l.everyMs / 60_000, cost: l.cost ?? null })),
    port: FISH_HUT.port,
    fish: Object.keys(DEEP),
  };
}
