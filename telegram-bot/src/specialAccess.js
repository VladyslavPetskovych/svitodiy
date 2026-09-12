import { getUserPhone } from "./userStore.js";

/**
 * Персональні розділи, доступні лише за номером телефону.
 * Номер бот знає тільки якщо користувач сам поділився контактом на /start.
 */

/** Кому відкривається розділ «Настя». Формат вільний — звіряємо лише цифри. */
const NASTIA_PHONES = ["+371 277 48107", "+380 98 340 55 78"];

/** Лишає самі цифри: «+371 277 48107» і «37127748107» стають однаковими. */
export function normalizePhone(raw) {
  return String(raw ?? "").replace(/\D+/g, "");
}

const NASTIA_DIGITS = new Set(NASTIA_PHONES.map(normalizePhone));

/** @param {string | null | undefined} raw — номер у будь-якому форматі */
export function isNastiaPhone(raw) {
  const digits = normalizePhone(raw);
  return digits.length > 0 && NASTIA_DIGITS.has(digits);
}

/** @returns {Promise<boolean>} */
export async function hasNastiaAccess(telegramUserId) {
  if (telegramUserId == null) return false;
  const phone = await getUserPhone(telegramUserId);
  return isNastiaPhone(phone);
}
