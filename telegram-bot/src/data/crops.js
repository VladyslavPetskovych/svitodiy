/**
 * Городні культури для Mini App (поле біля хатинки на рідному острові).
 * У рюкзаку лежать як `seed_<id>` (насіння) і `crop_<id>` (урожай) — той самий hash інвентаря.
 * Бот лише показує їх у рюкзаку; садять і збирають у Mini App.
 *
 * Як у Stardew Valley: скопав → посадив → полив. Кожен полив — один ріст: за stageMin хвилин
 * рослина переходить на наступну стадію, і земля знову пересихає — треба полити ще раз.
 * stages — скільки поливів до врожаю; regrow — на яку стадію повертається після збору
 * (кущі, що плодоносять знову); garden — з якого рівня «Городу» продається насіння.
 */

/** @typedef {{ id: string, name: string, emoji: string, seedPrice: number, stages: number, stageMin: number,
 *   yield: [number, number], sellPrice: number, regrow?: number, garden: number, dogFood?: number,
 *   bonusSeeds?: [number, number] }} Crop */

/** @type {Crop[]} */
export const CROPS = [
  { id: "radish", name: "Редиска", emoji: "🔴", seedPrice: 2, stages: 3, stageMin: 8, yield: [1, 2], sellPrice: 4, garden: 0 },
  { id: "carrot", name: "Морква", emoji: "🥕", seedPrice: 3, stages: 4, stageMin: 15, yield: [1, 2], sellPrice: 8, garden: 0, dogFood: 1 },
  { id: "beet", name: "Буряк", emoji: "🟣", seedPrice: 5, stages: 4, stageMin: 30, yield: [1, 2], sellPrice: 14, garden: 1 },
  { id: "tomato", name: "Помідор", emoji: "🍅", seedPrice: 10, stages: 5, stageMin: 30, yield: [2, 3], sellPrice: 5, regrow: 3, garden: 1 },
  { id: "cabbage", name: "Капуста", emoji: "🥬", seedPrice: 8, stages: 5, stageMin: 45, yield: [1, 1], sellPrice: 26, garden: 2 },
  { id: "strawberry", name: "Полуниця", emoji: "🍓", seedPrice: 14, stages: 4, stageMin: 30, yield: [2, 3], sellPrice: 6, regrow: 2, garden: 2 },
  { id: "sunflower", name: "Соняшник", emoji: "🌻", seedPrice: 12, stages: 5, stageMin: 60, yield: [1, 1], sellPrice: 30, garden: 3, bonusSeeds: [0, 2] },
  { id: "pumpkin", name: "Гарбуз", emoji: "🎃", seedPrice: 20, stages: 6, stageMin: 90, yield: [1, 1], sellPrice: 72, garden: 3, dogFood: 2 },
];

const BY_ID = new Map(CROPS.map((c) => [c.id, c]));

/** @returns {Crop | undefined} */
export function getCrop(id) {
  return BY_ID.get(id);
}

export const seedKey = (id) => `seed_${id}`;
export const cropKey = (id) => `crop_${id}`;

/** Насіння / урожай за ключем інвентаря → { crop, kind } або null. */
export function farmItemOf(key) {
  const m = /^(seed|crop)_([a-z]+)$/.exec(String(key));
  const crop = m && BY_ID.get(m[2]);
  return crop ? { crop, kind: m[1] } : null;
}
