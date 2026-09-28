import { motion } from 'motion/react'
import { useState } from 'react'
import { useGame } from '../context.js'
import { Paper, PxButton, ScreenTitle, Sheet } from '../ui.jsx'

/** Щоденник — «життєві» розділи бота: навчання, планер, арки, особисте. */
export default function Journal() {
  const { state, catalog, go, wa } = useGame()
  const [adminInfo, setAdminInfo] = useState(false)
  const activeArc = catalog.arcs.find((a) => state.arcs[a.id]?.enabled)
  const intensity = catalog.dumosvitIntensity.find((x) => x.level === state.dumosvit.intensity)

  const cards = [
    {
      icon: '📚',
      title: 'Думосвіт',
      text: 'Іспанська: слова, фрази й тести',
      status: state.dumosvit.reminders ? `🔔 ${intensity?.label ?? ''}` : 'Нагадування вимкнено',
      onClick: () => go('dumosvit'),
    },
    {
      icon: '📜',
      title: 'Літописець',
      text: 'Завдання з нагадуваннями в чат',
      status: 'Планер на кожен день',
      onClick: () => go('litopys'),
    },
    {
      icon: '🌱',
      title: 'Арки розвитку',
      text: '30 днів — одна тема росту',
      status: activeArc
        ? `${activeArc.title} · день ${Math.min(state.arcs[activeArc.id].day, catalog.arcDurationDays)}/${catalog.arcDurationDays}`
        : 'Жодна арка не активна',
      onClick: () => go('arcs'),
    },
  ]
  if (state.access.nastia) {
    cards.push({ icon: '🌸', title: 'Настя', text: 'Спільна дошка записів', status: 'Особистий розділ', onClick: () => go('board') })
  }
  if (state.access.admin) {
    cards.push({ icon: '🛠', title: 'Адмін', text: 'Моніторинг сервера', status: 'Доступно в чаті з ботом', onClick: () => setAdminInfo(true) })
  }

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle title="Щоденник" subtitle="Навчання, планер і особисті розділи" />
      {cards.map((c, i) => (
        <motion.button
          key={c.title}
          type="button"
          onClick={c.onClick}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="text-left"
        >
          <Paper className="flex items-center gap-3 p-2">
            <span className="px-slot flex size-14 shrink-0 items-center justify-center text-3xl">{c.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">{c.title}</p>
              <p className="text-xs text-ink-soft">{c.text}</p>
              <p className="mt-0.5 truncate text-xs font-bold text-wood">{c.status}</p>
            </div>
            <span className="font-pixel text-sm">›</span>
          </Paper>
        </motion.button>
      ))}

      <Sheet open={adminInfo} onClose={() => setAdminInfo(false)} title="🛠 Адмін">
        <p className="text-center text-sm text-ink-soft">
          Моніторинг сервера, контейнерів і процесів працює в чаті з ботом: <b>/menu → 🛠 Адмін · сервер</b>. Там він має
          доступ до Docker лише на читання, і так безпечніше, ніж відкривати його в інтернет.
        </p>
        <PxButton variant="blue" className="mt-4 w-full" onClick={() => wa.close()}>
          Повернутися в чат
        </PxButton>
      </Sheet>
    </div>
  )
}
