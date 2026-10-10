import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { canAfford, formatAmounts, homeStorage, itemOf, storageHours } from '../data.js'
import { useGame, useNow } from '../context.js'
import { ART_PX, BUILDING_SPOTS, PALETTE, bubbleTop, buildingSprites, plotSprite } from '../islandSprites.js'
import { haptic } from '../tg.js'
import { Bar, Chip, ItemIcon, PxButton, Sheet } from '../ui.jsx'

/** Яку частину home.webp (900×900) показуємо на головній. */
const SCENE = { x: 150, y: 240, w: 640, h: 520 }

/** Скриня щоденної нагороди на березі біля причалу. */
const CHEST = { x: 345, y: 580 }
const CHEST_ROWS = ['.KKKKKKK.', 'KbLbLbLbK', 'KKKKuKKKK', 'KbbbubbbK', 'KBBBBBBBK']
const CHEST_OPEN_ROWS = ['KKKKKKKKK', 'KyYyYyYyK', 'KbbbbbbbK', 'KbbbbbbbK', 'KBBBBBBBK']

/** Рідний острів: сама сцена й розбудова. Решта розділів — у вкладках. */
export default function Home() {
  const { catalog, go } = useGame()
  const [sheet, setSheet] = useState(null) // id будівлі
  const [daily, setDaily] = useState(false)
  const building = catalog.buildings.find((b) => b.id === sheet)

  return (
    <div className="flex flex-col gap-3">
      <Island onBuilding={setSheet} onChest={() => setDaily(true)} />
      <PxButton variant="blue" size="lg" className="w-full" onClick={() => go('walk')}>
        🚶 Зійти на острів
      </PxButton>
      <BuildingRow onOpen={setSheet} />
      <BuildingSheet building={building} onClose={() => setSheet(null)} />
      <DailySheet open={daily} onClose={() => setDaily(false)} />
    </div>
  )
}

/* ───────── Сцена ───────── */

const pctX = (crop, x) => `${((x - crop.x) / crop.w) * 100}%`
const pctY = (crop, y) => `${((y - crop.y) / crop.h) * 100}%`

/** Фон home.webp, обрізаний до crop, і спрайти будівель поверх нього. */
function Scene({ crop, levels, className = '', children }) {
  const sprites = useMemo(
    () =>
      Object.keys(BUILDING_SPOTS).flatMap((id) => {
        const lvl = levels[id] ?? 0
        const list = lvl > 0 ? buildingSprites(id, lvl) : [plotSprite(id)]
        return list.map((s, i) => ({ ...s, key: `${id}-${lvl}-${i}` }))
      }),
    [levels]
  )
  return (
    <div className={`relative overflow-hidden bg-[#5d9be0] ${className}`} style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
      <img
        src="/game/art/home.webp"
        alt=""
        draggable={false}
        className="pixelated absolute max-w-none"
        style={{ width: `${(900 / crop.w) * 100}%`, left: pctX(crop, 0), top: pctY(crop, 0) }}
      />
      <div className="water-shimmer pointer-events-none absolute inset-x-0 bottom-0 h-2/5 opacity-60" />
      {sprites.map((s) => (
        <PlacedSprite key={s.key} sprite={s} crop={crop} />
      ))}
      {children}
    </div>
  )
}

function PlacedSprite({ sprite, crop }) {
  const w = sprite.src ? sprite.w : sprite.rows[0].length * ART_PX
  const h = sprite.src ? sprite.h : sprite.rows.length * ART_PX
  const box = { left: pctX(crop, sprite.x - w / 2), width: `${(w / crop.w) * 100}%`, height: `${(h / crop.h) * 100}%` }
  return (
    <>
      <motion.div
        className="pointer-events-none absolute origin-bottom"
        style={{ ...box, top: pctY(crop, sprite.y - h) }}
        initial={{ scaleY: 0.2, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 14 }}
      >
        <SpriteArt sprite={sprite} />
      </motion.div>
      {sprite.reflect && (
        <div
          className="pointer-events-none absolute opacity-35"
          style={{ ...box, top: pctY(crop, sprite.y), maskImage: 'linear-gradient(#000, transparent)', WebkitMaskImage: 'linear-gradient(#000, transparent)' }}
        >
          <SpriteArt sprite={sprite} className="-scale-y-100" />
        </div>
      )}
    </>
  )
}

/** Готова піксельна картинка або спрайт із рядків символів. */
function SpriteArt({ sprite, className = '' }) {
  if (sprite.src) return <img src={sprite.src} alt="" draggable={false} className={`pixelated block size-full ${className}`} />
  return <PixelArt rows={sprite.rows} className={className} />
}

