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
  {
    id: "river_bream",
    emoji: "🐟",
    name: "Лящ сріблястий",
    size: "38 см",
    flavor: "Класика річки — плоский, ситний, незворушний.",
    sellPrice: 2,
    weight: 1,
  },
  {
    id: "whisker_cat",
    emoji: "🐡",
    name: "Сомик-вусань",
    size: "44 см",
    flavor: "Тихий плавець з довгими вусами — витягнув із тіні корчів.",
    sellPrice: 4,
    weight: 0.75,
  },
  {
    id: "moon_carp",
    emoji: "🌙",
    name: "Місячний короп",
    size: "71 см",
    flavor:
      "Легенда води: світиться м’яким сяйвом — такого бачать раз на життя.",
    sellPrice: 45,
    weight: 0.035,
  },

  // ——— Глибоководні й рідкісні: рідше трапляються, дорожче продаються ———
  // Нові види лише дописуємо в кінець: id — ключ у рюкзаку гравця, змінювати не можна.
  {
    id: "coral_perch",
    emoji: "🐠",
    name: "Кораловий окунь",
    size: "35 см",
    flavor: "Яскравий, як рифи південних морів, — і такий самий примхливий.",
    sellPrice: 6,
    weight: 0.6,
  },
  {
    id: "zander",
    emoji: "🐟",
    name: "Судак — нічний вартовий",
    size: "58 см",
    flavor: "Бачить у темряві краще за тебе. Сьогодні програв.",
    sellPrice: 9,
    weight: 0.5,
  },
  {
    id: "storm_eel",
    emoji: "⚡",
    name: "Вугор-блискавка",
    size: "92 см",
    flavor: "Іскрить навіть на гачку — тримай вудку міцніше.",
    sellPrice: 14,
    weight: 0.35,
  },
  {
    id: "sea_wanderer_tuna",
    emoji: "🐟",
    name: "Тунець-мандрівник",
    size: "1,2 м",
    flavor: "Обплив пів світу, щоб потрапити саме на твій гачок.",
    sellPrice: 20,
    weight: 0.25,
  },
  {
    id: "elder_sturgeon",
    emoji: "🐋",
    name: "Осетер-патріарх",
    size: "1,6 м",
    flavor: "Пам'ятає ще перших рибалок цього острова. Поважно мовчить.",
    sellPrice: 32,
    weight: 0.12,
  },
  {
    id: "crystal_salmon",
    emoji: "💎",
    name: "Кришталевий лосось",
    size: "66 см",
    flavor: "Луска дзвенить, як скло. Крізь неї видно світло.",
    sellPrice: 60,
    weight: 0.04,
  },
  {
    id: "royal_catfish",
    emoji: "👑",
    name: "Королівський сом",
    size: "2,1 м",
    flavor: "Володар мулу й тіней. Вуса — як корона.",
    sellPrice: 95,
    weight: 0.018,
  },
  {
    id: "sunscale_koi",
    emoji: "☀️",
    name: "Сонцелуский коі",
    size: "54 см",
    flavor: "Під водою сяє, наче хтось упустив туди світанок.",
    sellPrice: 130,
    weight: 0.01,
  },
  {
    id: "abyss_dragonfish",
    emoji: "🐉",
    name: "Дракон-риба безодні",
    size: "2,8 м",
    flavor: "Про неї розповідають пошепки. Тепер розповідатимуть про тебе.",
    sellPrice: 200,
    weight: 0.005,
  },
];

const FISH_BY_ID = new Map(CATCHES.map((f) => [f.id, f]));

export function getFishMeta(fishId) {
  return FISH_BY_ID.get(fishId);
}

export function getFishSellPrice(fishId) {
  return FISH_BY_ID.get(fishId)?.sellPrice ?? 1;
}
