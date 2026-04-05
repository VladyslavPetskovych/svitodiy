/**
 * Види риб і характеристики (улов, інвентар, ціна продажу).
 * Зображення улову: assets/fish-<id>.png або загальний fish-catch.png.
 */

/** @typedef {{ id: string, emoji: string, name: string, size: string, flavor: string, sellPrice: number, weight?: number }} FishSpecies */

/** @type {FishSpecies[]} */
export const CATCHES = [
  {
    id: "trout",
    emoji: "🐟",
    name: "Форель струмкова",
    size: "32 см",
    flavor: "Сріблястий блиск — наче монета з води.",
    sellPrice: 2,
  },
  {
    id: "carp",
    emoji: "🐠",
    name: "Короп-втікач",
    size: "48 см",
    flavor: "Тягнув як підводний трактор.",
    sellPrice: 2,
  },
  {
    id: "perch",
    emoji: "🐡",
    name: "Окунь з характером",
    size: "24 см",
    flavor: "Майже зірвав вудку — поважай його.",
    sellPrice: 1,
  },
  {
    id: "pike",
    emoji: "🦈",
    name: "Щука «Суддя»",
    size: "61 см",
    flavor: "Зуби як у юриста — відпустив би, але вже пізно.",
    sellPrice: 3,
  },
  {
    id: "golden_crucian",
    emoji: "✨",
    name: "Золотий карась (легендарний)",
    size: "29 см",
    flavor: "Рідкість! Сьогодні фортуна на твоєму боці.",
    sellPrice: 8,
    weight: 3,
  },
];

const FISH_BY_ID = new Map(CATCHES.map((f) => [f.id, f]));

export function getFishMeta(fishId) {
  return FISH_BY_ID.get(fishId);
}

export function getFishSellPrice(fishId) {
  return FISH_BY_ID.get(fishId)?.sellPrice ?? 1;
}
