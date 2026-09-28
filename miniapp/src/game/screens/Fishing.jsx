import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { RARITY, fishChance, itemOf, pct } from '../data.js'
import { useGame } from '../context.js'
import { haptic } from '../tg.js'
import { ItemIcon, Paper, PxButton, ScreenTitle, Sheet } from '../ui.jsx'

/** Де на арті fishing.webp намальований поплавок (у % від розміру картинки). */
const BOBBER = { x: 70.4, y: 65.8 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Скільки поплавок «думає» до клювання. */
const biteDelay = () => 1100 + Math.random() * 1500

/*
 * Фази закиду: idle → casting → waiting → bite → reeling → (вікно улову) → idle.
 * Результат визначає сервер одразу; фази — лише подача, щоб закид відчувався.
 * Порожній закид: waiting → miss → idle.
 */
export default function Fishing() {
  const { act, catalog, items, state, reward } = useGame()
  const [phase, setPhaseState] = useState('idle')
  // Ref потрібен, бо «Ще закид» з вікна улову викликає cast зі старого рендера.
  const phaseRef = useRef('idle')
  const setPhase = (p) => {
    phaseRef.current = p
    setPhaseState(p)
  }
  const [missLine, setMissLine] = useState(null)
  const [log, setLog] = useState([])
  const [slot, setSlot] = useState(null)
  const pending = useRef(null)
  const autoReel = useRef(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(autoReel.current)
    }
  }, [])

  const chance = fishChance(catalog, state.equipped)

  const cast = async () => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'miss') return
    haptic('medium')
    setMissLine(null)
    setPhase('casting')
    const request = act('POST', '/fish/cast')
    await sleep(450)
    if (!alive.current) return
    setPhase('waiting')
    const [res] = await Promise.all([request, sleep(biteDelay())])
    if (!alive.current) return
    if (!res) {
      setPhase('idle')
      return
    }
    const outcome = res.outcome
    if (outcome.kind === 'miss') {
      haptic('soft')
      setMissLine(outcome.line)
      setPhase('miss')
      setLog((l) => [{ key: Date.now(), icon: '💨' }, ...l].slice(0, 8))
      return
    }
    pending.current = outcome
    haptic('heavy')
    setTimeout(() => haptic('warning'), 120)
    setPhase('bite')
    // Не встиг підсікти — витягнемо самі: улов уже в рюкзаку, карати не будемо.
    autoReel.current = setTimeout(() => reel(), 3500)
  }

  const reel = async () => {
    clearTimeout(autoReel.current)
    const outcome = pending.current
    if (!outcome) return
    pending.current = null
    haptic('rigid')
    setPhase('reeling')
    await sleep(500)
    if (!alive.current) return
    setPhase('idle')
    const item = itemOf(items, outcome.id)
    setLog((l) => [{ key: Date.now(), icon: item.emoji }, ...l].slice(0, 8))
    showCatch(outcome, item)
  }

  const showCatch = (outcome, item) => {
    const again = { label: '🎣 Ще закид', variant: 'yellow', onClick: () => setTimeout(cast, 250) }
    if (outcome.kind === 'fish') {
      const epic = item.rarity === 'legendary' || item.rarity === 'mythic'
      reward({
        title: epic ? 'НЕЙМОВІРНО!' : 'Улов!',
        rarity: item.rarity,
        image: item.image,
        subtitle: `${item.emoji} ${item.name}`,
        lines: [`📏 ~${item.size} · 💰 ${item.sellPrice} ✨`, item.flavor, `У рюкзаку: ×${outcome.total}`],
        tone: epic ? 'epic' : 'good',
        actions: [
          again,
          {
            label: `Продати зараз +${item.sellPrice} ✨`,
            variant: 'paper',
            onClick: () => act('POST', '/fish/sell', { fishId: item.id, count: 1 }),
          },
        ],
      })
    } else if (outcome.kind === 'resource') {
      reward({
        title: 'Щось зачепилось!',
        icon: item.emoji,
        subtitle: item.name,
        lines: ['Ресурс з води — знадобиться в алхімії.', `У рюкзаку: ×${outcome.total}`],
        tone: 'good',
        actions: [again, { label: 'Добре', variant: 'paper' }],
      })
    } else {
      reward({
        title: 'РЕЛІКВІЯ!',
        image: item.image ?? undefined,
        icon: item.image ? undefined : item.emoji,
        subtitle: item.name,
        lines: [
          'Рідкісна знахідка з глибин.',
          item.fishBonus ? `Вдягни — і риби більше: +${pct(item.fishBonus)}` : 'Цінність для колекції.',
          `У колекції: ×${outcome.total}`,
        ],
        tone: 'epic',
        actions: [again, { label: 'Чудово', variant: 'paper' }],
      })
    }
  }

  const busy = phase === 'casting' || phase === 'waiting' || phase === 'reeling'
  const hook = state.equipped.hook ? itemOf(items, state.equipped.hook) : null
  const talisman = state.equipped.talisman ? itemOf(items, state.equipped.talisman) : null

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle title="Риболовля" subtitle="Закинь вудку й підсічи, коли клюне" />

      <div className="relative overflow-hidden rounded-sm border-4 border-wood-dark shadow-[0_6px_0_#0006]">
        <motion.div
          animate={phase === 'reeling' ? { y: [0, -4, 3, 0] } : { y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative"
        >
          <img src="/game/art/fishing.webp" alt="" className="block w-full" width="900" height="990" />
          <div className="water-shimmer pointer-events-none absolute inset-x-0 top-[58%] h-[40%]" />
          <Bobber phase={phase} />
        </motion.div>

        <AnimatePresence>
          {missLine && phase === 'miss' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-3 top-3"
            >
              <Paper className="p-1 text-center text-sm font-bold">{missLine}</Paper>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute top-2 left-2 flex flex-col gap-1">
          <GearChip label="Гачок" item={hook} onClick={() => setSlot('hook')} />
          <GearChip label="Талісман" item={talisman} onClick={() => setSlot('talisman')} />
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-[13px] text-sky">
        <span>
          🐟 Шанс риби: <b className="text-cream">{pct(chance.total)}</b>
          {chance.bonus > 0 && <span className="text-gold"> (+{pct(chance.bonus)})</span>}
        </span>
        <span>🎣 {state.stats.casts}</span>
      </div>

      {phase === 'bite' ? (
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 0.4, repeat: Infinity }}>
          <PxButton variant="green" size="lg" className="w-full py-5! text-base!" onClick={reel}>
            ❗ ТЯГНИ!
          </PxButton>
        </motion.div>
      ) : (
        <PxButton variant="yellow" size="lg" className="w-full py-5! text-base!" disabled={busy} onClick={cast}>
          {phase === 'casting' ? 'Закидаю…' : phase === 'waiting' ? 'Чекаємо…' : phase === 'reeling' ? 'Тягну!' : '🎣 Закинути вудку'}
        </PxButton>
      )}

      {log.length > 0 && (
        <div className="flex items-center gap-1 px-1">
          <span className="text-xs text-sky">Останні:</span>
          <AnimatePresence initial={false}>
            {log.map((l) => (
              <motion.span
                key={l.key}
                layout
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-lg"
              >
                {l.icon}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}

      <FishGuide />
      <EquipSheet slot={slot} onClose={() => setSlot(null)} />
    </div>
  )
}

function Bobber({ phase }) {
  const y = { idle: 0, casting: -30, waiting: 0, bite: 7, reeling: -40, miss: 0 }[phase]
  const visible = phase !== 'reeling'
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: `${BOBBER.x}%`, top: `${BOBBER.y}%`, transform: 'translate(-50%, -50%)' }}
    >
      {(phase === 'waiting' || phase === 'bite') && (
        <>
          <span className="ripple" style={{ left: '50%', top: '60%', translate: '-50% -50%' }} />
          <span className="ripple" style={{ left: '50%', top: '60%', translate: '-50% -50%', animationDelay: '0.8s' }} />
        </>
      )}
      <motion.div
        animate={{
          y: phase === 'waiting' ? [0, 2, 0, -1, 0] : y,
          opacity: visible ? 1 : 0,
          rotate: phase === 'bite' ? [0, -12, 10, 0] : 0,
        }}
        transition={
          phase === 'waiting'
            ? { duration: 1.4, repeat: Infinity }
            : phase === 'bite'
              ? { duration: 0.3, repeat: Infinity }
              : { duration: 0.35 }
        }
        className="relative"
      >
        {/* Піксельний поплавок поверх намальованого на арті */}
        <div className="h-4 w-3 overflow-hidden rounded-t-full border-2 border-[#2a1a10]">
          <div className="h-1/2 bg-bad" />
          <div className="h-1/2 bg-cream" />
        </div>
        <AnimatePresence>
          {phase === 'bite' && (
            <motion.span
              initial={{ scale: 0, y: 0 }}
              animate={{ scale: 1, y: -18 }}
              exit={{ scale: 0 }}
              className="absolute -top-3 left-1/2 -translate-x-1/2 font-pixel text-lg text-gold drop-shadow-[0_2px_0_#000]"
            >
              !
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
      <AnimatePresence>
        {phase === 'casting' && <Splash key="splash" />}
      </AnimatePresence>
    </div>
  )
}

function Splash() {
  return (
    <div className="absolute top-1/2 left-1/2">
      {[...Array(7)].map((_, i) => (
        <motion.span
          key={i}
          className="absolute size-1.5 bg-cream"
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: (i - 3) * 7, y: [0, -14 - (i % 3) * 5, 4], opacity: [1, 1, 0] }}
          transition={{ duration: 0.5, delay: 0.25 }}
        />
      ))}
    </div>
  )
}

