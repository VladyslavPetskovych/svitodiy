import { motion } from 'motion/react'
import { useState } from 'react'
import { useGame } from '../context.js'
import { haptic } from '../tg.js'
import { Paper, ScreenTitle } from '../ui.jsx'

/** Щоденник — «життєві» розділи бота: навчання, планер, арки, особисте. */
export default function Journal() {
  const { state, catalog, go } = useGame()
  const sharePhone = useSharePhone()
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
    cards.push({ icon: '🛠', title: 'Адмін · сервер', text: 'Сервер, контейнери й процеси', status: 'Моніторинг', onClick: () => go('admin') })
  }
  // Як у боті на /start: персональні розділи відкриваються лише за номером.
  if (!state.access.phone && sharePhone.supported) {
    cards.push({
      icon: '📱',
      title: 'Особисті розділи',
      text: 'Якщо для твого номера є розділ — поділися контактом',
      status: sharePhone.busy ? 'Перевіряю…' : 'Необов’язково',
      onClick: sharePhone.run,
    })
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
    </div>
  )
}

/**
 * WebApp.requestContact: Telegram питає дозвіл і надсилає контакт боту в чат
 * (бот збереже його сам), а нам віддає підписану копію — її перевіряє сервер.
 */
function useSharePhone() {
  const { wa, act, toast } = useGame()
  const [busy, setBusy] = useState(false)
  const supported = typeof wa.requestContact === 'function' && wa.isVersionAtLeast?.('6.9')

  const run = () => {
    if (busy) return
    wa.requestContact(async (ok, result) => {
      if (!ok) return
      setBusy(true)
      let res = result?.response ? await act('POST', '/contact', { response: result.response }, { silent: true }) : null
      // Запасний шлях: підпис не пройшов — контакт усе одно дійшов до бота, трохи чекаємо.
      if (!res) {
        await new Promise((r) => setTimeout(r, 2500))
        res = await act('GET', '/state', undefined, { silent: true })
      }
      setBusy(false)
      const access = res?.state?.access
      if (!access?.phone) {
        toast('Не вдалося зберегти номер. Спробуй через /start у чаті з ботом.', 'error')
      } else if (access.nastia || access.admin) {
        haptic('success')
        toast('Відкрито особистий розділ ✨')
      } else {
        toast('Номер збережено ✅')
      }
    })
  }
  return { supported, busy, run }
}
