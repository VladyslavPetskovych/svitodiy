import { getRedis } from "../redisClient.js";
import {
  getDumosvitIntensity,
  randomDumosvitDelayMs,
} from "./intensity.js";

const ZKEY = "svitodiy:dumosvit:schedule";

export async function dumosvitScheduleNext(chatId) {
  const level = await getDumosvitIntensity(chatId);
  const at = Date.now() + randomDumosvitDelayMs(level);
  await getRedis().zAdd(ZKEY, { score: at, value: String(chatId) });
}

export async function dumosvitUnschedule(chatId) {
  await getRedis().zRem(ZKEY, String(chatId));
}

/** @returns {Promise<boolean>} */
export async function dumosvitIsScheduled(chatId) {
  const s = await getRedis().zScore(ZKEY, String(chatId));
  return s != null;
}

/**
 * Чати, у яких час нагадування вже настав.
 * @returns {Promise<string[]>}
 */
export async function dumosvitDueChatIds(limit = 80) {
  const now = Date.now();
  return getRedis().zRangeByScore(ZKEY, 0, now, {
    LIMIT: { offset: 0, count: limit },
  });
}

/** Забрати з розкладу перед відправкою (щоб не дублювати тік). */
export async function dumosvitPopDue(chatId) {
  return getRedis().zRem(ZKEY, String(chatId));
}
