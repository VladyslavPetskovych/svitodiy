import { getRedis } from "../bot.js";
import { homeOwner } from "./household.js";
import { decoKey, homeKey } from "./keys.js";
import { batteryCap, genEnergy, isGenerator, networksOf } from "./power.js";

/**
 * Енергія в акумуляторах (лише Mini App).
 *
 * Рахуємо ліниво, як улов сіток: коли читають стан острова, беремо час останнього розрахунку
 * (поле energyAt у homeKey) і для кожної мережі складаємо, скільки Вт·год дали її вітряки за цей
 * час (вітер відтворюваний — wind.js). Це йде в акумулятори тієї ж мережі, доки не заповняться;
 * решта пропадає. Мережа без акумулятора нічого не запасає.
 *
 * Мережу беремо таку, як зараз: якщо між читаннями кабель перерізали, проміжок рахується за новою.
 * Читають стан часто, тож похибка — секунди.
 *
 * Заряд — поле e (Вт·год) у записі акумулятора в decoKey. Розрахунок і витрата (піч) — під одним
 * замком на острів, щоб два запити не зарахували чи не списали одне й те саме двічі.
 */

/** Довше не рахуємо по 10-секундних проміжках: за 6 год вітряк і так заповнить будь-який акумулятор. */
const MAX_SPAN_MS = 6 * 3600_000;
const lockKey = (owner) => `svitodiy:lock:energy:${owner}`;
const round = (v) => Math.round(v * 1000) / 1000;

/**
 * Виконати fn під замком острова. wait — почекати (до ~1.5 с), інакше одразу null.
 * @template T
 * @param {string} owner
 * @param {() => Promise<T>} fn
 * @returns {Promise<T | null>}
 */
export async function withEnergyLock(owner, fn, { wait = false } = {}) {
  const r = getRedis();
  for (let i = 0; i < (wait ? 15 : 1); i++) {
    if ((await r.set(lockKey(owner), "1", { NX: true, PX: 4000 })) === "OK") {
      try {
        return await fn();
      } finally {
        await r.del(lockKey(owner));
      }
    }
    if (wait) await new Promise((res) => setTimeout(res, 100));
  }
  return null;
}

/**
 * Зарахувати енергію вітряків в акумулятори (вже під замком). Повертає декор з оновленим зарядом.
 * @param {string} owner
 * @param {{ id: string, k: string, x: number, y: number, e?: number }[]} deco
 * @param {[number, number][]} cells
 * @param {number} now
 */
export async function settleLocked(owner, deco, cells, now) {
  const r = getRedis();
  const hk = homeKey(owner);
  const last = Number(await r.hGet(hk, "energyAt")) || now;
  // Частіші за секунду читання нічого не дають — і не зсуваємо відлік, щоб не губити ці частки.
  if (now - last < 1000) return deco;
  const from = Math.max(last, now - MAX_SPAN_MS);

  const byId = new Map(deco.map((d) => [d.id, d]));
  const charge = new Map(); // id акумулятора → новий заряд
  for (const n of networksOf(cells, deco, now).networks) {
    const parts = n.devices.map((id) => byId.get(id)).filter(Boolean);
    const batteries = parts.filter((d) => batteryCap(d.k) > 0);
    const gens = parts.filter((d) => isGenerator(d.k));
    if (!batteries.length || !gens.length) continue;
    let made = gens.reduce((s, g) => s + genEnergy(g, from, now), 0);
    for (const b of batteries) {
      if (made <= 0) break;
      const cap = batteryCap(b.k);
      const e = Math.min(cap, b.e ?? 0);
      const add = Math.min(cap - e, made);
      if (add <= 0) continue;
      made -= add;
      charge.set(b.id, round(e + add));
    }
  }

  await writeCharge(owner, charge);
  await r.hSet(hk, "energyAt", String(now));
  return deco.map((d) => (charge.has(d.id) ? { ...d, e: charge.get(d.id) } : d));
}

/** Записати новий заряд акумуляторів (решта полів запису — як були). */
export async function writeCharge(owner, charge) {
  const r = getRedis();
  const key = decoKey(owner);
  for (const [id, e] of charge) {
    const raw = await r.hGet(key, id);
    if (!raw) continue;
    try {
      await r.hSet(key, id, JSON.stringify({ ...JSON.parse(raw), e }));
    } catch {
      /* зіпсований запис — пропускаємо */
    }
  }
}

/**
 * Зарахувати енергію при читанні стану. Якщо зараз рахує інший запит — повертаємо як є
 * (відлік не зсунувся, тож нічого не загубиться).
 */
export async function settleEnergy(userId, deco, cells, now = Date.now()) {
  if (!deco.some((d) => batteryCap(d.k) > 0)) {
    // Акумуляторів немає — нема куди запасати; відлік ведемо від зараз, щоб новий не отримав «старий» вітер.
    const { owner } = await homeOwner(userId);
    await getRedis().hSet(homeKey(owner), "energyAt", String(now));
    return deco;
  }
  const { owner } = await homeOwner(userId);
  return (await withEnergyLock(owner, () => settleLocked(owner, deco, cells, now))) ?? deco;
}

/**
 * Списати need Вт·год з акумуляторів (спершу з найповніших). Під замком. Повертає новий заряд.
 * @param {{ id: string, e?: number }[]} batteries
 * @param {number} need
 */
export function drain(batteries, need) {
  const charge = new Map();
  let left = need;
  for (const b of [...batteries].sort((a, c) => (c.e ?? 0) - (a.e ?? 0))) {
    if (left <= 0) break;
    const take = Math.min(b.e ?? 0, left);
    if (take <= 0) continue;
    left -= take;
    charge.set(b.id, round((b.e ?? 0) - take));
  }
  return charge;
}
