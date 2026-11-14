/**
 * Вітер для вітряків: кожні WIND.periodMs кожен вітряк дає випадково від 0 до WIND.max Вт.
 * «Випадково», але відтворювано — хеш від id вітряка й номера 10-секундного проміжку. Тож сервер
 * і Mini App (miniapp/src/game/wind.js — та сама функція, міняти разом!) бачать однаковий вітер
 * без жодних запитів, а сервер може порахувати, скільки вітряк дав за будь-який минулий час.
 */
export const WIND = { periodMs: 10_000, max: 40 };

/** Скільки Вт дає вітряк id у мить now (мс). */
export function windWatts(id, now) {
  const s = `${id}:${Math.floor(now / WIND.periodMs)}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) % (WIND.max + 1);
}

/** Скільки Вт·год дав вітряк id за проміжок [from, to) мс — сума по 10-секундних проміжках. */
export function windEnergy(id, from, to) {
  if (to <= from) return 0;
  const P = WIND.periodMs;
  let wh = 0;
  for (let k = Math.floor(from / P); k * P < to; k++) {
    const a = Math.max(from, k * P);
    const b = Math.min(to, (k + 1) * P);
    wh += (windWatts(id, k * P) * (b - a)) / 3_600_000;
  }
  return wh;
}
