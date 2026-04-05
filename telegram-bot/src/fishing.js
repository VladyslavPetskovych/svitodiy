import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CATCHES,
  getFishMeta,
  getFishSellPrice,
} from "./data/fishTypes.js";
import { FISHING_CHANCES } from "./data/fishingChances.js";
import { pickRandomFishingResource } from "./data/resources.js";
import { pickRandomFishingRelic } from "./data/relics.js";
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
  "🌊 Закинь вудку: можлива <b>риба</b>, <b>ресурси</b> з води (гілка, камінь, мушля), рідко — <b>🏺 реліквія</b>.\n\n" +
  "⬅️ <b>Назад</b> — у головне меню.\n" +
  "🎒 <b>Інвентар</b> — риба, ресурси, реліквії.";

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
 * @returns {{ kind: "relic", relic: object } | { kind: "resource", resource: object } | { kind: "fish", fish: object } | { kind: "miss", missLine: string }}
 */
export function rollCastOutcome() {
  const { relic, resource, fish, miss } = FISHING_CHANCES;
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
  if (Math.abs(relic + resource + fish + miss - 1) > 0.001) {
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
