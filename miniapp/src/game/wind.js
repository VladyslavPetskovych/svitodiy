/**
 * Вітер для вітряків — копія server/src/game/wind.js (міняти разом!): кожні 10 с кожен вітряк
 * дає випадково від 0 до 40 Вт. Відтворюваний хеш від id і номера проміжку — тож Mini App показує
 * той самий вітер, що рахує сервер, без жодних запитів.
 */
export const WIND = { periodMs: 10_000, max: 40 }

/** Скільки Вт дає вітряк id у мить now (мс). */
export function windWatts(id, now) {
  const s = `${id}:${Math.floor(now / WIND.periodMs)}`
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) % (WIND.max + 1)
}
