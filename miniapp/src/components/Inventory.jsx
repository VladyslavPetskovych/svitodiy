import { INVENTORY_GROUPS, itemMeta } from '../lib/items.js'
import { Card } from './ui.jsx'

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
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-muted">Інвентар</h3>

      {groups.length === 0 && (
        <p className="py-6 text-center text-muted">Поки порожньо — закинь вудку в боті 🎣</p>
      )}

      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.title}>
            <h4 className="mb-2 font-display text-base font-semibold">{g.title}</h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.ids.map((id) => {
                const { emoji, name } = itemMeta(id)
                return (
                  <li key={id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                    <span className="text-xl">{emoji}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      {name}
                      {equippedIds.has(id) && <span className="block text-xs text-accent">екіпіровано</span>}
                    </span>
                    <span className="font-bold tabular-nums">×{inventory[id]}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}
