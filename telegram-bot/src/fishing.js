import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CATCHES,
  getFishMeta,
  getFishSellPrice,
} from "./data/fishTypes.js";
import { FISHING_CHANCES } from "./data/fishingChances.js";
import { getTotalGearFishShift } from "./data/fishingHooks.js";
import { pickRandomFishingResource } from "./data/resources.js";
import { getRelicMeta, pickRandomFishingRelic } from "./data/relics.js";
import {
  getEquippedHook,
  getEquippedTalisman,
  getInventory,
} from "./userStore.js";
import {
  CB_FISH_PANEL_BACK,
  CB_FISH_PANEL_INV,
} from "./menuConstants.js";

export { CATCHES, getFishMeta, getFishSellPrice };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FISHING_SCENE_PATH = path.join(__dirname, "../assets/fishing-scene.png");
export const FISH_CATCH_PATH = path.join(__dirname, "../assets/fish-catch.png");
export const MAIN_MENU_IMAGE_PATH = path.join(__dirname, "../assets/menu-main.png");

export const FISHING_PANEL_CAPTION =
  "🎣 <b>Риболовля</b>\n\n" +
  "🌊 Закинь вудку: <b>риба</b>, <b>ресурси</b> з води, іноді — <b>реліквія</b>.\n\n" +
  "⬅️ <b>Назад</b> — у головне меню.\n" +
  "🎒 <b>Інвентар</b> — риба, ресурси, реліквії.";

/**
 * @param {string | null} equippedHookId
 * @param {string | null} equippedTalismanId
 */
export function formatFishingPanelCaption(equippedHookId, equippedTalismanId) {
  let cap = FISHING_PANEL_CAPTION;
  const parts = [];
  if (equippedHookId) {
    const m = getRelicMeta(equippedHookId);
    parts.push(`${m?.emoji ?? "🪝"} ${m?.name ?? equippedHookId}`);
  }
  if (equippedTalismanId) {
    const m = getRelicMeta(equippedTalismanId);
    parts.push(`${m?.emoji ?? "🦪"} ${m?.name ?? equippedTalismanId}`);
  }
  if (parts.length > 0) {
    cap += `\n\n<b>Вдягнуто:</b> ${parts.join(" · ")}`;
  }
  return cap;
}

export function resolveCatchImagePath(fishId) {
  const specific = path.join(__dirname, `../assets/fish-${fishId}.png`);
  if (fs.existsSync(specific)) return specific;
  return FISH_CATCH_PATH;
}

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

export function tensionDelayMs() {
  return 900 + Math.floor(Math.random() * 1400);
}

export const FISH_CAST_CALLBACK = "fish_cast";

export function fishPanelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🎣 Закинути вудку", callback_data: FISH_CAST_CALLBACK }],
      [
        { text: "⬅️ Назад у меню", callback_data: CB_FISH_PANEL_BACK },
        { text: "🎒 Інвентар", callback_data: CB_FISH_PANEL_INV },
      ],
    ],
  };
}

export const FH_EQUIP_SILVER = "fh_sil";
export const FH_EQUIP_GOLD = "fh_gol";
export const FH_EQUIP_NONE = "fh_non";

export const FT_EQUIP_PEARL = "ft_pr";
export const FT_EQUIP_ANGLER = "ft_an";
export const FT_TAL_NONE = "ft_nt";

/**
 * Кнопки гачків і талісманів, якщо вони є в інвентарі.
 * @param {number} userId
 */
