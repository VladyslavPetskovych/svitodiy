const STATS = [
  ['casts', '🎣', 'Закидів'],
  ['catches', '🐟', 'Риби'],
  ['resourceFinds', '📦', 'Ресурсів'],
  ['relicFinds', '🏺', 'Реліквій'],
  ['misses', '💨', 'Порожньо'],
]

export default function StatsGrid({ stats }) {
  return (
    <section className="rounded-2xl bg-tg-section p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-tg-hint">Рибалка</h2>
      <div className="grid grid-cols-3 gap-2">
        {STATS.map(([key, emoji, label]) => (
          <div key={key} className="rounded-xl bg-tg-secondary p-3 text-center">
            <p className="text-lg font-semibold">
              {emoji} {stats[key]}
            </p>
            <p className="text-xs text-tg-hint">{label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
