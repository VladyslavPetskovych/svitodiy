import { INVENTORY_GROUPS, itemMeta } from '../lib/items.js'

export default function Inventory({ inventory, equipped }) {
  const known = new Set(INVENTORY_GROUPS.flatMap((g) => Object.keys(g.items)))
  const groups = [
    ...INVENTORY_GROUPS.map((g) => ({
      title: g.title,
      ids: Object.keys(g.items).filter((id) => inventory[id]),
    })),
    // Предмети, яких ще немає в items.js, не губимо — показуємо окремо.
    { title: 'Інше', ids: Object.keys(inventory).filter((id) => !known.has(id)) },
  ].filter((g) => g.ids.length)

  const equippedIds = new Set([equipped.hook, equipped.talisman].filter(Boolean))

  return (
    <section className="rounded-2xl bg-tg-section p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-tg-hint">Інвентар</h2>

      {groups.length === 0 && <p className="text-tg-hint">Поки порожньо — закинь вудку в боті 🎣</p>}

      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-1 font-medium">{g.title}</h3>
            <ul className="divide-y divide-tg-secondary">
              {g.ids.map((id) => {
                const { emoji, name } = itemMeta(id)
                return (
                  <li key={id} className="flex items-center gap-3 py-2">
                    <span className="text-xl">{emoji}</span>
                    <span className="flex-1">
                      {name}
                      {equippedIds.has(id) && <span className="ml-2 text-xs text-tg-link">екіпіровано</span>}
                    </span>
                    <span className="font-semibold tabular-nums">×{inventory[id]}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
