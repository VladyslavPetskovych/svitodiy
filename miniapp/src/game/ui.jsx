import { AnimatePresence, animate, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { RARITY } from './data.js'
import { haptic, useBackButton } from './tg.js'

/* ───────── Кнопки й панелі ───────── */

const BTN_VARIANT = { yellow: '', green: 'px-btn-green', blue: 'px-btn-blue', red: 'px-btn-red', paper: 'px-btn-paper' }

/** Піксельна кнопка з текстурою Kenney. size: sm | md | lg */
export function PxButton({ variant = 'yellow', size = 'md', className = '', onClick, children, ...rest }) {
  const sizes = {
    sm: 'px-3 py-1.5 text-[13px]',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3.5 font-pixel text-[13px] leading-snug tracking-wide',
  }
  return (
    <button
      type="button"
      className={`px-btn ${BTN_VARIANT[variant]} ${sizes[size]} inline-flex items-center justify-center gap-2 font-extrabold select-none ${className}`}
      onClick={(e) => {
        haptic('light')
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Paper({ className = '', children, ...rest }) {
  return (
    <div className={`px-paper ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function Wood({ className = '', children }) {
  return <div className={`px-wood text-cream ${className}`}>{children}</div>
}

export function Bar({ value, tone = '', className = '' }) {
  return (
    <div className={`px-bar ${tone} ${className}`}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

/** Заголовок екрана: піксельний шрифт і підзаголовок. */
export function ScreenTitle({ title, subtitle, right }) {
  return (
    <div className="mb-3 flex items-end gap-3 px-1">
      <div className="min-w-0 flex-1">
        <h1 className="font-pixel text-[15px] leading-snug text-cream drop-shadow-[0_2px_0_#0008]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-sky/90">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function Segmented({ options, value, onChange }) {
  // Багато вкладок на вузькому екрані — дрібніший шрифт і менші поля, щоб підписи влазили.
  const tight = options.length > 4
  return (
    <div className="px-wood grid gap-1 p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              haptic('select')
              onChange(o.value)
            }}
            className={`relative rounded-sm py-2 font-extrabold transition ${tight ? 'px-0.5 text-[11px]' : 'px-2 text-[13px]'} ${active ? 'text-ink' : 'text-cream/80'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${options.map((x) => x.value).join()}`}
                className="absolute inset-0 rounded-sm bg-parch shadow-[inset_0_-3px_0_#c9ad73]"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        haptic('select')
        onChange(!checked)
      }}
      className="flex w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span className="font-bold">{label}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-sm border-2 border-ink/60 transition ${checked ? 'bg-good' : 'bg-parch-dark'}`}>
        <motion.span
          className="absolute top-0.5 size-5 rounded-sm border-2 border-ink/60 bg-cream"
          animate={{ left: checked ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
        />
      </span>
    </button>
  )
}

/* ───────── Числа ───────── */

/** Число, що «докручується» до нового значення. */
export function Counter({ value, className = '' }) {
  const ref = useRef(null)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value || !ref.current) return
    const controls = animate(from, value, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = Math.round(v).toLocaleString('uk-UA')
      },
    })
    return () => controls.stop()
  }, [value])
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value.toLocaleString('uk-UA')}
    </span>
  )
}

/* ───────── Предмети ───────── */

/** Іконка предмета: арт, якщо є, інакше емодзі. */
export function ItemIcon({ item, size = 40, className = '' }) {
  // Піксельний спрайт (риба, ресурс, реліквія) — без згладжування.
  if (item.image) {
    return <img src={item.image} alt="" style={{ width: size, height: size }} className={`pixelated object-contain ${className}`} />
  }
  return (
    <span style={{ fontSize: size * 0.72, lineHeight: 1 }} className={`inline-block drop-shadow-[0_2px_0_#0003] ${className}`}>
      {item.emoji}
    </span>
  )
}

/** Комірка рюкзака з кількістю. */
/**
 * Піксельна риба на «воді» кольору рідкості — для карток улову й довідника.
 * Спрайт крихітний (~36×25), тож малюємо його великим і без згладжування.
 */
export function FishArt({ item, className = '', style }) {
  const r = RARITY[item.rarity] ?? RARITY.common
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: `radial-gradient(circle at 50% 60%, ${r.color}66, #123550 55%, #0a1c2a 100%)`, ...style }}
    >
      <div className="water-shimmer pointer-events-none absolute inset-x-0 bottom-0 h-1/3 opacity-40" />
      <img src={item.image} alt="" className="pixelated relative h-[72%] max-w-[88%] object-contain drop-shadow-[0_4px_0_#0006]" />
    </div>
  )
}

