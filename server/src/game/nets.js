import { addResourceToInventory, getRedis } from "../bot.js";
import { homeOwner } from "./household.js";
import { decoKey, takeCooldown } from "./keys.js";
import { NET } from "./nodes.js";

/**
 * Сітки в морі сами ловлять дари моря (лише Mini App).
 *
 * Кожна сітка раз на everyMs витягує один улов з таблиці (ваговий вибір). Рахуємо ліниво, як ріст
 * ресурсів: при кожному читанні стану скільки кроків минуло з останнього запису (поле nc у прикраси)
 * — стільки уловів одразу йде в рюкзак. Сітка, яку не перевіряли довго, ловить найбільше capSteps кроків;
 * далі море лишає сітку порожньою, тож вона не «накопичує» без межі.
 *
 * Улов — дари моря й рідкісне: насінини дерев, мідний злиточок. Гевея й дерева тут не ростуть.
 */
export const NET_CATCH = {
  everyMs: 15 * 60_000,
  capSteps: 32,
  table: {
    seaweed: 14,
    shell: 12,
    fish_bone: 8,
    stone: 5,
    twig: 5,
    glass_shard: 5,
    old_coin: 4,
    tree_seed: 1.5,
    copper_ingot: 1,
    rubber_seed: 0.5,
  },
};

function pick(table) {
  const entries = Object.entries(table);
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of entries) if ((r -= w) < 0) return id;
  return entries.at(-1)[0];
}

/**
 * Зарахувати уловлене сітками гравця за минулий час. Повертає суму, що впала в рюкзак.
 * @param {string} userId
 * @param {{ id: string, k: string, nc?: number }[]} deco
 * @param {number} now
 * @returns {Promise<Record<string, number>>}
 */
export async function creditNets(userId, deco, now = Date.now()) {
  const nets = deco.filter((d) => d.k === NET.kind);
  /** @type {Record<string, number>} */
  const got = {};
  if (!nets.length) return got;
  const { owner } = await homeOwner(userId);
  // Два запити одночасно не зарахують один улов двічі.
  if (!(await takeCooldown(owner, "netcatch", 1500))) return got;
  const r = getRedis();
  const key = decoKey(owner);
  for (const d of nets) {
    const raw = await r.hGet(key, d.id);
    let item = null;
    try {
      item = raw && JSON.parse(raw);
    } catch {
      /* зіпсований запис */
    }
    if (!item || item.k !== NET.kind) continue;
    // Сітка без запису часу — щойно поставлена або стара: відлік починаємо зараз, без уловів.
    if (!item.nc) {
      await r.hSet(key, d.id, JSON.stringify({ ...item, nc: now }));
      continue;
    }
    const steps = Math.min(NET_CATCH.capSteps, Math.floor((now - item.nc) / NET_CATCH.everyMs));
    if (steps < 1) continue;
    for (let i = 0; i < steps; i++) {
      const id = pick(NET_CATCH.table);
      got[id] = (got[id] ?? 0) + 1;
    }
    // Відлік — від кінця останнього кроку; якщо ліміт — відлік від зараз (далі море порожнє).
    const full = Math.floor((now - item.nc) / NET_CATCH.everyMs) > NET_CATCH.capSteps;
    const nc = full ? now : item.nc + steps * NET_CATCH.everyMs;
    await r.hSet(key, d.id, JSON.stringify({ ...item, nc }));
  }
  for (const [id, n] of Object.entries(got)) await addResourceToInventory(userId, id, n);
  return got;
}

/** Скільки мс до наступного улову найближчої сітки (для напису). */
export function nextCatchIn(net, now = Date.now()) {
  if (!net?.nc) return NET_CATCH.everyMs;
  return NET_CATCH.everyMs - ((now - net.nc) % NET_CATCH.everyMs);
}

/** Для каталогу. */
export function netsCatalog() {
  return { everyMin: NET_CATCH.everyMs / 60_000, capSteps: NET_CATCH.capSteps, table: Object.keys(NET_CATCH.table) };
}
