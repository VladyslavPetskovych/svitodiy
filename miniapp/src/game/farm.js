/**
 * Город на клієнті: та сама формула росту, що й на сервері (server/src/game/farm.js, advancePlot) —
 * поле «живе» між запитами: волога грядка сама переходить на нову стадію й пересихає.
 * Сервер однаково все перевіряє, тож розбіжність хіба покаже стадію на мить раніше.
 */

const MIN = 60_000

/** Культура з каталогу за id. */
export const cropOf = (catalog, id) => catalog.farm?.crops.find((c) => c.id === id) ?? null

/**
 * Стан грядки на мить now.
 * @returns {{ i: number, locked: boolean, tilled: boolean, crop: object|null, stage: number, wet: boolean,
 *   ready: boolean, nextAt: number|null, action: 'till'|'plant'|'water'|'harvest'|'wait'|'locked' }}
 */
export function plotView(catalog, farm, i, now) {
  const unlocked = farm?.unlocked ?? 0
  const raw = farm?.plots?.[i]
  if (i >= unlocked) return { i, locked: true, tilled: false, crop: null, stage: 0, wet: false, ready: false, nextAt: null, action: 'locked' }
  if (!raw) return { i, locked: false, tilled: false, crop: null, stage: 0, wet: false, ready: false, nextAt: null, action: 'till' }

  const crop = raw.c ? cropOf(catalog, raw.c) : null
  if (!crop) {
    const wetMs = (catalog.farm?.emptyWetMin ?? 30) * MIN
    const wet = !!raw.w && now - raw.w < wetMs
    return { i, locked: false, tilled: true, crop: null, stage: 0, wet, ready: false, nextAt: null, action: 'plant' }
  }
  let g = raw.g ?? 0
  let w = raw.w ?? 0
  const ms = crop.stageMin * MIN
  while (w && g < crop.stages && now - w >= ms) {
    g++
    w = farm.auto && g < crop.stages ? w + ms : 0
  }
  const ready = g >= crop.stages
  if (ready) w = 0
  return {
    i,
    locked: false,
    tilled: true,
    crop,
    stage: g,
    wet: !!w,
    ready,
    nextAt: w ? w + ms : null,
    action: ready ? 'harvest' : w ? 'wait' : 'water',
  }
}

/** Усе поле для рушія: що де лежить і росте. */
export function fieldView(catalog, farm, now) {
  const n = catalog.farm?.plots ?? 15
  return Array.from({ length: n }, (_, i) => plotView(catalog, farm, i, now))
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
  const need = (catalog.farm?.unlock ?? []).findIndex((n) => n > v.i)
  const label = v.locked ? "Зарості бур'яну" : crop ? crop.name : v.tilled ? 'Скопана грядка' : 'Ділянка під грядку'
  const hint = {
    locked: need > 0 ? `Розчиститься, коли «Город» стане ${need}-го рівня` : 'Ще не розчищено',
    till: 'Скопай мотикою — і можна садити',
    plant: v.wet ? 'Волога земля — саме час садити' : 'Скопано — посади насіння',
    water: `Стадія ${v.stage}/${crop?.stages} · земля суха — полий!`,
    wait: v.nextAt ? `Росте ${v.stage}/${crop?.stages} · далі за ${shortDuration(v.nextAt - now)}` : 'Росте',
    harvest: crop?.regrow != null ? 'Достигло! Збирай — кущ плодоноситиме знову' : 'Достигло! Збирай',
  }[v.action]
  const button = { locked: "🌿 Бур'ян", till: '⛏️ Скопати', plant: '🌱 Посадити', water: '💧 Полити', wait: '⏳ Росте', harvest: '🧺 Зібрати' }[v.action]
  return { label, hint, button, auto: farm?.auto }
}

/** Насіння в рюкзаку: [{ crop, count }], у порядку каталогу. */
export function ownedSeeds(catalog, inventory) {
  return (catalog.farm?.crops ?? []).map((c) => ({ crop: c, count: inventory[`seed_${c.id}`] ?? 0 })).filter((x) => x.count > 0)
}
