import { getRedis } from "../redisClient.js";
import {
  getDumosvitIntensity,
  randomDumosvitDelayMs,
} from "./intensity.js";

const ZKEY = "svitodiy:dumosvit:schedule";

/** Тиха пора за Києвом: з 23:00 до 08:00 картки не надсилаємо. */
const QUIET_FROM_HOUR = 23;
const QUIET_TO_HOUR = 8;

export function kyivHourMinute(ms) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { h: get("hour"), m: get("minute") };
}

/** Якщо час припадає на ніч — переносимо на ранок (08:00–08:20). */
function skipQuietHours(at) {
  const { h, m } = kyivHourMinute(at);
  let minutesToMorning = null;
  if (h >= QUIET_FROM_HOUR) minutesToMorning = (24 - h + QUIET_TO_HOUR) * 60 - m;
  else if (h < QUIET_TO_HOUR) minutesToMorning = (QUIET_TO_HOUR - h) * 60 - m;
  if (minutesToMorning == null) return at;
  return at + minutesToMorning * 60_000 + Math.floor(Math.random() * 20 * 60_000);
}

export async function dumosvitScheduleNext(chatId) {
  const level = await getDumosvitIntensity(chatId);
  const at = skipQuietHours(Date.now() + randomDumosvitDelayMs(level));
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

/** Усі чати з увімкненими нагадуваннями. */
export async function dumosvitScheduledChatIds() {
  return getRedis().zRange(ZKEY, 0, -1);
}
