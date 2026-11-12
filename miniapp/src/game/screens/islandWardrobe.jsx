import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../context.js'
import { canAfford, itemOf } from '../data.js'
import { haptic } from '../tg.js'
import { Chip, ItemIcon, PxButton, Segmented, Sheet } from '../ui.jsx'
import artVersion from '../walk/version.json'
import { HERO_CELL, HERO_FRAME, composeHero, heroFrameIndex, loadHeroSheet, outfitOf } from '../walk/outfit.js'

/**
 * Шафа з одягом у хатинці (річ з act 'closet'): приміряти, перевдягтися, пошити чи купити.
 * Те, що вже є, вдягається одним тапом; нове спершу приміряєш на манекені, а тоді шиєш або купуєш —
 * і воно одразу на тобі. Назви й ціни — catalog.wear (server/src/game/wardrobe.js).
 */

const WALK = [1, 0, 2, 0]
const TURN = ['down', 'left', 'up', 'right']

/** Мандрівник у вбранні outfit: повільно обертається й крокує на місці. */
function HeroPreview({ outfit, scale = 5, pop = 0 }) {
  const ref = useRef(null)
  const sheet = useRef(document.createElement('canvas'))
  const [ready, setReady] = useState(false)
  const key = `${outfit.hat ?? '-'}|${outfit.top}|${outfit.bottom}`

  useEffect(() => {
    let alive = true
    loadHeroSheet().then(
      (img) => {
        if (!alive) return
        composeHero(img, outfit, sheet.current)
        setReady(true)
      },
      () => {}
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- перезбираємо лише за ключем вбрання
  }, [key])

  useEffect(() => {
    if (!ready) return
    const ctx = ref.current.getContext('2d')
    ctx.imageSmoothingEnabled = false
    const t0 = performance.now()
    let raf = 0
    const draw = (now) => {
      const t = (now - t0) / 1000
      const dir = TURN[Math.floor(t / 1.8) % TURN.length]
      const i = heroFrameIndex(dir, WALK[Math.floor(t * 6) % WALK.length])
      ctx.clearRect(0, 0, HERO_FRAME.w, HERO_FRAME.h)
      ctx.drawImage(sheet.current, i * HERO_CELL.w + 1, 1, HERO_FRAME.w, HERO_FRAME.h, 0, 0, HERO_FRAME.w, HERO_FRAME.h)
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [ready, key])

  return (
    <div className="relative flex items-end justify-center" style={{ height: HERO_FRAME.h * scale + 8 }}>
      <div className="absolute bottom-0 h-3 w-16 rounded-[50%] bg-black/20" />
      <motion.canvas
        key={pop}
        ref={ref}
        width={HERO_FRAME.w}
        height={HERO_FRAME.h}
        className="pixelated relative"
        style={{ width: HERO_FRAME.w * scale, height: HERO_FRAME.h * scale, transformOrigin: '50% 100%' }}
        initial={pop ? { scaleY: 0.82, scaleX: 1.14 } : false}
        animate={{ scaleY: 1, scaleX: 1 }}
        transition={{ type: 'spring', stiffness: 600, damping: 12 }}
      />
      <AnimatePresence>
        {pop > 0 && (
          <motion.span
            key={`spark-${pop}`}
            className="pointer-events-none absolute top-0 text-2xl"
            initial={{ opacity: 0, y: 10, scale: 0.6 }}
            animate={{ opacity: [0, 1, 0], y: -18, scale: 1.2 }}
            transition={{ duration: 1.1 }}
          >
            ✨
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Іконка одягу (намальована локальною моделлю), а поки її немає — емодзі. */
function WearIcon({ item, size = 40 }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <ItemIcon item={item} size={size} />
  return (
    <img
      src={`/game/wear/${item.id}.png?v=${artVersion.v}`}
      alt=""
      onError={() => setBroken(true)}
      style={{ width: size, height: size }}
      className="pixelated object-contain drop-shadow-[0_2px_0_#0003]"
    />
  )
}

/** Ціна чипами: скільки є / скільки треба. */
function Cost({ cost }) {
  const { state, items } = useGame()
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {Object.entries(cost).map(([id, n]) => {
        const have = state.inventory[id] ?? 0
        return (
          <Chip key={id} ok={have >= n}>
            <ItemIcon item={itemOf(items, id)} size={16} /> {Math.min(have, n)}/{n}
          </Chip>
        )
      })}
    </div>
  )
}

const NONE = { id: null, name: 'Без капелюха', emoji: '🙂' }

export function ClosetSheet({ open, onClose, onDressed }) {
  const { state, catalog, act } = useGame()
  const slots = catalog.wear?.slots ?? []
  const all = catalog.wear?.items ?? []
  const worn = outfitOf(state.wear)
  const owned = new Set(state.wear?.owned ?? all.filter((w) => w.starter).map((w) => w.id))
  const [slot, setSlot] = useState('hat')
  const [trying, setTrying] = useState(null) // { slot, id } — приміряємо ще не своє
  const [busy, setBusy] = useState(false)
  const [pop, setPop] = useState(0)
  const [note, setNote] = useState(null) // { text, bad } — коротко під манекеном
  const changed = useRef(false)

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 2600)
    return () => clearTimeout(t)
  }, [note])

  const shown = trying ? { ...worn, [trying.slot]: trying.id } : worn
  const list = [...(slots.find((s) => s.id === slot)?.optional ? [NONE] : []), ...all.filter((w) => w.slot === slot)]
  const tryItem = trying && all.find((w) => w.id === trying.id)

  const dressed = () => {
    haptic('success')
    setPop((p) => p + 1)
    changed.current = true
  }

  const pick = async (w) => {
    if (busy) return
    haptic('select')
    if (w.id == null || owned.has(w.id)) {
      setTrying(null)
      if (worn[slot] === w.id) return
      setBusy(true)
      const res = await act('POST', '/wear/equip', { slot, item: w.id }, { silent: true })
      setBusy(false)
      if (res) dressed()
      else setNote({ text: 'Не вдалося перевдягтися', bad: true })
      return
    }
    setTrying(trying?.id === w.id ? null : { slot, id: w.id })
  }

  const get = async (how) => {
    if (busy || !tryItem) return
    setBusy(true)
    const res = await act('POST', '/wear/get', { item: tryItem.id, how }, { silent: true })
    setBusy(false)
    if (!res) {
      haptic('error')
      setNote({ text: how === 'buy' ? 'Не вистачає ✨' : 'Не вистачає матеріалів', bad: true })
      return
    }
    setTrying(null)
    setNote({ text: how === 'buy' ? `Куплено: ${tryItem.name}` : `Пошито: ${tryItem.name}` })
    dressed()
  }

  // Наступного разу шафа відкриється без приміряння й старих написів.
  const close = () => {
    onClose()
    setTrying(null)
    setNote(null)
    if (changed.current) onDressed?.()
    changed.current = false
  }

  return (
    <Sheet open={open} onClose={close} title="👕 Шафа">
      <div className="flex flex-col gap-3">
        <div className="rounded-sm bg-parch-dark/50 pt-2 pb-1">
          <HeroPreview outfit={shown} pop={pop} />
          <p className={`mt-1 h-4 text-center text-xs font-extrabold ${note?.bad ? 'text-[#b03a2e]' : 'text-[#2d6b18]'}`}>
            {note?.text ?? (tryItem ? `Приміряєш: ${tryItem.name}` : '')}
          </p>
        </div>

        <Segmented
          options={slots.map((s) => ({ value: s.id, label: `${s.emoji} ${s.name}` }))}
          value={slot}
          onChange={(v) => {
            setSlot(v)
            setTrying(null)
          }}
        />

        <div className="grid grid-cols-3 gap-2">
          {list.map((w) => {
            const mine = w.id == null || owned.has(w.id)
            const on = worn[slot] === w.id && !trying
            const tried = trying?.id === w.id
            return (
              <button
                key={w.id ?? 'none'}
                type="button"
                disabled={busy}
                onClick={() => pick(w)}
                className={`relative flex flex-col items-center gap-1 rounded-sm p-2 transition active:scale-95 ${
                  on ? 'bg-[#cfe6a8] shadow-[inset_0_0_0_2px_#2d6b18]' : tried ? 'bg-[#fff0b8] shadow-[inset_0_0_0_2px_#c49a45]' : 'bg-parch-dark/50'
                }`}
              >
                {w.id == null ? <span className="flex h-10 items-center text-3xl">{w.emoji}</span> : <WearIcon item={w} />}
                <span className="text-center text-[11px] leading-tight font-extrabold">{w.name}</span>
                <span className={`font-pixel text-[8px] ${mine ? 'text-[#2d6b18]' : 'text-ink-soft'}`}>
                  {on ? 'НА ТОБІ' : mine ? 'У ШАФІ' : w.price && !w.craft ? `${w.price} ✨` : w.craft ? 'ПОШИТИ' : ''}
                </span>
              </button>
            )
          })}
        </div>

        <AnimatePresence initial={false}>
          {tryItem && (
            <motion.div
              key={tryItem.id}
              className="flex flex-col gap-2 rounded-sm bg-parch-dark/50 p-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {tryItem.craft && (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Cost cost={tryItem.craft} />
                  </div>
                  <PxButton size="sm" variant="green" disabled={busy || !canAfford(tryItem.craft, state.balance, state.inventory)} onClick={() => get('craft')}>
                    🧵 Пошити
                  </PxButton>
                </div>
              )}
              {tryItem.price && (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 text-center">
                    <Chip ok={state.balance >= tryItem.price}>
                      ✨ {Math.min(state.balance, tryItem.price)}/{tryItem.price}
                    </Chip>
                  </div>
                  <PxButton size="sm" variant="yellow" disabled={busy || state.balance < tryItem.price} onClick={() => get('buy')}>
                    Купити
                  </PxButton>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  )
}
