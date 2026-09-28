import { Card } from './ui.jsx'

const STATS = [
  ['casts', '🎣', 'Закидів'],
  ['catches', '🐟', 'Риби'],
  ['resourceFinds', '📦', 'Ресурсів'],
  ['relicFinds', '🏺', 'Реліквій'],
  ['misses', '💨', 'Порожньо'],
]

export default function StatsGrid({ stats }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-muted">Рибалка</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3">
        {STATS.map(([key, emoji, label]) => (
          <div key={key} className="rounded-xl bg-surface-2 p-3 text-center">
            <p className="text-lg font-bold tabular-nums">
              {emoji} {stats[key]}
            </p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
