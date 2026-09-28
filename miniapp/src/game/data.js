/** Допоміжні функції над каталогом із сервера (/api/catalog). */

export const RARITY = {
  common: { label: 'Звичайна', color: '#8d7b58' },
  rare: { label: 'Рідкісна', color: '#4aa3ff' },
  legendary: { label: 'Легендарна', color: '#ffb627' },
  mythic: { label: 'Міфічна', color: '#c77dff' },
}

/** Словник id → опис предмета (риба, ресурс, реліквія). */
export function buildItemIndex(catalog) {
  const index = new Map()
  for (const f of catalog.fish) index.set(f.id, { ...f, kind: 'fish', image: `/game/fish/${f.id}.webp` })
  for (const r of catalog.resources) index.set(r.id, { ...r, kind: 'resource' })
  for (const r of catalog.relics) {
    index.set(r.id, { ...r, kind: 'relic', image: r.id === 'relic_ring_wanderer' ? '/game/art/relic-ring.webp' : null })
  }
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

/** Скільки рецептів можна скрафтити зараз. */
export function craftableCount(catalog, inventory) {
  return catalog.recipes.filter((r) => Object.entries(r.consumes).every(([id, n]) => (inventory[id] ?? 0) >= n)).length
}

/**
 * Підказка «що робити далі»: перший рецепт спорядження, якого ще немає,
 * і чого для нього бракує. Веде новачка по петлі лови → готуй → крафти.
 */
export function nextGoal(catalog, index, inventory) {
  const gear = catalog.recipes.filter((r) => index.get(r.output.id)?.kind === 'relic')
  const target = gear.find((r) => !(inventory[r.output.id] > 0))
  if (!target) return null
  const missing = Object.entries(target.consumes)
    .filter(([id, n]) => (inventory[id] ?? 0) < n)
    .map(([id, n]) => ({ item: itemOf(index, id), need: n - (inventory[id] ?? 0) }))
  return { recipe: target, output: itemOf(index, target.output.id), missing }
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
