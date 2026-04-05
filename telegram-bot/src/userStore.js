import { getRedis } from "./redisClient.js";

const PREFIX = "svitodiy";
const PANEL_TTL_SEC = 7 * 24 * 3600;

function userKey(telegramUserId) {
  return `${PREFIX}:user:${telegramUserId}`;
}

function panelKey(chatId, messageId) {
  return `${PREFIX}:panel:${chatId}:${messageId}`;
}

/**
 * Хто відкрив цю панель (повідомлення з кнопкою). Інший user_id не зможе використати кнопку.
 */
export async function setPanelOwner(chatId, messageId, telegramUserId) {
  await getRedis().setEx(
    panelKey(chatId, messageId),
    PANEL_TTL_SEC,
    String(telegramUserId)
  );
}

/** @returns {number | null} */
export async function getPanelOwner(chatId, messageId) {
  const raw = await getRedis().get(panelKey(chatId, messageId));
  if (raw == null) return null;
  return Number(raw);
}

/**
 * Після закиду оновлюємо лічильники лише для цього telegram user id.
 */
export async function recordFishingCast(telegramUserId, caught) {
  const key = userKey(telegramUserId);
  const r = getRedis();
  const p = r.multi();
  p.hIncrBy(key, "casts", 1);
  p.hIncrBy(key, caught ? "catches" : "misses", 1);
  p.hSet(key, "updatedAt", new Date().toISOString());
  await p.exec();
}

/**
 * Перший візит (наприклад /start) — окремо від рибалки.
 */
export async function touchUser(telegramUserId) {
  const key = userKey(telegramUserId);
  await getRedis().hSetNX(key, "firstSeenAt", new Date().toISOString());
}

/**
 * @returns {Promise<{ casts: number, catches: number, misses: number }>}
 */
export async function getUserStats(telegramUserId) {
  const h = await getRedis().hGetAll(userKey(telegramUserId));
  return {
    casts: Number(h.casts ?? 0),
    catches: Number(h.catches ?? 0),
    misses: Number(h.misses ?? 0),
  };
}

export function formatStatsLine(stats) {
  return `📊 Твоя статистика: закидів ${stats.casts} · уловів ${stats.catches} · порожніх ${stats.misses}`;
}
