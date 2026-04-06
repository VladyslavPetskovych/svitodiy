import { getRedis } from "../redisClient.js";

const KEY = (chatId) => `svitodiy:dumosvit:intensity:${chatId}`;

/** 1 — рідко, 2 — норма, 3 — часто */
export async function getDumosvitIntensity(chatId) {
  const raw = await getRedis().get(KEY(chatId));
  const n = raw == null ? 2 : Number(raw);
  return n >= 1 && n <= 3 ? n : 2;
}

/** @param {1|2|3} level */
export async function setDumosvitIntensity(chatId, level) {
  const n = Math.min(3, Math.max(1, Math.floor(Number(level)) || 2));
  await getRedis().set(KEY(chatId), String(n));
  return n;
}

export function intensityLabel(level) {
  if (level === 1) return "🐢 Рідко (2–4 год)";
  if (level === 3) return "⚡ Часто (8–25 хв)";
  return "🐇 Норма (30 хв — 2 год)";
}

/**
 * Випадкова затримка до наступного нагадування (мс) залежно від інтенсивності.
 * @param {1|2|3} level
 */
export function randomDumosvitDelayMs(level) {
  const ranges = {
    1: { min: 2 * 60 * 60 * 1000, max: 4 * 60 * 60 * 1000 },
    2: { min: 30 * 60 * 1000, max: 2 * 60 * 60 * 1000 },
    3: { min: 8 * 60 * 1000, max: 25 * 60 * 1000 },
  };
  const r = ranges[level] ?? ranges[2];
  return r.min + Math.floor(Math.random() * (r.max - r.min + 1));
}
