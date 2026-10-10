/** Допоміжні функції над каталогом із сервера (/api/catalog). */

export const RARITY = {
  common: { label: 'Звичайна', color: '#8d7b58' },
  rare: { label: 'Рідкісна', color: '#4aa3ff' },
  legendary: { label: 'Легендарна', color: '#ffb627' },
  mythic: { label: 'Міфічна', color: '#c77dff' },
}

/**
 * Риби з піксельним спрайтом у public/game/fish (нарізано з art/fish-sheet.png: scripts/cut-sheet.py).
 * Решта показується емодзі.
 */
const FISH_ART = new Set([
  'trout',
  'carp',
  'perch',
  'pike',
  'golden_crucian',
  'river_bream',
  'whisker_cat',
  'moon_carp',
  'coral_perch',
  'zander',
  'storm_eel',
  'sea_wanderer_tuna',
  'elder_sturgeon',
  'crystal_salmon',
  'royal_catfish',
  'sunscale_koi',
])

/** Ресурси й реліквії з піксельним спрайтом у public/game/items (art/items-sheet.png). */
const ITEM_ART = new Set([
  'log',
  'plank',
  'twig',
  'stone',
  'shell',
  'seaweed',
  'ice_block',
  'fish_eye',
  'fish_bone',
  'old_coin',
  'glass_shard',
  'metal_scrap',
  'silver_piece',
  'relic_ring_wanderer',
  'relic_hook_silver',
  'relic_hook_gold',
])
const itemArt = (id) => (ITEM_ART.has(id) ? `/game/items/${id}.png` : null)

/** Словник id → опис предмета (риба, ресурс, реліквія). */
export function buildItemIndex(catalog) {
  const index = new Map()
  for (const f of catalog.fish) {
    index.set(f.id, { ...f, kind: 'fish', image: FISH_ART.has(f.id) ? `/game/fish/${f.id}.png` : null })
  }
  for (const r of catalog.resources) index.set(r.id, { ...r, kind: 'resource', image: itemArt(r.id) })
  for (const r of catalog.relics) index.set(r.id, { ...r, kind: 'relic', image: itemArt(r.id) })
  return index
}

export function itemOf(index, id) {
  return index.get(id) ?? { id, kind: 'other', emoji: '📦', name: id }
}

/** Шанс риби за закид з урахуванням гачка й талісмана — як у fishing.js бота. */
export function fishChance(catalog, equipped) {
  const { fish, miss } = catalog.fishingChances
  const bonus = [equipped.hook, equipped.talisman]
    .map((id) => catalog.relics.find((r) => r.id === id)?.fishBonus ?? 0)
    .reduce((a, b) => a + b, 0)
  const shift = Math.min(bonus, Math.max(0, miss - 0.02))
  return { base: fish, bonus: shift, total: fish + shift }
}

export const pct = (x) => `${Math.round(x * 100)}%`

/** Рівень — лише для відчуття прогресу, на економіку не впливає. */
export function levelOf(stats) {
  const xp = stats.casts + stats.catches * 2 + stats.resourceFinds + stats.relicFinds * 20
  const level = Math.floor(Math.sqrt(xp / 10)) + 1
  const from = 10 * (level - 1) ** 2
  const to = 10 * level ** 2
  return { level, xp, progress: (xp - from) / (to - from) }
}

/* ───────── Рідний острів (формула — як у server/src/game/homestead.js) ───────── */

const HOUR = 3_600_000

export function storageHours(catalog, levels) {
  return catalog.buildings.find((b) => b.id === 'house').levels[levels.house]?.storageHours ?? 8
}

/** Скільки лежить у коморі зараз (дробові числа) і наскільки вона заповнена (0…1). */
export function homeStorage(catalog, home, now) {
  const capMs = storageHours(catalog, home.levels) * HOUR
  const elapsed = Math.max(0, Math.min(now - home.collectedAt, capMs))
  const perBuilding = {}
  const total = { ...home.carry }
  for (const b of catalog.buildings) {
    const produces = b.levels[home.levels[b.id]]?.produces ?? {}
    const own = {}
    for (const [id, perHour] of Object.entries(produces)) {
      own[id] = (perHour * elapsed) / HOUR
      total[id] = (total[id] ?? 0) + own[id]
    }
    perBuilding[b.id] = own
  }
  return { total, perBuilding, fill: elapsed / capMs, fullInMs: capMs - elapsed }
}

/** Чи вистачає на ціну: balance — ✨, решта — ресурси з рюкзака. */
export function canAfford(cost = {}, balance, inventory) {
  return Object.entries(cost).every(([id, n]) => (id === 'balance' ? balance : (inventory[id] ?? 0)) >= n)
}

/** Де взяти ресурс — для підказок у рюкзаку й алхімії. */
export function sourceOf(catalog, id) {
  if (catalog.cookDrops.includes(id)) return 'Готуй рибу в рюкзаку'
  const island = catalog.islands.find((i) => i.gather?.resourceId === id)
  if (island) return `Добувай на острові: ${island.name}`
  if (['twig', 'stone', 'shell'].includes(id)) return 'Інколи чіпляється на вудку'
  const recipe = catalog.recipes.find((r) => r.output.id === id)
  if (recipe) return `Створи в алхімії: ${recipe.name}`
  return null
}

export function formatDate(ms) {
  return new Date(ms).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Зібраний врожай: «+3 ✨ · 🪵×2». */
export function formatAmounts(items, got) {
  return Object.entries(got)
    .map(([id, n]) => (id === 'balance' ? `+${n} ✨` : `${itemOf(items, id).emoji}×${n}`))
    .join(' · ')
}
