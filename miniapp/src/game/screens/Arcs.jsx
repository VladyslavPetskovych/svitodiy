import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { arcDeck } from '../arcCards.js'
import { useGame } from '../context.js'
import { haptic, useBackButton } from '../tg.js'
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
          const deck = arcDeck(a.id)
          return (
            <motion.button
              key={a.id}
              type="button"
              onClick={() => go('arc', { id: a.id })}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="relative pt-2"
            >
              {/* Дві картки колоди визирають з-за обкладинки */}
              {deck.slice(0, 2).map((c, k) => (
                <img
                  key={c.src}
                  src={c.src}
                  alt=""
                  loading="lazy"
                  className="absolute inset-x-1 top-2 aspect-3/4 rounded-sm border-2 border-wood-dark object-cover brightness-75"
                  style={{ transform: `rotate(${k ? 7 : -6}deg) translateY(-4px)` }}
                />
              ))}
              <div className="relative overflow-hidden rounded-sm border-4 border-wood-dark shadow-[0_4px_0_#0006]">
                <img src={`/game/art/arc-${a.id}.webp`} alt={a.title} className="aspect-3/4 w-full object-cover" />
                <span className="absolute top-1 right-1 rounded-[2px] bg-black/60 px-1 py-0.5 font-pixel text-[7px] text-cream">
                  🃏 {deck.length}
                </span>
                {s.enabled && (
                  <span className="absolute inset-x-0 bottom-0 bg-good/90 py-0.5 text-center font-pixel text-[8px] text-white">
                    ДЕНЬ {Math.min(s.day, catalog.arcDurationDays)}
                  </span>
                )}
              </div>
            </motion.button>
          )
        })}
      </div>
      <Paper className="p-2 text-sm text-ink-soft">
        Одночасно активна лише одна арка. Бот кілька разів на день надсилає в чат картку з цитатою й маленькою дією. Тут можна
        витягнути картку будь-коли й переглянути всю колоду.
      </Paper>
    </div>
  )
}

export function ArcDetail({ id }) {
  const { catalog, state, act } = useGame()
  const arc = catalog.arcs.find((a) => a.id === id)
  const deck = arcDeck(id)
  const [drawn, setDrawn] = useState(null) // { message, card, key }
  const [drawing, setDrawing] = useState(false)
  const [viewer, setViewer] = useState(null) // індекс картки в колоді
  const [confirm, setConfirm] = useState(false)
  const lastCard = useRef(-1)
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

  /** Як «Надіслати фразу зараз» у боті: фраза з сервера + випадкова картка колоди. */
  const draw = async () => {
    if (drawing) return
    setDrawing(true)
    let idx = Math.floor(Math.random() * deck.length)
    if (deck.length > 1 && idx === lastCard.current) idx = (idx + 1) % deck.length
    lastCard.current = idx
    const card = deck[idx] ?? null
    const [res] = await Promise.all([act('POST', `/arcs/${id}/message`), card && preload(card.src)])
    setDrawing(false)
    if (!res) return
    haptic('medium')
    setDrawn({ message: res.message, card, key: Date.now() })
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
              <PxButton variant="yellow" onClick={draw} disabled={drawing}>
                {drawing ? '🃏 Тасую колоду…' : drawn ? '🃏 Ще одна картка' : '🃏 Витягнути картку дня'}
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

      <AnimatePresence mode="popLayout">
        {drawn && (
          <DrawnCard
            key={drawn.key}
            arc={arc}
            total={total}
            message={drawn.message}
            card={drawn.card}
            onZoom={drawn.card ? () => setViewer(deck.indexOf(drawn.card)) : undefined}
          />
        )}
      </AnimatePresence>

      {deck.length > 0 && <DeckStrip deck={deck} onOpen={setViewer} />}

      <CardViewer deck={deck} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />

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

/** Чекаємо, поки фото завантажиться, щоб картка перевернулась уже з ним. */
function preload(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = img.onerror = () => resolve()
    img.src = src
  })
}

const FACE = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }

/* ───────── Витягнута картка: сорочка → фото з цитатою ───────── */