function GearChip({ label, item, onClick }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic('select')
        onClick()
      }}
      className="flex items-center gap-1.5 rounded-sm border-2 border-wood-dark bg-black/55 px-1.5 py-1 text-left text-cream backdrop-blur-sm"
    >
      <span className="text-base">{item ? item.emoji : '➕'}</span>
      <span className="text-[11px] leading-tight font-bold">
        {label}
        <br />
        <span className={item ? 'text-gold' : 'text-cream/60'}>{item ? `+${pct(item.fishBonus)}` : 'порожньо'}</span>
      </span>
    </button>
  )
}

/** Вибір гачка / талісмана. */
export function EquipSheet({ slot, onClose }) {
  const { catalog, state, act, items } = useGame()
  const options = catalog.relics.filter((r) => r.slot === slot)
  const current = slot ? state.equipped[slot] : null
  const equip = async (relicId) => {
    const res = await act('POST', '/equip', { slot, relicId })
    if (res) {
      haptic('success')
      onClose()
    }
  }
  return (
    <Sheet open={!!slot} onClose={onClose} title={slot === 'hook' ? 'Гачок' : 'Талісман'}>
      <p className="mb-3 text-center text-sm text-ink-soft">
        {slot === 'hook' ? 'Гачок і талісман додаються: разом ще більше риби.' : 'Талісман працює разом із гачком.'}
      </p>
      <div className="flex flex-col gap-2">
        {options.map((r) => {
          const owned = (state.inventory[r.id] ?? 0) > 0
          const recipe = catalog.recipes.find((x) => x.output.id === r.id)
          const active = current === r.id
          return (
            <div key={r.id} className={`flex items-center gap-3 rounded-sm p-2 ${active ? 'bg-good/20' : 'bg-parch-dark/50'}`}>
              <ItemIcon item={itemOf(items, r.id)} size={36} />
              <div className="flex-1">
                <p className="font-extrabold">{r.name}</p>
                <p className="text-xs text-ink-soft">
                  +{pct(r.fishBonus)} до шансу риби
                  {!owned && recipe && ' · створи в алхімії'}
                </p>
              </div>
              {active ? (
                <span className="font-pixel text-[10px] text-[#2d6b18]">ВДЯГНУТО</span>
              ) : (
                <PxButton size="sm" variant="green" disabled={!owned} onClick={() => equip(r.id)}>
                  Вдягнути
                </PxButton>
              )}
            </div>
          )
        })}
      </div>
      {current && (
        <PxButton variant="paper" className="mt-3 w-full" onClick={() => equip(null)}>
          Зняти
        </PxButton>
      )}
    </Sheet>
  )
}

