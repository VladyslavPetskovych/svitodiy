import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useGame } from '../context.js'
import { haptic } from '../tg.js'
import { Paper, PxButton, ScreenTitle, Sheet } from '../ui.jsx'

/** Українські підзаголовки до англомовних арок бота. */
const ARC_UK = {
  redemption: 'Перетвори жаль на дисципліновану дію.',
  grinding: 'Сталість, глибока робота й любов до процесу.',
  resilience: 'Витривалість, спокійне відновлення, рівновага під тиском.',
}

export function Arcs() {
  const { catalog, state, go } = useGame()
  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle title="Арки розвитку" subtitle="30 днів — одна тема. Фрази й мікродії приходять у чат." />
      <div className="grid grid-cols-3 gap-2">
        {catalog.arcs.map((a, i) => {
          const s = state.arcs[a.id]
          return (
            <motion.button
              key={a.id}
              type="button"
              onClick={() => go('arc', { id: a.id })}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="relative overflow-hidden rounded-sm border-4 border-wood-dark shadow-[0_4px_0_#0006]"
            >
              <img src={`/game/art/arc-${a.id}.webp`} alt={a.title} className="aspect-3/4 w-full object-cover" />
              {s.enabled && (
                <span className="absolute inset-x-0 bottom-0 bg-good/90 py-0.5 text-center font-pixel text-[8px] text-white">
                  ДЕНЬ {Math.min(s.day, catalog.arcDurationDays)}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
      <Paper className="p-2 text-sm text-ink-soft">
        Одночасно активна лише одна арка. Бот кілька разів на день надсилає в чат цитату й маленьку дію. Тут можна отримати фразу
        дня будь-коли.
      </Paper>
    </div>
  )
}

export function ArcDetail({ id }) {
  const { catalog, state, act } = useGame()
  const arc = catalog.arcs.find((a) => a.id === id)
  const [message, setMessage] = useState(null)
  const [confirm, setConfirm] = useState(false)
  if (!arc) return null

  const s = state.arcs[id]
  const total = catalog.arcDurationDays
  const day = s.enabled ? Math.min(s.day, total) : 0
  const otherActive = catalog.arcs.find((a) => a.id !== id && state.arcs[a.id]?.enabled)

  const start = async () => {
    setConfirm(false)
    if (await act('POST', `/arcs/${id}/start`)) haptic('success')
  }
  const stop = () => act('POST', `/arcs/${id}/stop`)
  const getMessage = async () => {
    const res = await act('POST', `/arcs/${id}/message`)
    if (res) setMessage(res.message)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-sm border-4 border-wood-dark shadow-[0_6px_0_#0006]">
        <img src={`/game/art/arc-${id}.webp`} alt={arc.title} className="aspect-4/3 w-full object-cover object-center" />
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-transparent p-3 pt-12">
          <p className="text-sm text-cream/90">{ARC_UK[id]}</p>
          {arc.summary && <p className="mt-1 text-xs text-cream/60 italic">{arc.summary}</p>}
        </div>
      </div>

      <Paper className="p-2">
        <div className="flex items-center justify-between">
          <p className="font-extrabold">
            {arc.emoji} {arc.title}
          </p>
          <span className={`font-pixel text-[10px] ${s.enabled ? 'text-[#2d6b18]' : 'text-ink-soft'}`}>
            {s.enabled ? 'АКТИВНА' : s.done ? 'ЗАВЕРШЕНА' : 'НЕ АКТИВНА'}
          </span>
        </div>
        {/* 30 клітинок — по одній на день */}
        <div className="mt-2 grid grid-cols-10 gap-1">
          {Array.from({ length: total }, (_, i) => (
            <motion.span
              key={i}
              className={`aspect-square rounded-[2px] border border-ink/30 ${i < day ? 'bg-good' : 'bg-parch-dark/60'}`}
              initial={false}
              animate={i === day - 1 ? { scale: [1, 1.25, 1] } : {}}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-soft">{s.enabled ? `День ${day} з ${total}` : `Старт — і ${total} днів маленьких кроків.`}</p>

        <div className="mt-3 flex flex-col gap-2">
          {s.enabled ? (
            <>
              <PxButton variant="yellow" onClick={getMessage}>
                📜 Фраза дня
              </PxButton>
              <PxButton variant="paper" onClick={stop}>
                ⏸ Зупинити арку
              </PxButton>
            </>
          ) : (
            <PxButton variant="green" size="lg" onClick={() => (otherActive ? setConfirm(true) : start())}>
              ▶ Почати {total}-денну арку
            </PxButton>
          )}
        </div>
      </Paper>

      <AnimatePresence>
        {message && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
            <Paper className="p-3">
              <p className="font-pixel text-[10px] text-ink-soft">ДЕНЬ {message.day}</p>
              <p className="mt-2 text-lg leading-snug font-extrabold">“{message.quote}”</p>
              <p className="mt-3 rounded-sm bg-parch-dark/60 p-2 text-sm">
                🎯 <b>Мікродія:</b> {message.action}
              </p>
            </Paper>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Змінити арку?">
        <p className="text-center text-sm text-ink-soft">
          Зараз активна <b>{otherActive?.title}</b>. Вона зупиниться, а {arc.title} почнеться з першого дня.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PxButton variant="paper" onClick={() => setConfirm(false)}>
            Скасувати
          </PxButton>
          <PxButton variant="green" onClick={start}>
            Почати
          </PxButton>
        </div>
      </Sheet>
    </div>
  )
}