export function ItemSlot({ item, count, onClick, equipped, dim }) {
  const rarity = item.kind === 'fish' ? RARITY[item.rarity] : null
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={() => {
        haptic('select')
        onClick?.()
      }}
      className={`px-slot relative flex aspect-square w-full items-center justify-center ${dim ? 'opacity-40' : ''}`}
      style={rarity && item.rarity !== 'common' ? { boxShadow: `0 0 0 2px ${rarity.color}, 0 0 12px ${rarity.color}66` } : undefined}
    >
      <ItemIcon item={item} size={38} />
      {count != null && (
        <span className="absolute right-0.5 bottom-0 font-pixel text-[10px] text-ink drop-shadow-[0_1px_0_#fff8]">{count}</span>
      )}
      {equipped && <span className="absolute top-0 left-0.5 text-[11px]">✅</span>}
    </motion.button>
  )
}

export function Chip({ ok, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border-2 px-1.5 py-0.5 text-xs font-bold ${
        ok ? 'border-good/70 bg-good/15 text-[#2d6b18]' : 'border-bad/60 bg-bad/10 text-[#9a2f1d]'
      }`}
    >
      {children}
    </span>
  )
}

/* ───────── Шторка знизу ───────── */

/** Нижня шторка: тягни вниз або «Назад» у Telegram, щоб закрити. */
export function Sheet({ open, onClose, title, children }) {
  useBackButton(open, onClose)
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 flex items-end justify-center" initial="hidden" animate="shown" exit="hidden">
          <motion.div
            className="absolute inset-0 bg-black/55"
            variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-md px-2 pb-[max(8px,env(safe-area-inset-bottom))]"
            variants={{ hidden: { y: '100%' }, shown: { y: 0 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose()
            }}
          >
            <Paper className="max-h-[82dvh] overflow-y-auto p-3">
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-ink/25" />
              {title && <h2 className="mb-3 text-center font-pixel text-[13px] leading-snug">{title}</h2>}
              {children}
            </Paper>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────── Спливаючі написи ───────── */

/** Темний контур навколо тексту: читається на будь-якому тлі без плашки. */
const OUTLINE = '0 2px 0 #1c120a, 2px 0 0 #1c120a, -2px 0 0 #1c120a, 0 -2px 0 #1c120a, 1px 1px 0 #1c120a, -1px -1px 0 #1c120a, 0 4px 8px #0009'
const FLOAT_TONE = { info: '#fff4dc', good: '#ffe27a', error: '#ff9d8c', calm: '#cfe8ff' }

/** Тримати точку на екрані так, щоб напис шириною ~200px не вилазив за край. */
function clampPoint(at, { top = 70, bottom = 120 } = {}) {
  const w = typeof window === 'undefined' ? 400 : window.innerWidth
  const h = typeof window === 'undefined' ? 800 : window.innerHeight
  const x = at?.x ?? w / 2
  const y = at?.y ?? h * 0.42
  return { x: Math.min(w - 100, Math.max(100, x)), y: Math.min(h - bottom, Math.max(top, y)) }
}

/**
 * Короткі відгуки («Куплено», «Не вистачає…»): не вікна, а написи, що спливають із місця дотику
 * й тануть. Нічого не закривають і крізь них можна тапати.
 */
export function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {toasts.map((t) => {
          const p = clampPoint(t.x == null ? null : t)
          return (
            <motion.div
              key={t.id}
              className="absolute w-max max-w-[200px] -translate-x-1/2 text-center text-[14px] leading-tight font-extrabold"
              style={{ left: p.x, top: p.y - 34 - t.stack * 24, color: FLOAT_TONE[t.kind] ?? FLOAT_TONE.info, textShadow: OUTLINE }}
              initial={{ opacity: 0, y: 12, scale: 0.6 }}
              animate={{ opacity: 1, y: -14, scale: 1, x: t.kind === 'error' ? [0, -5, 5, -3, 0] : 0 }}
              exit={{ opacity: 0, y: -40, transition: { duration: 0.45 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 20, x: { duration: 0.3 } }}
            >
              {t.text}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

/* ───────── Сплеск нагороди ───────── */

/**
 * Універсальне «Отримано!» (улов, крафт, бій, щоденна нагорода) — святковий сплеск на місці дотику:
 * предмет вистрибує, над ним назва, усе само тане за пару секунд. Без затемнення й кнопок —
 * гра не зупиняється, а тапи проходять крізь нього.
 * spec: { title, subtitle?, image?, sprite?, fish?, icon?, tone: 'good'|'bad'|'epic'|'calm', lines?: string[], rarity? }
 */
export function RewardBurst({ spec, onClose }) {
  const epic = spec?.tone === 'epic'
  const bad = spec?.tone === 'bad'
  // onClose часто приходить новою функцією на кожен рендер — таймер від цього не скидаємо.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!spec) return
    haptic(bad ? 'error' : spec.tone === 'calm' ? 'soft' : 'success')
    const longText = (spec.lines?.[0]?.length ?? 0) > 60
    const t = setTimeout(() => close.current(), epic ? 3200 : longText ? 3600 : 2300)
    return () => clearTimeout(t)
  }, [spec, epic, bad])

  const rarity = spec?.rarity ? RARITY[spec.rarity] : null
  const p = spec ? clampPoint(spec.at, { top: 230, bottom: 40 }) : null
  const glow = rarity?.color ?? (epic ? '#ffcf3f' : bad ? '#e2553e' : null)

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {spec && (
          <motion.div
            key={spec.id}
            className="absolute flex w-[230px] -translate-x-1/2 flex-col items-center text-center"
            style={{ left: p.x, bottom: `calc(100% - ${p.y - 24}px)` }}
            initial={{ opacity: 0, y: 30, scale: 0.4 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: bad ? [0, -8, 8, -5, 0] : 0 }}
            exit={{ opacity: 0, y: -50, transition: { duration: 0.5 } }}
            transition={{ type: 'spring', stiffness: 360, damping: 18, x: { duration: 0.4, delay: 0.15 } }}
          >
            {epic && <div className="glow-rays absolute top-[30%] left-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2" />}
            {epic && <Confetti />}
            <BurstArt spec={spec} glow={glow} />
            <p className="relative mt-1 font-pixel text-[11px] leading-snug" style={{ color: bad ? '#ff9d8c' : '#ffe27a', textShadow: OUTLINE }}>
              {spec.title}
            </p>
            {rarity && (
              <p className="relative font-pixel text-[9px]" style={{ color: rarity.color, textShadow: OUTLINE }}>
                {rarity.label}
              </p>
            )}
            {spec.subtitle && (
              <p className="relative mt-0.5 text-[17px] leading-tight font-extrabold text-cream" style={{ textShadow: OUTLINE }}>
                {spec.subtitle}
              </p>
            )}
            {spec.lines?.[0] && (
              <p className="relative mt-0.5 line-clamp-3 text-[12px] leading-snug font-bold text-cream/90" style={{ textShadow: OUTLINE }}>
                {spec.lines[0]}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Що вистрибує: риба, спрайт, картинка (монстр) чи емодзі — з сяйвом кольору рідкості. */
function BurstArt({ spec, glow }) {
  const pop = { initial: { scale: 0, rotate: -25, y: 20 }, animate: { scale: 1, rotate: 0, y: 0 }, transition: { delay: 0.05, type: 'spring', stiffness: 320, damping: 11 } }
  const halo = glow ? { filter: `drop-shadow(0 0 10px ${glow}) drop-shadow(0 4px 0 #0007)` } : { filter: 'drop-shadow(0 4px 0 #0007)' }
  if (spec.fish?.image || spec.sprite)
    return <motion.img {...pop} src={spec.fish?.image ?? spec.sprite} alt="" className="pixelated relative h-16 max-w-[150px] object-contain" style={halo} />
  if (spec.image)
    return <motion.img {...pop} src={spec.image} alt="" className="relative h-20 w-28 rounded-sm border-2 border-wood-dark object-cover" style={halo} />
  if (spec.icon)
    return (
      <motion.span {...pop} className="relative text-5xl leading-none" style={halo}>
        {spec.icon}
      </motion.span>
    )
  return null
}

const CONFETTI_COLORS = ['#ffcf3f', '#5cb83c', '#4aa3ff', '#e2553e', '#b57bff', '#fff']

function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 360,
      y: -(120 + Math.random() * 260),
      r: Math.random() * 540,
      c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      d: 0.9 + Math.random() * 0.8,
    }))
  )
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute size-2.5"
          style={{ background: p.c }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 420], rotate: p.r, opacity: [1, 1, 0] }}
          transition={{ duration: p.d * 1.8, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

/* ───────── Плаваючий «+N» ───────── */

/** Показує «+N ✨», коли значення зростає. */
export function FloatingDelta({ value }) {
  const prev = useRef(value)
  const [bursts, setBursts] = useState([])
  useEffect(() => {
    const delta = value - prev.current
    prev.current = value
    if (delta === 0) return
    const id = Date.now() + Math.random()
    setBursts((b) => [...b, { id, delta }])
    const t = setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1200)
    return () => clearTimeout(t)
  }, [value])
  return (
    <AnimatePresence>
      {bursts.map((b) => (
        <motion.span
          key={b.id}
          className={`pointer-events-none absolute -bottom-5 right-1 font-pixel text-[11px] ${b.delta > 0 ? 'text-gold' : 'text-bad'}`}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: 14 }}
          exit={{ opacity: 0, y: 26 }}
          transition={{ duration: 0.5 }}
        >
          {b.delta > 0 ? `+${b.delta}` : b.delta}
        </motion.span>
      ))}
    </AnimatePresence>
  )
}
