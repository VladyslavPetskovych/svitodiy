/**
 * Після «Приготувати» рибу випадають ресурси (ваговий випадковий вибір).
 * Змінюй weight, щоб частіше/рідше з’являлись інгредієнти.
 */

/** Скільки разів крутити таблицю (1–3) */
export const COOK_DROP_ROLLS = {
  min: 1,
  max: 3,
  /** Шанс додати +1 кидок після мінімуму */
  extraRollChance: 0.45,
  secondExtraChance: 0.2,
};

/** id має збігатися з data/resources.js */
export const COOK_DROP_WEIGHTS = [
  { id: "fish_eye", weight: 18 },
  { id: "seaweed", weight: 22 },
  { id: "old_coin", weight: 14 },
  { id: "glass_shard", weight: 16 },
  { id: "metal_scrap", weight: 16 },
  { id: "fish_bone", weight: 20 },
];

function pickWeighted(entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.id;
  }
  return entries[entries.length - 1].id;
}

/**
 * Повертає map resourceId -> кількість
 */
export function rollCookDrops() {
  const { min, max, extraRollChance, secondExtraChance } = COOK_DROP_ROLLS;
  let rolls = min;
  if (Math.random() < extraRollChance) rolls += 1;
  if (rolls >= 2 && Math.random() < secondExtraChance) rolls += 1;
  rolls = Math.min(rolls, max);

  /** @type {Record<string, number>} */
  const out = {};
  for (let i = 0; i < rolls; i++) {
    const id = pickWeighted(COOK_DROP_WEIGHTS);
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}
