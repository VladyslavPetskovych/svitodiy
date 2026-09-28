import {
  ALCHEMY_RECIPES,
  ARC_CATALOG,
  ARC_DURATION_DAYS,
  CATCHES,
  COOK_DROP_WEIGHTS,
  FISHING_CHANCES,
  HOOK_FISH_SHIFT,
  RELICS,
  RESOURCE_TYPES,
  TALISMAN_FISH_SHIFT,
  intensityLabel,
} from "../bot.js";

/**
 * Налаштування, яких у боті немає — лише для Mini App.
 * Економіку (✨) змінюють тут, щоб не шукати числа по коду.
 */
export const GAME_CONFIG = {
  /** Мінімум між закидами — захист від автоклікера. */
  castCooldownMs: 1500,
  exploreCooldownMs: 1500,
  /** Щоденна нагорода за серію днів поспіль (день 1…7, далі по колу). */
  dailyRewards: [5, 8, 10, 12, 15, 20, 30],
  /** +✨ за правильну відповідь у тесті Думосвіту, не більше cap за добу. */
  quizReward: 1,
  quizDailyCap: 20,
  /** Бої на островах — як у боті (menuHandlers.js). */
  encounterChance: 0.25,
  fightWinChance: 0.5,
  fightStake: 10,
};

/** Рідкість — для кольору рамки й анімації улову. */
const FISH_RARITY = {
  trout: "common",
  carp: "common",
  perch: "common",
  river_bream: "common",
  pike: "rare",
  whisker_cat: "rare",
  golden_crucian: "legendary",
  moon_carp: "mythic",
};

/** Острови з карти бота. Тривалість заготівлі — як у боті (6 кроків × 5 с). */
export const ISLANDS = [
  {
    id: "jungle",
    name: "Острів Джунглів",
    emoji: "🌴",
    description: "Густі хащі й багато деревини. У заростях чатує змія.",
    gather: { resourceId: "log", durationMs: 30_000, label: "Добути дерево", verb: "Рубаєш дерево" },
    monster: { id: "snake", name: "Змія" },
    calm: [
      "Ти проходиш хащами Джунглів. Знайшов сліди старого табору — тут точно є ресурси.",
      "Ліани, крики птахів і запах вологої землі. Сьогодні джунглі тебе пропустили.",
      "Під пальмою — старе вогнище. Хтось був тут до тебе і пішов поспіхом.",
    ],
  },
  {
    id: "blizzard",
    name: "Острів Хуртовини",
    emoji: "❄️",
    description: "Сніг, лід і крижаний вітер. У печерах бродить сніговик-голем.",
    gather: { resourceId: "ice_block", durationMs: 30_000, label: "Добути лід", verb: "Видовбуєш лід" },
    monster: { id: "golem", name: "Сніговик-голем" },
    calm: [
      "Ти розвідуєш льодяні печери Хуртовини. Знайшов безпечну стежку між заметами.",
      "Вітер стих на хвилину — і ти бачиш, як блищить лід на вершині.",
      "Під снігом — сліди великих лап. Добре, що вони ведуть в інший бік.",
    ],
  },
  {
    id: "desert",
    name: "Острів Пустеля",
    emoji: "🏜",
    description: "Гарячий пісок і таємниці під барханами. Скоро тут будуть події та бої.",
    locked: true,
  },
];

export function getIsland(id) {
  return ISLANDS.find((i) => i.id === id) ?? null;
}

/** Статичні дані гри для клієнта: назви, ціни, рецепти, шанси. */
export function buildCatalog() {
  const totalFishWeight = CATCHES.reduce((s, f) => s + (f.weight ?? 1), 0);
  return {
    fish: CATCHES.map((f) => ({
      id: f.id,
      emoji: f.emoji,
      name: f.name,
      size: f.size,
      flavor: f.flavor,
      sellPrice: f.sellPrice,
      rarity: FISH_RARITY[f.id] ?? "common",
      // Частка серед риби (не серед усіх закидів).
      share: (f.weight ?? 1) / totalFishWeight,
    })),
    resources: RESOURCE_TYPES.map((r) => ({ id: r.id, emoji: r.emoji, name: r.name })),
    relics: RELICS.map((r) => ({
      id: r.id,
      emoji: r.emoji,
      name: r.name,
      slot: r.id in HOOK_FISH_SHIFT ? "hook" : r.id in TALISMAN_FISH_SHIFT ? "talisman" : null,
      fishBonus: HOOK_FISH_SHIFT[r.id] ?? TALISMAN_FISH_SHIFT[r.id] ?? 0,
    })),
    recipes: ALCHEMY_RECIPES.map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      consumes: r.consumes,
      output: r.relicId
        ? { id: r.relicId, amount: 1 }
        : { id: r.resourceId, amount: Math.max(1, Number(r.outputAmount ?? 1)) },
    })),
    cookDrops: COOK_DROP_WEIGHTS.map((d) => d.id),
    fishingChances: FISHING_CHANCES,
    islands: ISLANDS.map(({ calm: _calm, ...rest }) => rest),
    arcs: ARC_CATALOG.map((a) => ({ id: a.id, title: a.title, emoji: a.emoji, summary: a.summary })),
    arcDurationDays: ARC_DURATION_DAYS,
    dumosvitIntensity: [1, 2, 3].map((level) => ({ level, label: intensityLabel(level) })),
    config: {
      dailyRewards: GAME_CONFIG.dailyRewards,
      quizReward: GAME_CONFIG.quizReward,
      quizDailyCap: GAME_CONFIG.quizDailyCap,
      fightStake: GAME_CONFIG.fightStake,
    },
  };
}
