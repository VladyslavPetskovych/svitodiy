import { getRedis } from "../bot.js";

/**
 * Ключі Redis, яких немає в боті. Усі під префіксом `svitodiy:` —
 * тож автобекап бота (userBackup.js) зберігає і їх.
 */
export const userKey = (id) => `svitodiy:user:${id}`; // той самий hash, що в userStore.js
export const jobKey = (id) => `svitodiy:job:${id}`;
export const cooldownKey = (id, action) => `svitodiy:cd:${action}:${id}`;
export const dailyClaimKey = (id, day) => `svitodiy:daily:${id}:${day}`;
export const quizRewardKey = (id, day) => `svitodiy:quizrw:${id}:${day}`;

/**
 * Атомарний кулдаун: true — можна діяти, false — ще рано.
 * @param {number} userId
 * @param {string} action
 * @param {number} ms
 */
export async function takeCooldown(userId, action, ms) {
  const ok = await getRedis().set(cooldownKey(userId, action), "1", { NX: true, PX: ms });
  return ok === "OK";
}

/** Дата YYYY-MM-DD за Києвом — межа доби для щоденних нагород. */
export function kyivDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(date);
}

/** Попередній день для рядка YYYY-MM-DD. */
export function previousDay(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