/** Рядки символів → SVG; сусідні однакові пікселі зливаються в один прямокутник. */
function PixelArt({ rows, className = '' }) {
  const rects = useMemo(() => {
    const out = []
    rows.forEach((row, y) => {
      let x = 0
      while (x < row.length) {
        const ch = row[x]
        let len = 1
        while (row[x + len] === ch) len++
        if (ch !== '.') out.push({ x, y, len, fill: PALETTE[ch] })
        x += len
      }
    })
    return out
  }, [rows])
  return (
    <svg viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" className={`block size-full ${className}`}>
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.len} height={1} fill={r.fill} />
      ))}
    </svg>
  )
}

/* ───────── Острів на головній ───────── */

function Island({ onBuilding, onChest }) {
  const { state, catalog, items, act, toast } = useGame()
  const now = useNow()
  const { home } = state
  const storage = homeStorage(catalog, home, now)
  const ready = Object.entries(storage.total).filter(([, v]) => v >= 1)
  const [collecting, setCollecting] = useState(false)
  const name = state.user.firstName || 'Мандрівника'

  const collect = async () => {
    if (collecting || !ready.length) return
    setCollecting(true)
    const res = await act('POST', '/home/collect')
    setCollecting(false)
    if (!res) return
    haptic('success')
    toast(`Зібрано: ${formatAmounts(items, res.got)}`)
  }

  return (
    <div className="relative overflow-hidden rounded-sm border-4 border-wood-dark shadow-[0_6px_0_#0006]">
      <Scene crop={SCENE} levels={home.levels}>
        {/* Скриня щоденної нагороди */}
        <Hotspot crop={SCENE} x={CHEST.x} y={CHEST.y - 12} size={60} onClick={onChest} label="Щоденна нагорода" />
        <motion.div
          className="pointer-events-none absolute"
          style={{ left: pctX(SCENE, CHEST.x - 22.5), top: pctY(SCENE, CHEST.y - 25), width: `${(45 / SCENE.w) * 100}%` }}
          animate={state.daily.claimedToday ? {} : { rotate: [0, -6, 6, 0], y: [0, -2, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
        >
          <PixelArt rows={state.daily.claimedToday ? CHEST_OPEN_ROWS : CHEST_ROWS} />
          {!state.daily.claimedToday && (
            <motion.span
              className="absolute -top-4 left-1/2 -translate-x-1/2 text-sm"
              animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.1, 0.8] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              ✨
            </motion.span>
          )}
        </motion.div>

        {/* Будівлі: зона дотику, рівень і врожай над дахом */}
        {catalog.buildings.map((b) => {
          const spot = BUILDING_SPOTS[b.id]
          const lvl = home.levels[b.id]
          const own = Object.entries(storage.perBuilding[b.id] ?? {}).sort((a, c) => c[1] - a[1])[0]
          return (
            <div key={b.id}>
              <Hotspot crop={SCENE} x={spot.x} y={spot.y} size={110} onClick={() => onBuilding(b.id)} label={b.name} />
              <LevelBadge level={lvl} style={{ left: pctX(SCENE, spot.x), top: pctY(SCENE, spot.y + 40) }} />
              <AnimatePresence>
                {own && own[1] >= 1 && (
                  <motion.button
                    type="button"
                    onClick={collect}
                    className="absolute -translate-x-1/2 -translate-y-full"
                    style={{ left: pctX(SCENE, spot.x), top: pctY(SCENE, bubbleTop(b.id, lvl)) }}
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1, y: [0, -4, 0] }}
                    exit={{ opacity: 0, scale: 1.6, y: -30 }}
                    transition={{ default: { duration: 0.25 }, y: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }}
                  >
                    <span className="flex size-8 items-center justify-center rounded-full border-2 border-wood-dark bg-cream text-base shadow-[0_3px_0_#0006]">
                      {own[0] === 'balance' ? '✨' : <ItemIcon item={itemOf(items, own[0])} size={22} />}
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          )
        })}

        <p className="pointer-events-none absolute top-2 left-2 rounded-sm bg-black/35 px-2 py-1 font-pixel text-[9px] text-cream drop-shadow">
          ОСТРІВ {name.toUpperCase()}
        </p>
      </Scene>

      {/* Комора */}
      <div className="flex items-center gap-2 bg-wood-dark px-2 py-1.5">
        <span className="text-lg">🧺</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-pixel text-[8px] text-gold">КОМОРА</span>
            <span className="truncate text-[11px] text-cream/80">
              {storage.fill >= 1 ? 'Повна — забери врожай!' : `Заповниться за ${formatDuration(storage.fullInMs)}`}
            </span>
          </div>
          <Bar value={storage.fill} tone={storage.fill >= 1 ? 'gold' : 'sky'} className="mt-1 h-2!" />
        </div>
        <PxButton size="sm" variant={ready.length ? 'green' : 'paper'} disabled={!ready.length || collecting} onClick={collect}>
          Зібрати
        </PxButton>
      </div>
    </div>
  )
}

/** Рівень будівлі на сцені; порожня ділянка — пульсуючий «+». */
function LevelBadge({ level, style }) {
  return (
    <motion.span
      className={`pointer-events-none absolute flex size-4 -translate-x-1/2 items-center justify-center rounded-[2px] border border-wood-dark font-pixel text-[8px] shadow-[0_2px_0_#0006] ${
        level > 0 ? 'bg-gold text-ink' : 'bg-good text-white'
      }`}
      style={style}
      animate={level > 0 ? {} : { scale: [1, 1.2, 1] }}
      transition={{ duration: 1.2, repeat: Infinity }}
    >
      {level > 0 ? level : '+'}
    </motion.span>
  )
}

function Hotspot({ crop, x, y, size, onClick, label }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        haptic('light')
        onClick()
      }}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full active:bg-white/15"
      style={{ left: pctX(crop, x), top: pctY(crop, y), width: `${(size / crop.w) * 100}%`, aspectRatio: '1' }}
    />
  )
}

