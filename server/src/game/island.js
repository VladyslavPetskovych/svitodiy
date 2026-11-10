import { addBalance, addResourceToInventory, cropKey, getCrop, getRedis, seedKey } from "../bot.js";
import { DECOR } from "./decor.js";
import { BUILDINGS, harvest, spentOn } from "./homestead.js";
import { homeOwner } from "./household.js";
import { decoKey, farmKey, homeKey, nodesKey } from "./keys.js";

/**
 * Версії рідного острова.
 * 1 — будівлі на сталих місцях, поле 5×3, стежки й дерева намальовані в землі.
 * 2 — острів «з нуля» (виживання): стоїть лише хатинка й причал, решту гравець ставить сам,
 *     а дерева й каміння ростуть і їх добувають (nodes.js).
 */
export const ISLAND_VERSION = 2;

const DECOR_BY_ID = new Map(DECOR.map((d) => [d.id, d]));

const add = (into, from) => {
  for (const [id, n] of Object.entries(from)) into[id] = (into[id] ?? 0) + n;
  return into;
};

/**
 * Разово переводить острів на версію 2: скидає його до хатинки й причалу й повертає гравцеві все,
 * що він вклав — будівлі (усі рівні, ✨ теж), декор, посаджене насіння й стиглий урожай.
 * Хатинка (рівень, меблі, підлога), причал і пси лишаються як були.
 *
 * Повернене отримує той, хто першим відкрив острів після оновлення (у спільному домі — теж він).
 * Що саме повернули, лежить у полі resetNote, доки гравець не прочитає (ackReset).
 */
export async function ensureIsland(userId) {
  const { owner } = await homeOwner(userId);
  const r = getRedis();
  const key = homeKey(owner);
  if (Number(await r.hGet(key, "v")) >= ISLAND_VERSION) return;
  // Лише один запит робить скидання — решта бачать уже нову версію.
  if (!(await r.hSetNX(key, "v", String(ISLAND_VERSION)))) return;

  const h = await r.hGetAll(key);
  const [deco, farm] = await Promise.all([r.hGetAll(decoKey(owner)), r.hGetAll(farmKey(owner))]);
  const fresh = !h.collectedAt && !Object.keys(deco).length && !Object.keys(farm).length;
  await r.del(nodesKey(owner)); // ліс виросте з нуля при першому читанні
  if (fresh) return;

  // Спершу врожай за старими рівнями — інакше комора згоріла б разом з будівлями.
  const levels = Object.fromEntries(BUILDINGS.map((b) => [b.id, Number(h[`lvl:${b.id}`] ?? b.startLevel)]));
  let carry = {};
  try {
    carry = JSON.parse(h.carry ?? "{}");
  } catch {
    /* без залишків */
  }
  const got = h.collectedAt ? await harvest(userId, { levels, collectedAt: Number(h.collectedAt), carry, owner }) : {};

  /** @type {Record<string, number>} */
  const refund = {};
  const tx = r.multi();
  for (const b of BUILDINGS) {
    if (!b.placeable || !(levels[b.id] > 0)) continue;
    add(refund, spentOn(b, levels[b.id]));
    tx.hSet(key, `lvl:${b.id}`, "0");
    tx.hDel(key, `pos:${b.id}`);
  }
  for (const raw of Object.values(deco)) {
    try {
      add(refund, DECOR_BY_ID.get(JSON.parse(raw).k)?.cost ?? {});
    } catch {
      /* зіпсований запис */
    }
  }
  for (const raw of Object.values(farm)) {
    try {
      const p = JSON.parse(raw);
      const crop = p.c ? getCrop(p.c) : null;
      if (!crop) continue;
      // Посаджене — назад насінням; стигле — ще й найменшим урожаєм.
      add(refund, { [seedKey(crop.id)]: 1 });
      if ((Number(p.g) || 0) >= crop.stages) add(refund, { [cropKey(crop.id)]: crop.yield[0] });
    } catch {
      /* зіпсована грядка */
    }
  }
  tx.del(decoKey(owner));
  tx.del(farmKey(owner));
  tx.hSet(key, "resetNote", JSON.stringify({ refund, got, at: Date.now() }));
  await tx.exec();

  for (const [id, n] of Object.entries(refund)) {
    if (id === "balance") await addBalance(userId, n);
    else await addResourceToInventory(userId, id, n);
  }
  console.log(`[island] ${owner}: reset to v${ISLAND_VERSION}, refunded ${JSON.stringify(refund)} to ${userId}`);
}

/**
 * Що вже займає місце на острові — щоб ресурси не виростали в будівлях, декорі й на грядках.
 * Прямокутники [x, y, w, h] з невеликим запасом.
 */
export function takenBoxes(home, deco, farm) {
  const out = [];
  for (const b of BUILDINGS) {
    const p = home.pos?.[b.id];
    if (!p || !b.foot) continue;
    const [fw, fh] = b.foot;
    out.push([p.x - fw * 4 - 4, p.y - fh * 8 - 6, fw * 8 + 8, fh * 8 + 10]);
  }
  for (const d of deco) out.push([d.x - 14, d.y - 16, 28, 18]);
  for (const p of Object.values(farm.plots ?? {})) out.push([p.x - 10, p.y - 18, 20, 20]);
  return out;
}
