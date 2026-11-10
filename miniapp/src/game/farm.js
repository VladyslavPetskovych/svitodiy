/**
 * Город на клієнті: та сама формула росту, що й на сервері (server/src/game/farm.js, advancePlot) —
 * поле «живе» між запитами: волога грядка сама переходить на нову стадію й пересихає.
 * Сервер однаково все перевіряє, тож розбіжність хіба покаже стадію на мить раніше.
 */

import { RAIN_SINCE, firstRain, isRaining, lastRain } from './weather.js'

const MIN = 60_000

/** Культура з каталогу за id. */
export const cropOf = (catalog, id) => catalog.farm?.crops.find((c) => c.id === id) ?? null

/**
 * Стан грядки на мить now (грядки гравець сам ставить на острові: x, y — якір, низ по центру).
 * null — такої грядки немає.
 * @returns {{ i: number, x: number, y: number, auto: boolean, tilled: boolean, crop: object|null, stage: number, wet: boolean,
 *   ready: boolean, nextAt: number|null, action: 'till'|'plant'|'water'|'harvest'|'wait' } | null}
 */
export function plotView(catalog, farm, i, now) {
  const raw = farm?.plots?.[i]
  if (!raw) return null
  // a — над грядкою дощувач: поливає сам.
  const auto = !!raw.a
  const at = { i, x: raw.x, y: raw.y, auto }
  if (!raw.t) return { ...at, tilled: false, crop: null, stage: 0, wet: false, ready: false, nextAt: null, action: 'till' }

  const crop = raw.c ? cropOf(catalog, raw.c) : null
  if (!crop) {
    const wetMs = (catalog.farm?.emptyWetMin ?? 30) * MIN
    const wetAt = Math.max(raw.w ?? 0, lastRain(now))
    const wet = !!wetAt && now - wetAt < wetMs
    return { ...at, tilled: true, crop: null, stage: 0, wet, ready: false, nextAt: null, action: 'plant' }
  }
  // Дощ поливає суху грядку сам — та сама формула, що й advancePlot на сервері.
  let g = raw.g ?? 0
  let w = raw.w ?? 0
  let d = raw.d ?? 0
  const ms = crop.stageMin * MIN
  while (g < crop.stages) {
    if (!w) {
      w = firstRain(Math.max(d, RAIN_SINCE), now)
      if (!w) break
    }
    if (now - w < ms) break
    g++
    d = w + ms
    w = auto && g < crop.stages ? d : 0
  }
  const ready = g >= crop.stages
  if (ready) w = 0
  return {
    ...at,
    tilled: true,
    crop,
    stage: g,
    wet: !!w,
    ready,
    nextAt: w ? w + ms : null,
    action: ready ? 'harvest' : w ? 'wait' : 'water',
  }
}

/** Усі грядки для рушія: де стоять, що на них росте. */
export function fieldView(catalog, farm, now) {
  return Object.keys(farm?.plots ?? {})
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => plotView(catalog, farm, i, now))
    .filter(Boolean)
}

/** Скільки грядок уже стоїть і скільки взагалі вміщує острів. */
export function bedCount(farm) {
  return { used: Object.keys(farm?.plots ?? {}).length, max: farm?.max ?? 300 }
}

/** «12 хв», «1 год 5 хв». */
export function shortDuration(ms) {
  const m = Math.max(1, Math.ceil(ms / MIN))
  if (m < 60) return `${m} хв`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} год ${m % 60} хв` : `${h} год`
}

/** Повний час росту без перерв (якщо поливати щойно пересохне). */
export const growTime = (crop) => crop.stages * crop.stageMin * MIN

/** Яка грядка — підпис, підказка й кнопка дії. */
export function plotSpot(catalog, farm, v, now) {
  const crop = v.crop
  const label = crop ? crop.name : v.tilled ? 'Скопана грядка' : 'Ділянка під грядку'
  const hint = {
    till: 'Скопай мотикою — і можна садити',
    plant: 'Обери насіння нижче й посади — поллється само',
    water: `Стадія ${v.stage}/${crop?.stages} · земля суха — полий!`,
    wait: v.nextAt
      ? `${v.auto ? '💦 Дощувач · ' : isRaining(now) ? '🌧️ Дощ поливає · ' : ''}Росте ${v.stage}/${crop?.stages} · далі за ${shortDuration(v.nextAt - now)}`
      : 'Росте',
    harvest: crop?.regrow != null ? 'Достигло! Збирай — кущ плодоноситиме знову' : 'Достигло! Збирай',
  }[v.action]
  const button = { till: '⛏️ Скопати', plant: '🌱 Посадити', water: '💧 Полити', wait: '⏳ Росте', harvest: '🧺 Зібрати' }[v.action]
  return { label, hint, button, auto: v.auto }
}

/** Насіння в рюкзаку: [{ crop, count }], у порядку каталогу. */
export function ownedSeeds(catalog, inventory) {
  return (catalog.farm?.crops ?? []).map((c) => ({ crop: c, count: inventory[`seed_${c.id}`] ?? 0 })).filter((x) => x.count > 0)
}
