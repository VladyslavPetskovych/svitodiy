import { solarWatts } from './solar.js'
import { windWatts } from './wind.js'

/**
 * Генератори електрики: вітряк і сонячна панель. Скільки Вт дають просто зараз — з тих самих
 * формул, що й на сервері (wind.js, solar.js; server/src/game/power.js → genWatts), без запитів.
 */
export const GENERATORS = new Set(['windmill', 'solar'])
/** Найбільше, що дає панель (server/src/game/decor.js → solar.watts — міняти разом). */
export const SOLAR_MAX = 60

/** Скільки Вт дає генератор kind під id у мить now. */
export function genWatts(kind, id, now) {
  if (kind === 'solar') return solarWatts(SOLAR_MAX, now)
  if (kind === 'windmill') return windWatts(id, now)
  return 0
}
