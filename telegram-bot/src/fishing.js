import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Локальні зображення в `telegram-bot/assets/` */
export const FISHING_SCENE_PATH = path.join(__dirname, "../assets/fishing-scene.png");
export const FISH_CATCH_PATH = path.join(__dirname, "../assets/fish-catch.png");

export const FISHING_PANEL_CAPTION =
  "🎣 Тиха вода… Натисни кнопку, щоб закинути вудку — без команди /fish.";

const CATCH_CHANCE = 0.52;

const CATCHES = [
  {
    emoji: "🐟",
    name: "Форель струмкова",
    size: "32 см",
    flavor: "Сріблястий блиск — наче монета з води.",
  },
  {
    emoji: "🐠",
    name: "Короп-втікач",
    size: "48 см",
    flavor: "Тягнув як підводний трактор.",
  },
  {
    emoji: "🐡",
    name: "Окунь з характером",
    size: "24 см",
    flavor: "Майже зірвав вудку — поважай його.",
  },
  {
    emoji: "🦈",
    name: "Щука «Суддя»",
    size: "61 см",
    flavor: "Зуби як у юриста — відпустив би, але вже пізно.",
  },
  {
    emoji: "✨",
    name: "Золотий карась (легендарний)",
    size: "29 см",
    flavor: "Рідкість! Сьогодні фортуна на твоєму боці.",
    weight: 3,
  },
];

const MISS_LINES = [
  "🌊 Тільки водорості й тиша. Риба сьогодні на нараді.",
  "🪱 Наживу з’їла дрібнота — ти навіть не помітив.",
  "🦆 Качка перехопила закид. (Ні, це жарт. Просто порожньо.)",
  "💨 Кльов був… у сусіда в чаті. У тебе — ні.",
  "🪨 Зачепив камінь і три секунди вірив, що це монстр.",
  "🌧️ Хмари на воді, риба пішла на глибину пити какао.",
  "📭 Порожній гачок. Наступного разу пощастить.",
];

function pickCatch() {
  const totalWeight = CATCHES.reduce((s, f) => s + (f.weight ?? 1), 0);
  let r = Math.random() * totalWeight;
  for (const fish of CATCHES) {
    r -= fish.weight ?? 1;
    if (r <= 0) return fish;
  }
  return CATCHES[CATCHES.length - 1];
}

function pickMiss() {
  return MISS_LINES[Math.floor(Math.random() * MISS_LINES.length)];
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Пауза перед результатом закиду (напруга). */
export function tensionDelayMs() {
  return 900 + Math.floor(Math.random() * 1400);
}

export const FISH_CAST_CALLBACK = "fish_cast";

export function fishCastKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🎣 Закинути вудку", callback_data: FISH_CAST_CALLBACK }],
    ],
  };
}

/**
 * Один «закид»: шанс клювання + вибір риби або текст промаху.
 * @returns {{ caught: true, fish: object } | { caught: false, missLine: string }}
 */
export function rollCastOutcome() {
  if (Math.random() < CATCH_CHANCE) {
    return { caught: true, fish: pickCatch() };
  }
  return { caught: false, missLine: pickMiss() };
}

export function formatCatchCaption(fish) {
  return `${fish.emoji} <b>Улов!</b>\n\n${fish.name}\n📏 ~${fish.size}\n<i>${fish.flavor}</i>`;
}
