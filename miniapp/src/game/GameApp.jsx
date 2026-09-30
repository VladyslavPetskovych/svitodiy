import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import './game.css'
import { levelOf } from './data.js'
import Admin from './screens/Admin.jsx'
import { Arcs, ArcDetail } from './screens/Arcs.jsx'
import Backpack from './screens/Backpack.jsx'
import Board from './screens/Board.jsx'
import Dumosvit from './screens/Dumosvit.jsx'
import Fishing from './screens/Fishing.jsx'
import Home from './screens/Home.jsx'
import Island from './screens/Island.jsx'
import Journal from './screens/Journal.jsx'
import Litopys from './screens/Litopys.jsx'
import WorldMap from './screens/WorldMap.jsx'
import { useGame } from './context.js'
import { GameProvider } from './store.jsx'
import { haptic, useBackButton } from './tg.js'
import { Bar, Counter, FloatingDelta, PxButton, RewardModal, Sheet, Toasts } from './ui.jsx'

const TABS = [
  { id: 'home', icon: '🏝️', label: 'Острів' },
  { id: 'fishing', icon: '🎣', label: 'Рибалка' },
  { id: 'map', icon: '🗺️', label: 'Мапа' },
  { id: 'backpack', icon: '🎒', label: 'Рюкзак' },
  { id: 'journal', icon: '📖', label: 'Щоденник' },
]

const SCREENS = {
  home: Home,
  fishing: Fishing,
  map: WorldMap,
  backpack: Backpack,
  journal: Journal,
  island: Island,
  dumosvit: Dumosvit,
  litopys: Litopys,
  arcs: Arcs,
  arc: ArcDetail,
  board: Board,
  admin: Admin,
}

export default function GameApp({ wa }) {
  return (
    <GameProvider wa={wa}>
      <GameShell />
    </GameProvider>
  )
}

function GameShell() {
  const g = useGame()
  if (g.fatal) return <FatalScreen message={g.fatal} onRetry={g.reload} />
  if (!g.catalog || !g.state) return <Splash />
  return <Playing />
}