export async function buildFishPanelKeyboard(userId) {
  const inv = await getInventory(userId);
  const eq = await getEquippedHook(userId);
  const eqT = await getEquippedTalisman(userId);
  const hasSilver = (inv.relic_hook_silver ?? 0) > 0;
  const hasGold = (inv.relic_hook_gold ?? 0) > 0;
  const hasPearl = (inv.relic_pearl_talisman ?? 0) > 0;
  const hasAngler = (inv.relic_angler_charm ?? 0) > 0;

  const rows = [[{ text: "🎣 Закинути вудку", callback_data: FISH_CAST_CALLBACK }]];

  if (hasSilver || hasGold) {
    const hookRow = [];
    if (hasSilver) {
      hookRow.push({
        text: eq === "relic_hook_silver" ? "✅ 🪙 Срібний" : "🪙 Срібний гачок",
        callback_data: FH_EQUIP_SILVER,
      });
    }
    if (hasGold) {
      hookRow.push({
        text: eq === "relic_hook_gold" ? "✅ 🌟 Золотий" : "🌟 Золотий гачок",
        callback_data: FH_EQUIP_GOLD,
      });
    }
    hookRow.push({ text: "⭕ Без гачка", callback_data: FH_EQUIP_NONE });
    rows.push(hookRow);
  }

  if (hasPearl || hasAngler) {
    const talRow = [];
    if (hasPearl) {
      talRow.push({
        text: eqT === "relic_pearl_talisman" ? "✅ 🦪 Перламутр" : "🦪 Перламутр",
        callback_data: FT_EQUIP_PEARL,
      });
    }
    if (hasAngler) {
      talRow.push({
        text: eqT === "relic_angler_charm" ? "✅ 🧿 Амулет" : "🧿 Амулет рибалки",
        callback_data: FT_EQUIP_ANGLER,
      });
    }
    talRow.push({ text: "⭕ Без талісмана", callback_data: FT_TAL_NONE });
    rows.push(talRow);
  }

  rows.push([
    { text: "⬅️ Назад у меню", callback_data: CB_FISH_PANEL_BACK },
    { text: "🎒 Інвентар", callback_data: CB_FISH_PANEL_INV },
  ]);

  return { inline_keyboard: rows };
}

export function fishResultDoneKeyboard(panelChatId, panelMessageId) {
  const data = `fok_${panelChatId}_${panelMessageId}`;
  if (Buffer.byteLength(data, "utf8") > 64) {
    throw new Error("fish_ok: callback_data перевищує ліміт Telegram (64 байт)");
  }
  return {
    inline_keyboard: [[{ text: "✓ Окей", callback_data: data }]],
  };
}

export const FISH_RESULT_OK_RE = /^fok_(-?\d+)_(\d+)$/;

/**
 * @returns {Promise<{ kind: "relic", relic: object } | { kind: "resource", resource: object } | { kind: "fish", fish: object } | { kind: "miss", missLine: string }>}
 */
export async function rollCastOutcome(telegramUserId) {
  const base = { ...FISHING_CHANCES };
  const hookId = await getEquippedHook(telegramUserId);
  const talId = await getEquippedTalisman(telegramUserId);
  const shift = getTotalGearFishShift(hookId, talId);
  if (shift > 0) {
    const maxShift = Math.min(shift, Math.max(0, base.miss - 0.02));
    base.fish += maxShift;
    base.miss -= maxShift;
  }

  const { relic, resource, fish, miss } = base;
  const r = Math.random();
  if (r < relic) {
    return { kind: "relic", relic: pickRandomFishingRelic() };
  }
  if (r < relic + resource) {
    return { kind: "resource", resource: pickRandomFishingResource() };
  }
  if (r < relic + resource + fish) {
    return { kind: "fish", fish: pickCatch() };
  }
  if (Math.abs(relic + resource + fish + miss - 1) > 0.01) {
    console.warn(
      "[fishing] FISHING_CHANCES у data/fishingChances.js мають давати суму 1.0, зараз:",
      relic + resource + fish + miss
    );
  }
  return { kind: "miss", missLine: pickMiss() };
}

export function formatCatchCaption(fish) {
  return `${fish.emoji} <b>Улов!</b>\n\n${fish.name}\n📏 ~${fish.size}\n<i>${fish.flavor}</i>`;
}

export function formatRelicCatchCaption(relic, total) {
  return (
    `🏺 <b>Реліквія!</b>\n\n` +
    `${relic.emoji} <b>${relic.name}</b>\n` +
    `<i>Рідкісна знахідка з глибин.</i>\n\n` +
    `🎒 У колекції ця реліквія: <b>×${total}</b>`
  );
}