/** Хто водиться у водах острова — з рідкістю й ціною. */
function FishGuide() {
  const { catalog, state } = useGame()
  const [open, setOpen] = useState(false)
  return (
    <>
      <PxButton variant="paper" onClick={() => setOpen(true)}>
        📘 Хто водиться у воді
      </PxButton>
      <Sheet open={open} onClose={() => setOpen(false)} title="Мешканці води">
        <div className="flex flex-col gap-2">
          {[...catalog.fish]
            .sort((a, b) => b.share - a.share)
            .map((f) => {
              const r = RARITY[f.rarity]
              const caught = (state.inventory[f.id] ?? 0) > 0
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-sm bg-parch-dark/50 p-1.5">
                  <img
                    src={`/game/fish/${f.id}.webp`}
                    alt=""
                    className="h-12 w-20 rounded-sm object-cover"
                    style={{ boxShadow: `0 0 0 2px ${r.color}` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold">
                      {f.emoji} {f.name}
                    </p>
                    <p className="text-xs text-ink-soft">
                      <span style={{ color: r.color }} className="font-bold">
                        {r.label}
                      </span>{' '}
                      · {f.sellPrice} ✨ · {(f.share * catalog.fishingChances.fish * 100).toFixed(f.share < 0.02 ? 2 : 1)}% закидів
                    </p>
                  </div>
                  {caught && <span title="Є в рюкзаку">🎒</span>}
                </div>
              )
            })}
        </div>
      </Sheet>
    </>
  )
}