function Playing() {
  const { nav, back, state, toasts, rewardPopup, reward } = useGame()
  const current = nav.stack.at(-1) ?? { screen: nav.tab, params: {} }
  const Screen = SCREENS[current.screen] ?? Home
  const key = `${nav.tab}/${nav.stack.map((s) => s.screen + JSON.stringify(s.params)).join('/')}`
  // Напрям анімації: глибше в стек — справа, назад — зліва.
  const depth = nav.stack.length
  const [prev, setPrev] = useState({ depth, direction: 1 })
  let direction = prev.direction
  if (prev.depth !== depth) {
    direction = depth > prev.depth ? 1 : -1
    setPrev({ depth, direction })
  }

  useBackButton(depth > 0, back)

  // Прокрутка вгору при зміні екрана.
  const scroller = useRef(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [key])

  return (
    <div className="game-root flex h-dvh flex-col">
      <TopBar state={state} />
      <main ref={scroller} className="no-scrollbar relative flex-1 overflow-x-hidden overflow-y-auto">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={key}
            custom={direction}
            variants={{
              enter: (d) => ({ opacity: 0, x: depth === 0 ? 0 : 40 * d, y: depth === 0 ? 12 : 0 }),
              center: { opacity: 1, x: 0, y: 0 },
              exit: (d) => ({ opacity: 0, x: depth === 0 && d > 0 ? 0 : -40 * d }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="mx-auto w-full max-w-md px-3 pt-3 pb-6"
          >
            <Screen {...current.params} />
          </motion.div>
        </AnimatePresence>
      </main>
      <TabBar />
      <Toasts toasts={toasts} />
      <RewardModal spec={rewardPopup} onClose={() => reward(null)} />
      <Onboarding />
    </div>
  )
}

/* ───────── Верхня панель ───────── */

function TopBar({ state }) {
  const { user, balance, stats } = state
  const { level, progress } = levelOf(stats)
  const name = user.firstName || user.username || 'Мандрівник'
  return (
    <header className="relative z-20 px-2 pt-2">
      <div className="px-wood mx-auto flex max-w-md items-center gap-2 px-1 py-0.5">
        <Avatar user={user} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-extrabold">{name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="font-pixel text-[8px] text-gold">РІВ {level}</span>
            <Bar value={progress} tone="sky" className="h-2! flex-1" />
          </div>
        </div>
        <div className="relative flex items-center gap-1 rounded-sm bg-black/35 px-2 py-1.5 shadow-[inset_0_2px_0_#0005]">
          <span className="text-base">✨</span>
          <Counter value={balance} className="font-pixel text-[12px] text-gold" />
          <FloatingDelta value={balance} />
        </div>
      </div>
    </header>
  )
}

function Avatar({ user }) {
  const [broken, setBroken] = useState(false)
  if (user.photoUrl && !broken) {
    return (
      <img
        src={user.photoUrl}
        alt=""
        onError={() => setBroken(true)}
        className="size-9 shrink-0 rounded-sm border-2 border-wood-dark object-cover"
      />
    )
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border-2 border-wood-dark bg-parch font-pixel text-sm text-ink">
      {(user.firstName || '?').charAt(0).toUpperCase()}
    </div>
  )
}

/* ───────── Нижні вкладки ───────── */

function TabBar() {
  const { nav, switchTab, state } = useGame()
  // Червона крапка: є що забрати. Заготівля — окремим таймером, щоб крапка з'явилась вчасно.
  const jobReady = useJobReady(state.job)
  const badges = {
    home: state.daily.claimedToday ? 0 : 1,
    map: jobReady ? 1 : 0,
  }
  return (
    <nav className="relative z-20 px-2 pb-[max(6px,env(safe-area-inset-bottom))]">
      <div className="px-wood mx-auto grid max-w-md grid-cols-5">
        {TABS.map((t) => {
          const active = nav.tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className="relative flex flex-col items-center gap-0.5 py-1"
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <motion.span
                  layoutId="tab-active"
                  className="absolute inset-x-1 inset-y-0 rounded-sm bg-black/30 shadow-[inset_0_2px_0_#0006]"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <motion.span
                className="relative text-[22px] leading-none"
                animate={active ? { y: [0, -6, 0], scale: [1, 1.15, 1] } : { y: 0, scale: 1 }}
                transition={{ duration: 0.35 }}
              >
                {t.icon}
              </motion.span>
              <span className={`relative text-[10px] font-extrabold ${active ? 'text-gold' : 'text-cream/75'}`}>{t.label}</span>
              {badges[t.id] > 0 && (
                <span className="absolute top-0.5 right-[22%] size-2.5 animate-pulse rounded-full border border-wood-dark bg-bad" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/** true, коли заготівля вже готова. Таймер спрацьовує рівно в момент завершення. */
function useJobReady(job) {
  const { serverNow } = useGame()
  const [readyAt, setReadyAt] = useState(null)
  useEffect(() => {
    if (!job) return
    const t = setTimeout(() => setReadyAt(job.endsAt), Math.max(0, job.endsAt - serverNow()))
    return () => clearTimeout(t)
  }, [job, serverNow])
  return !!job && readyAt === job.endsAt
}

/* ───────── Заставка й помилка ───────── */

function Splash() {
  const [p, setP] = useState(0.1)
  useEffect(() => {
    const id = setInterval(() => setP((x) => Math.min(0.92, x + (1 - x) * 0.15)), 120)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="game-root flex h-dvh flex-col items-center justify-center gap-6 px-8">
      <motion.img
        src="/game/art/home.webp"
        alt=""
        className="w-56 rounded-sm border-4 border-wood-dark shadow-2xl"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <h1 className="font-pixel text-2xl text-cream drop-shadow-[0_3px_0_#000a]">Світодій</h1>
      <Bar value={p} tone="gold" className="w-56" />
      <p className="text-sm text-sky">Пливемо до острова…</p>
    </div>
  )
}

function FatalScreen({ message, onRetry }) {
  return (
    <div className="game-root flex h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="text-6xl">🌫️</span>
      <h1 className="font-pixel text-base text-cream">Туман над морем</h1>
      <p className="max-w-xs text-sky">{message}</p>
      <PxButton variant="yellow" size="lg" onClick={onRetry}>
        Спробувати ще
      </PxButton>
    </div>
  )
}

/* ───────── Перший запуск ───────── */

const ONBOARDING_KEY = 'svitodiy:onboarded:v1'

function Onboarding() {
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(ONBOARDING_KEY)
    } catch {
      return false
    }
  })
  const close = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch {
      /* приватний режим */
    }
    haptic('success')
    setOpen(false)
  }
  const steps = [
    ['🎣', 'Лови', 'Закидай вудку — риба, ресурси, а інколи рідкісні реліквії.'],
    ['🍲', 'Готуй', 'Риба в рюкзаку дає ✨ або інгредієнти для алхімії.'],
    ['🔮', 'Створюй', 'З інгредієнтів — гачки й талісмани, що підвищують улов.'],
    ['🗺️', 'Плавай', 'Острови з деревом, льодом і монстрами. Кожен день — бонус.'],
  ]
  return (
    <Sheet open={open} onClose={close} title="Вітаємо на острові!">
      <ul className="flex flex-col gap-2">
        {steps.map(([icon, title, text], i) => (
          <motion.li
            key={title}
            className="flex items-center gap-3 rounded-sm bg-parch-dark/50 p-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
          >
            <span className="text-3xl">{icon}</span>
            <div>
              <p className="font-extrabold">{title}</p>
              <p className="text-sm text-ink-soft">{text}</p>
            </div>
          </motion.li>
        ))}
      </ul>
      <p className="mt-3 text-center text-xs text-ink-soft">Прогрес спільний із ботом — грай де зручно.</p>
      <PxButton variant="yellow" size="lg" className="mt-3 w-full" onClick={close}>
        Почати
      </PxButton>
    </Sheet>
  )
}