/* ───────── Будівлі під сценою ───────── */

function BuildingRow({ onOpen }) {
  const { state, catalog } = useGame()
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {catalog.buildings.map((b, i) => {
        const lvl = state.home.levels[b.id]
        const next = b.levels[lvl + 1]
        const affordable = next && canAfford(next.cost, state.balance, state.inventory)
        return (
          <motion.button
            key={b.id}
            type="button"
            onClick={() => onOpen(b.id)}
            whileTap={{ scale: 0.92 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`px-slot relative flex flex-col items-center py-1.5 ${lvl === 0 ? 'opacity-70' : ''}`}
          >
            <span className="text-2xl leading-none">{b.emoji}</span>
            <span className="mt-1 w-full truncate text-center text-[10px] font-extrabold text-ink">{b.name}</span>
            <LevelPips level={lvl} max={b.levels.length - 1} />
            {affordable && <span className="absolute -top-1 -right-1 size-3 animate-pulse rounded-full border border-wood-dark bg-good" />}
          </motion.button>
        )
      })}
    </div>
  )
}

function LevelPips({ level, max, className = '' }) {
  return (
    <span className={`mt-0.5 flex gap-0.5 ${className}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`size-1.5 rounded-[1px] border border-ink/40 ${i < level ? 'bg-gold' : 'bg-parch-dark'}`} />
      ))}
    </span>
  )
}

/* ───────── Шторка будівлі: зараз → після покращення ───────── */

export function BuildingSheet({ building: b, onClose }) {
  const { state, catalog, items, act, toast } = useGame()
  const [busy, setBusy] = useState(false)
  const open = !!b
  const lvl = b ? state.home.levels[b.id] : 0
  const cur = b?.levels[lvl]
  const next = b?.levels[lvl + 1]
  const affordable = next && canAfford(next.cost, state.balance, state.inventory)

  const upgrade = async () => {
    setBusy(true)
    const res = await act('POST', `/home/${b.id}/upgrade`)
    setBusy(false)
    if (!res) return
    haptic('success')
    toast(lvl === 0 ? `${b.emoji} ${b.name} збудовано!` : `${b.emoji} ${b.name} — рівень ${res.level}!`)
    onClose()
  }

  const spot = b ? BUILDING_SPOTS[b.id] : null
  const crop = spot && { x: spot.x - 110, y: spot.y - 130, w: 220, h: 220 }
  const levelsAt = (n) => ({ ...state.home.levels, [b.id]: n })

  return (
    <Sheet open={open} onClose={onClose} title={b ? `${b.emoji} ${b.name}${lvl ? ` · рівень ${lvl}` : ''}` : ''}>
      {b && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Preview crop={crop} levels={levelsAt(lvl)} caption={lvl ? 'Зараз' : 'Ділянка'} />
            {next && (
              <>
                <span className="font-pixel text-sm text-ink-soft">›</span>
                <Preview crop={crop} levels={levelsAt(lvl + 1)} caption={`Рівень ${lvl + 1}`} highlight />
              </>
            )}
          </div>
          <p className="text-center text-sm text-ink-soft">{b.description}</p>

          <div className="rounded-sm bg-parch-dark/50 p-2 text-sm">
            {b.id === 'house' ? (
              <Row label="Комора" now={`${storageHours(catalog, state.home.levels)} год`} next={next && `${next.storageHours} год`} />
            ) : (
              <Row label="Дає" now={cur?.produces ? formatRates(items, cur.produces) : '—'} next={next && formatRates(items, next.produces)} />
            )}
          </div>

          {next ? (
            <>
              <div className="flex flex-wrap justify-center gap-1.5">
                {Object.entries(next.cost).map(([id, n]) => {
                  const have = id === 'balance' ? state.balance : (state.inventory[id] ?? 0)
                  const item = id === 'balance' ? { emoji: '✨', name: 'Світло' } : itemOf(items, id)
                  return (
                    <Chip key={id} ok={have >= n}>
                      <ItemIcon item={item} size={18} /> {Math.min(have, n)}/{n}
                    </Chip>
                  )
                })}
              </div>
              <PxButton variant="green" size="lg" className="w-full" disabled={!affordable || busy} onClick={upgrade}>
                {lvl === 0 ? '🔨 Збудувати' : `🔨 Покращити до ${lvl + 1}`}
              </PxButton>
              {!affordable && <p className="text-center text-xs text-ink-soft">Матеріали — з рибалки, готування, алхімії й островів на мапі.</p>}
            </>
          ) : (
            <p className="text-center font-pixel text-[10px] text-[#2d6b18]">НАЙВИЩИЙ РІВЕНЬ</p>
          )}
        </div>
      )}
    </Sheet>
  )
}

function Preview({ crop, levels, caption, highlight }) {
  return (
    <div className="mx-auto max-w-[60%] flex-1">
      <Scene
        crop={crop}
        levels={levels}
        className={`rounded-sm border-4 ${highlight ? 'border-good shadow-[0_0_12px_#5cb83c88]' : 'border-wood-dark'}`}
      />
      <p className="mt-1 text-center font-pixel text-[8px] text-ink-soft">{caption}</p>
    </div>
  )
}

function Row({ label, now, next }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2">
      <b>{label}:</b>
      <span>{now}</span>
      {next && (
        <>
          <span className="text-ink-soft">→</span>
          <span className="font-bold text-[#2d6b18]">{next}</span>
        </>
      )}
    </p>
  )
}

/* ───────── Щоденна нагорода (скриня на березі) ───────── */

export function DailySheet({ open, onClose }) {
  const { state, catalog, act, reward } = useGame()
  const { claimedToday, todayIndex } = state.daily
  const rewards = catalog.config.dailyRewards

  const claim = async () => {
    const res = await act('POST', '/daily/claim')
    if (!res) return
    onClose()
    reward({
      title: 'Щоденна нагорода',
      icon: '🎁',
      subtitle: `+${res.reward} ✨`,
      lines: [`Серія: ${res.streak} ${res.streak === 1 ? 'день' : 'дні(в)'} поспіль. Повертайся завтра!`],
      tone: res.streak % rewards.length === 0 ? 'epic' : 'good',
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Скриня на березі">
      <p className="mb-3 text-center text-sm text-ink-soft">Хвилі щодня приносять дарунок. Пропуск дня обнуляє серію.</p>
      <div className="grid grid-cols-7 gap-1">
        {rewards.map((r, i) => {
          const done = claimedToday ? i <= todayIndex : i < todayIndex
          const current = i === todayIndex && !claimedToday
          return (
            <div
              key={i}
              className={`px-slot flex flex-col items-center py-1 ${current ? 'animate-pulse' : ''}`}
              style={current ? { boxShadow: '0 0 0 2px #ffcf3f, 0 0 10px #ffcf3f' } : undefined}
            >
              <span className="font-pixel text-[8px] text-ink-soft">Д{i + 1}</span>
              <span className="text-lg">{done ? '✅' : i === rewards.length - 1 ? '💎' : '✨'}</span>
              <span className="font-pixel text-[9px]">{r}</span>
            </div>
          )
        })}
      </div>
      <PxButton variant="green" size="lg" className="mt-4 w-full" disabled={claimedToday} onClick={claim}>
        {claimedToday ? `Завтра: +${rewards[(todayIndex + 1) % rewards.length]} ✨` : `Відкрити: +${rewards[todayIndex]} ✨`}
      </PxButton>
    </Sheet>
  )
}

/* ───────── Формати ───────── */

function formatRates(items, produces) {
  return Object.entries(produces)
    .map(([id, perHour]) => {
      const icon = id === 'balance' ? '✨' : itemOf(items, id).emoji
      return perHour >= 1 ? `${icon} ${perHour}/год` : `${icon} 1 за ${Math.round(1 / perHour)} год`
    })
    .join(' · ')
}

function formatDuration(ms) {
  const min = Math.ceil(ms / 60_000)
  if (min < 60) return `${min} хв`
  const h = Math.floor(min / 60)
  return min % 60 ? `${h} год ${min % 60} хв` : `${h} год`
}
