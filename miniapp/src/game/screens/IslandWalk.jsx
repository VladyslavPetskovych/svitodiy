import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { formatAmounts, homeStorage, itemOf } from '../data.js'
import { useGame, useNow } from '../context.js'
import { haptic } from '../tg.js'
import { PxButton, ScreenTitle } from '../ui.jsx'
import { createWalk, loadAssets } from '../walk/engine.js'
import { INTERACT } from '../walk/layout.js'
import { BuildingSheet, DailySheet } from './Home.jsx'

const BUILDINGS = new Set(['house', 'garden', 'workshop', 'lighthouse', 'pier'])
const ICONS = { chest: '🎁', fishing: '🎣', boat: '⛵' }

/** Рідний острів зсередини: ходиш мандрівником, підходиш до будівель, скрині й причалу. */
export default function IslandWalk() {
  const { state, catalog, items, act, toast, switchTab } = useGame()
  const canvas = useRef(null)
  const engine = useRef(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [near, setNear] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [daily, setDaily] = useState(false)
  const now = useNow()
  const { home } = state
  const name = state.user.firstName || 'Мандрівника'

  // Обробники рушія читають свіжі значення через ref — рушій створюється один раз.
  const handlers = useRef({})
  const collecting = useRef(false)
  const collect = async () => {
    if (collecting.current) return
    collecting.current = true
    const res = await act('POST', '/home/collect')
    collecting.current = false
    if (!res) return
    haptic('success')
    toast(`Зібрано: ${formatAmounts(items, res.got)}`)
  }
  const interact = (id) => {
    haptic('light')
    if (BUILDINGS.has(id)) setSheet(id)
    else if (id === 'chest') setDaily(true)
    else if (id === 'fishing') switchTab('fishing')
    else if (id === 'boat') switchTab('map')
  }
  useEffect(() => {
    handlers.current = { interact, collect }
  })

  useEffect(() => {
    let alive = true
    let walk = null
    loadAssets().then(
      (assets) => {
        if (!alive || !canvas.current) return
        walk = createWalk(canvas.current, assets, {
          onNear: (id) => {
            if (id) haptic('select')
            setNear(id)
          },
          onInteract: (id) => handlers.current.interact(id),
          onBubble: () => handlers.current.collect(),
        })
        engine.current = walk
        setReady(true)
      },
      (e) => alive && setError(e.message)
    )
    return () => {
      alive = false
      walk?.destroy()
      engine.current = null
    }
  }, [])

  // Рівні будівель і скриня → що стоїть на острові.
  const chestOpen = state.daily.claimedToday
  useEffect(() => {
    engine.current?.setWorld(home.levels, chestOpen)
  }, [ready, home.levels, chestOpen])

  // Бульбашки врожаю над будівлями, де вже є що забрати.
  const storage = homeStorage(catalog, home, now)
  const bubbleKey = JSON.stringify(
    Object.fromEntries(
      Object.entries(storage.perBuilding).flatMap(([id, got]) => {
        const top = Object.entries(got).sort((a, b) => b[1] - a[1])[0]
        return top && top[1] >= 1 ? [[id, top[0] === 'balance' ? '✨' : itemOf(items, top[0]).emoji]] : []
      })
    )
  )
  useEffect(() => {
    engine.current?.setBubbles(JSON.parse(bubbleKey))
  }, [ready, bubbleKey])

  const spot = INTERACT.find((i) => i.id === near)
  const building = catalog.buildings.find((b) => b.id === sheet)

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle title={`🏝️ Острів ${name}`} subtitle="Торкнись землі — підеш туди. Підійди до будівлі, скрині чи причалу." />

      <div className="relative overflow-hidden rounded-sm border-4 border-wood-dark bg-[#3b7fd0] shadow-[0_6px_0_#0006]">
        <canvas ref={canvas} className="block aspect-[5/6] w-full touch-none" />
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0f2a3d]/60 text-center">
            <motion.span
              className="text-4xl"
              animate={error ? {} : { y: [0, -6, 0] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              {error ? '🌫️' : '⛵'}
            </motion.span>
            <p className="px-6 text-sm text-cream">{error ?? 'Пристаємо до берега…'}</p>
          </div>
        )}
        <p className="pointer-events-none absolute top-2 left-2 rounded-sm bg-black/35 px-2 py-1 font-pixel text-[9px] text-cream drop-shadow">
          ОСТРІВ {name.toUpperCase()}
        </p>
      </div>

      <div className="px-wood flex min-h-14 items-center gap-2 px-2 py-1.5 text-cream">
        <AnimatePresence mode="wait" initial={false}>
          {spot ? (
            <motion.div
              key={spot.id}
              className="flex flex-1 items-center gap-2"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              <span className="text-2xl">{spotIcon(catalog, spot.id)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">{spot.label}</p>
                <p className="truncate text-[11px] text-cream/75">{spotHint(catalog, home.levels, chestOpen, spot.id)}</p>
              </div>
              <PxButton size="sm" variant="green" onClick={() => interact(spot.id)}>
                {spot.id === 'fishing' ? 'Рибалити' : spot.id === 'boat' ? 'Плисти' : 'Відкрити'}
              </PxButton>
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              className="flex-1 text-center text-[12px] text-cream/80"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              Тапни будівлю — мандрівник сам до неї дійде. На ПК — стрілки/WASD і E.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <BuildingSheet building={building} onClose={() => setSheet(null)} />
      <DailySheet open={daily} onClose={() => setDaily(false)} />
    </div>
  )
}

function spotIcon(catalog, id) {
  return catalog.buildings.find((b) => b.id === id)?.emoji ?? ICONS[id] ?? '❔'
}

function spotHint(catalog, levels, chestOpen, id) {
  if (id === 'chest') return chestOpen ? 'Сьогодні вже відкрито — повертайся завтра' : 'Щоденна нагорода чекає!'
  if (id === 'fishing') return 'Закинути вудку з краю причалу'
  if (id === 'boat') return 'Попливти до інших островів'
  const b = catalog.buildings.find((x) => x.id === id)
  const lvl = levels[id] ?? 0
  if (!lvl) return 'Порожня ділянка — можна збудувати'
  return lvl >= b.levels.length - 1 ? `Рівень ${lvl} · найвищий` : `Рівень ${lvl} · можна покращити`
}