function DrawnCard({ arc, total, message, card, onZoom }) {
  const progress = Math.floor((Math.min(message.day, total) / total) * 100)
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="flex flex-col gap-2"
    >
      <div className="mx-auto w-[86%]" style={{ perspective: 1200 }}>
        <motion.div
          className="relative aspect-3/4"
          style={{ transformStyle: 'preserve-3d' }}
          initial={{ rotateY: 180 }}
          animate={{ rotateY: 0 }}
          transition={{ delay: 0.25, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {/* Лице */}
          <button
            type="button"
            onClick={onZoom}
            className="absolute inset-0 overflow-hidden rounded-md border-4 border-wood-dark bg-sea-900 text-left shadow-[0_10px_0_#0006,0_20px_40px_#0008]"
            style={FACE}
          >
            <img src={card?.src ?? `/game/art/arc-${arc.id}.webp`} alt="" className="absolute inset-0 size-full object-cover" />
            <span className="pointer-events-none absolute inset-1.5 rounded-sm border border-gold/50" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-linear-to-b from-black/70 to-transparent p-3 pb-8">
              <span className="font-pixel text-[9px] text-gold drop-shadow-[0_2px_0_#000]">
                {arc.emoji} ДЕНЬ {message.day}/{total}
              </span>
              <span className="font-pixel text-[9px] text-cream/80">{progress}%</span>
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/60 to-transparent p-4 pt-20">
              <motion.p
                className="font-serif text-[17px] leading-snug text-cream italic drop-shadow-[0_2px_2px_#000]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
              >
                “{message.quote}”
              </motion.p>
            </div>
          </button>
          {/* Сорочка */}
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-md border-4 border-wood-dark shadow-[0_10px_0_#0006]"
            style={{
              ...FACE,
              transform: 'rotateY(180deg)',
              background: 'repeating-linear-gradient(45deg, #5b3a22 0 10px, #6d4629 10px 20px)',
            }}
          >
            <span className="absolute inset-2 rounded-sm border-2 border-gold/60" />
            <span className="flex size-24 items-center justify-center rounded-full border-2 border-gold/70 bg-black/30 text-5xl">
              {arc.emoji}
            </span>
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05 }}>
        <Paper className="p-2 text-sm">
          🎯 <b>Мікродія:</b> {message.action}
        </Paper>
      </motion.div>
    </motion.div>
  )
}

/* ───────── Колода: стрічка мініатюр ───────── */

function DeckStrip({ deck, onOpen }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <p className="font-pixel text-[10px] text-cream">КОЛОДА</p>
        <p className="text-xs text-sky/80">{deck.length} карток · торкнись, щоб роздивитись</p>
      </div>
      <div className="no-scrollbar -mx-3 flex snap-x gap-2 overflow-x-auto px-3 pt-1 pb-3">
        {deck.map((c, i) => (
          <motion.button
            key={c.src}
            type="button"
            onClick={() => {
              haptic('light')
              onOpen(i)
            }}
            whileTap={{ scale: 0.93 }}
            initial={{ opacity: 0, y: 12, rotate: i % 2 ? 2 : -2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.04 }}
            className="relative w-20 shrink-0 snap-start overflow-hidden rounded-sm border-2 border-wood-dark shadow-[0_3px_0_#0006]"
          >
            <img src={c.src} alt="" loading="lazy" className="aspect-3/4 w-full object-cover" />
          </motion.button>
        ))}
      </div>
    </div>
  )
}

/* ───────── Повноекранний перегляд зі свайпом ───────── */

function CardViewer({ deck, index, onIndex, onClose }) {
  const open = index != null && index >= 0
  useBackButton(open, onClose)
  const [dir, setDir] = useState(0)
  const step = (d) => {
    const next = index + d
    if (next < 0 || next >= deck.length) return
    haptic('select')
    setDir(d)
    onIndex(next)
  }
  const card = open ? deck[index] : null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
            <span className="font-pixel text-[10px] text-cream/80">
              {index + 1} / {deck.length}
            </span>
            <button type="button" onClick={onClose} className="px-2 text-3xl leading-none text-cream/80" aria-label="Закрити">
              ×
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.img
                key={card.src}
                src={card.src}
                alt=""
                custom={dir}
                variants={{
                  enter: (d) => ({ opacity: 0, x: d * 120, rotate: d * 6 }),
                  center: { opacity: 1, x: 0, rotate: 0 },
                  exit: (d) => ({ opacity: 0, x: d * -120, rotate: d * -6 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.5}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60 || info.velocity.x < -400) step(1)
                  else if (info.offset.x > 60 || info.velocity.x > 400) step(-1)
                }}
                onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full rounded-md border-4 border-wood-dark object-contain shadow-2xl"
                style={{ aspectRatio: `${card.w} / ${card.h}` }}
                draggable={false}
              />
            </AnimatePresence>
          </div>
          <div
            className="flex justify-center gap-6 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <PxButton variant="paper" size="sm" onClick={() => step(-1)} disabled={index === 0}>
              ‹ Назад
            </PxButton>
            <PxButton variant="paper" size="sm" onClick={() => step(1)} disabled={index === deck.length - 1}>
              Далі ›
            </PxButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
