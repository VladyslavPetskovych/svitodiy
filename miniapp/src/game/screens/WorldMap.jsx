import { motion } from 'motion/react'
import { useGame } from '../context.js'
import { haptic } from '../tg.js'
import { Paper, ScreenTitle } from '../ui.jsx'
import { GatherWidget } from './Island.jsx'

/** Де на арті map.webp намальовані острови (у %). */
const PINS = {
  home: { x: 51, y: 45 },
  jungle: { x: 25, y: 31 },
  blizzard: { x: 78, y: 31 },
  desert: { x: 49, y: 74 },
}
const PIN_LABELS = { jungle: 'Джунглі', blizzard: 'Хуртовина', desert: 'Пустеля' }

export default function WorldMap() {
  const { catalog, go, switchTab, state } = useGame()
  const open = (island) => {
    if (island.locked) {
      haptic('warning')
      return
    }
    go('island', { id: island.id })
  }

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle title="Карта морів" subtitle="Обери острів — там ресурси, пригоди й монстри" />

      <div className="relative overflow-hidden rounded-sm border-4 border-wood-dark shadow-[0_6px_0_#0006]">
        <img src="/game/art/map.webp" alt="Карта островів" className="block w-full" width="1100" height="879" />
        <Pin pos={PINS.home} label="Дім" emoji="🏠" onClick={() => switchTab('fishing')} />
        {catalog.islands.map((i) => (
          <Pin
            key={i.id}
            pos={PINS[i.id]}
            label={PIN_LABELS[i.id] ?? i.name}
            emoji={i.locked ? '🔒' : i.emoji}
            locked={i.locked}
            active={state.job?.island === i.id}
            onClick={() => open(i)}
          />
        ))}
        <motion.span
          className="pointer-events-none absolute text-2xl"
          style={{ left: '62%', top: '58%' }}
          animate={{ x: [0, 16, 0], y: [0, -3, 0], rotate: [0, 3, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          ⛵
        </motion.span>
      </div>

      {state.job && <GatherWidget />}

      <div className="flex flex-col gap-2">
        {catalog.islands.map((i) => (
          <motion.button key={i.id} type="button" whileTap={{ scale: 0.97 }} onClick={() => open(i)} className="text-left">
            <Paper className={`flex items-center gap-3 p-2 ${i.locked ? 'opacity-60' : ''}`}>
              {i.locked ? (
                <span className="flex size-14 items-center justify-center text-3xl">🏜️</span>
              ) : (
                <img src={`/game/art/island-${i.id}.webp`} alt="" className="size-14 rounded-sm object-cover" />
              )}
              <div className="flex-1">
                <p className="font-extrabold">
                  {i.emoji} {i.name}
                </p>
                <p className="text-xs text-ink-soft">{i.description}</p>
              </div>
              <span className="font-pixel text-xs">{i.locked ? 'СКОРО' : '›'}</span>
            </Paper>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

function Pin({ pos, label, emoji, onClick, locked, active }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
    >
      <motion.span
        className={`rounded-sm border-2 border-wood-dark px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap ${locked ? 'bg-parch-dark/80 text-ink-soft' : 'bg-parch text-ink'}`}
        animate={locked ? {} : { y: [0, -4, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        {emoji} {label}
        {active && ' ⏳'}
      </motion.span>
      <span className="h-2 w-0.5 bg-wood-dark" />
    </motion.button>
  )
}
