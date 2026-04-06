/**
 * Зсув ймовірності з «порожньо» на «риба».
 * Гачок і талісман сумуються (окремі слоти екіпіровки).
 */
export const HOOK_FISH_SHIFT = {
  relic_hook_silver: 0.1,
  relic_hook_gold: 0.18,
};

/** Перламутровий талісман / амулет рибалки — з алхімії */
export const TALISMAN_FISH_SHIFT = {
  relic_pearl_talisman: 0.06,
  relic_angler_charm: 0.08,
};

/** @param {string | null | undefined} equippedRelicId */
export function getHookFishShift(equippedRelicId) {
  if (equippedRelicId == null || equippedRelicId === "") return 0;
  return HOOK_FISH_SHIFT[equippedRelicId] ?? 0;
}

/** @param {string | null | undefined} equippedTalismanId */
export function getTalismanFishShift(equippedTalismanId) {
  if (equippedTalismanId == null || equippedTalismanId === "") return 0;
  return TALISMAN_FISH_SHIFT[equippedTalismanId] ?? 0;
}

/** Сума бонусів (гачок + талісман). */
export function getTotalGearFishShift(hookId, talismanId) {
  return getHookFishShift(hookId) + getTalismanFishShift(talismanId);
}
