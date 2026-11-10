/**
 * Погода світу Світодія: однакова для всіх гравців і рахується з самого часу, без збереження.
 * ТОЧНА КОПІЯ — server/src/game/weather.js: сервер рахує ріст городу за тією ж формулою.
 * Міняєш тут — скопіюй туди (інакше рослини на екрані «виростатимуть» не тоді, коли на сервері).
 *
 * Час ділимо на блоки по 2 години (від епохи, UTC). Кожен блок має свою погоду з гладкого
 * шуму: фронти тягнуться по кілька блоків, тож дощ іде годинами, а не блимає.
 * Дощ і гроза поливають город (див. advancePlot у server/src/game/farm.js).
 */

export const WEATHER_BLOCK_MS = 2 * 3_600_000;
/** Скільки блоків максимум проглядати в пошуках дощу (~33 доби). */
const SCAN_LIMIT = 400;

export const WEATHER = {
  clear: { id: "clear", emoji: "☀️", name: "Ясно" },
  cloudy: { id: "cloudy", emoji: "☁️", name: "Хмарно" },
  fog: { id: "fog", emoji: "🌫️", name: "Туман" },
  rain: { id: "rain", emoji: "🌧️", name: "Дощ" },
  storm: { id: "storm", emoji: "⛈️", name: "Гроза" },
};

/** Ціле → псевдовипадкове 0…1 (той самий результат у будь-якому JS). */
function hash01(n) {
  let x = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0;
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/** Погода блоку №b. */
function kindOfBlock(b) {
  // Фронт: значення шуму в «вузлах» кожні 3 блоки (6 год), між ними — плавно.
  const f = Math.floor(b / 3);
  const k = (b - f * 3) / 3;
  const s = k * k * (3 - 2 * k);
  const front = hash01(f) * (1 - s) + hash01(f + 1) * s;
  const local = hash01(b + 7919); // дрібна мінливість у межах фронту
  if (front > 0.8) return local > 0.55 ? "storm" : "rain";
  if (front > 0.64) return local > 0.25 ? "rain" : "cloudy";
  if (front > 0.42) return local > 0.8 ? "fog" : "cloudy";
  return local > 0.9 ? "fog" : "clear";
}

const blockOf = (ms) => Math.floor(ms / WEATHER_BLOCK_MS);
const isWet = (kind) => kind === "rain" || kind === "storm";

/** Погода на мить ms: { kind, start, end } (межі поточного блоку). */
export function weatherAt(ms) {
  const b = blockOf(ms);
  return { kind: kindOfBlock(b), start: b * WEATHER_BLOCK_MS, end: (b + 1) * WEATHER_BLOCK_MS };
}

export const isRaining = (ms) => isWet(kindOfBlock(blockOf(ms)));

/** Перша мить у [from, to], коли йде дощ, або 0. Стабільна: не змінюється, коли to росте. */
export function firstRain(from, to) {
  if (!(to >= from)) return 0;
  const last = Math.min(blockOf(to), blockOf(from) + SCAN_LIMIT);
  for (let b = blockOf(from); b <= last; b++) {
    if (isWet(kindOfBlock(b))) return Math.max(from, b * WEATHER_BLOCK_MS);
  }
  return 0;
}

/** Остання мить ≤ ms, коли йшов дощ (ms — якщо йде зараз), або 0. */
export function lastRain(ms, lookbackMs = WEATHER_BLOCK_MS * 12) {
  const first = blockOf(ms - lookbackMs);
  for (let b = blockOf(ms); b >= first; b--) {
    if (isWet(kindOfBlock(b))) return Math.min(ms, (b + 1) * WEATHER_BLOCK_MS);
  }
  return 0;
}

/**
 * З якого часу дощ поливає грядки, що пересохли до цього оновлення (у них не збережено,
 * коли саме пересохли). Дощі до виходу оновлення не рахуються.
 */
export const RAIN_SINCE = Date.UTC(2026, 10, 9, 16, 0, 0);
