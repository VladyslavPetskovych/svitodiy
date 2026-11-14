import { getRedis } from "../bot.js";
import { homeOwner } from "./household.js";
import { decoKey, nodesKey } from "./keys.js";

/**
 * Посаджені дерева на рідному острові (лише Mini App).
 *
 * Насінину дерева (tree_seed) знаходять у рибі (готування, cookDrops.js), ловлять вудкою з моря
 * (resources.js → FISHING_RESOURCE_WEIGHTS) і підбирають у корчах та водоростях на пляжі (nodes.js).
 * Садять її в будівництві («Посадки» → «Посадка»): це декор kind з полями
 * t — коли посадили, sp — що виросте (дуб, береза чи ялинка, кидаємо при посадці).
 *
 * Росте само, без поливу: горбик → паросток → деревце (стадії рахує клієнт за t, growMs і stages).
 * Коли минув growMs, дерево «дорослішає»: прикраса зникає, а на її місці стає справжній ресурс
 * у nodesKey з w: "planted" — його рубають сокирою, як дикі дерева, але він не рахується в норму
 * лісу острова (REALMS.home.target), тож посаджене не заважає дикому рости.
 */
export const TREE = {
  kind: "tree_sprout",
  growMs: 40 * 60_000,
  /** Стадії до зрілості: 0 — горбик, 1 — паросток, 2 — деревце. */
  stages: 3,
  /** Що виросте з насінини — вага. */
  species: { oak: 4, birch: 3, pine: 3 },
};

const SPECIES = Object.keys(TREE.species);

function pickSpecies() {
  let r = Math.random() * SPECIES.reduce((s, k) => s + TREE.species[k], 0);
  for (const k of SPECIES) if ((r -= TREE.species[k]) < 0) return k;
  return SPECIES.at(-1);
}

/** Що записати в прикрасу при посадці. */
export function plantedTree(now = Date.now()) {
  return { t: now, sp: pickSpecies() };
}

/**
 * Дорослі посаджені дерева стають ресурсами острова. Повертає декор без них.
 * Викликати до читання ресурсів (getNodes) — тоді нове дерево вже буде в стані.
 * @param {{ id: string, k: string, x: number, y: number, t?: number, sp?: string }[]} deco
 */
export async function ripenTrees(userId, deco, now = Date.now()) {
  const ripe = deco.filter((d) => d.k === TREE.kind && now - (Number(d.t) || 0) >= TREE.growMs);
  if (!ripe.length) return deco;
  const { owner } = await homeOwner(userId);
  const r = getRedis();
  const gone = new Set();
  for (const d of ripe) {
    gone.add(d.id);
    // hDel поверне 1 лише одному запиту — двоє одночасно не виростять два дерева з однієї насінини.
    if ((await r.hDel(decoKey(owner), d.id)) !== 1) continue;
    const k = SPECIES.includes(d.sp) ? d.sp : "oak";
    await r.hSet(nodesKey(owner), d.id, JSON.stringify({ k, x: d.x, y: d.y, w: "planted" }));
  }
  return deco.filter((d) => !gone.has(d.id));
}

/** Для каталогу. */
export function treesCatalog() {
  return { kind: TREE.kind, growMin: TREE.growMs / 60_000, stages: TREE.stages };
}
