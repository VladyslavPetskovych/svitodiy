import { getRedis } from "../redisClient.js";

const KEY = (chatId) => `svitodiy:dumosvit:intensity:${chatId}`;

/** 1 — рідко, 2 — норма, 3 — часто, 4 — інтенсив */
export const DUMOSVIT_LEVELS = [1, 2, 3, 4];
const MAX_LEVEL = DUMOSVIT_LEVELS.length;

export async function getDumosvitIntensity(chatId) {
  const raw = await getRedis().get(KEY(chatId));
  const n = raw == null ? 2 : Number(raw);
  return n >= 1 && n <= MAX_LEVEL ? n : 2;
}

/** @param {1|2|3|4} level */
export async function setDumosvitIntensity(chatId, level) {
  const n = Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number(level)) || 2));
  await getRedis().set(KEY(chatId), String(n));
  return n;
}

export function intensityLabel(level) {
  if (level === 1) return "🐢 Рідко (2–4 год, 5 нових слів/день)";
  if (level === 3) return "⚡ Часто (8–25 хв, 20 нових слів/день)";
  if (level === 4) return "🔥 Інтенсив (3–8 хв, 35 нових слів/день)";
  return "🐇 Норма (30 хв — 2 год, 10 нових слів/день)";
}

/** Скільки нових слів на день вводимо на цій інтенсивності. */
export function newWordsPerDay(level) {
  return { 1: 5, 2: 10, 3: 20, 4: 35 }[level] ?? 10;
}

/**
 * Випадкова затримка до наступного нагадування (мс) залежно від інтенсивності.
 * @param {1|2|3|4} level
 */
export function randomDumosvitDelayMs(level) {
  const ranges = {
    1: { min: 2 * 60 * 60 * 1000, max: 4 * 60 * 60 * 1000 },
    2: { min: 30 * 60 * 1000, max: 2 * 60 * 60 * 1000 },
    3: { min: 8 * 60 * 1000, max: 25 * 60 * 1000 },
    4: { min: 3 * 60 * 1000, max: 8 * 60 * 1000 },
  };
  const r = ranges[level] ?? ranges[2];
  return r.min + Math.floor(Math.random() * (r.max - r.min + 1));
}
