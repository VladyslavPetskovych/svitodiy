import { motion } from 'motion/react'
import { useState } from 'react'
import { useGame } from '../context.js'
import { canAfford, formatAmounts, itemOf } from '../data.js'
import { haptic } from '../tg.js'
import { Chip, ItemIcon, PxButton, Sheet } from '../ui.jsx'

/**
 * Виживання на рідному острові: верстат (інструменти й заготовки) і разова звістка
 * про те, що острів почали з нуля. Сам екран — IslandWalk.jsx.
 */

/** Ціна чипами: скільки є / скільки треба. */
function Cost({ cost }) {
  const { state, items } = useGame()
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(cost).map(([id, n]) => {
        const have = id === 'balance' ? state.balance : (state.inventory[id] ?? 0)
        const item = id === 'balance' ? { emoji: '✨', name: 'Світло' } : itemOf(items, id)
        return (
          <Chip key={id} ok={have >= n}>
            <ItemIcon item={item} size={16} /> {Math.min(have, n)}/{n}
          </Chip>
        )
      })}
    </div>
  )
}

/** Верстат: сокира й кайло (два рівні) і дошки з колод. */
export function CraftSheet({ open, onClose }) {
  const { state, catalog, items, act, toast } = useGame()
  const [busy, setBusy] = useState(false)
  const tools = catalog.craft?.tools ?? []
  const recipes = catalog.craft?.recipes ?? []

  const craftTool = async (t) => {
    if (busy) return
    setBusy(true)
    const res = await act('POST', '/craft/tool', { tool: t.id })
    setBusy(false)
    if (!res) return
    haptic('success')
    toast(`${t.emoji} Готово: ${res.name}!`)
  }
  const craftRecipe = async (r, count) => {
    if (busy) return
    setBusy(true)
    const res = await act('POST', '/craft/recipe', { recipe: r.id, count })
    setBusy(false)
    if (!res) return
    haptic('success')
    toast(`${r.emoji} ${formatAmounts(items, res.got)}`)
  }
  /** Скільки разів вистачить матеріалів на рецепт. */
  const timesOf = (r) => Math.min(...Object.entries(r.in).map(([id, n]) => Math.floor((state.inventory[id] ?? 0) / n)))

  return (
    <Sheet open={open} onClose={onClose} title="🪚 Верстат">
      <div className="flex flex-col gap-3">
        <p className="text-center text-sm text-ink-soft">Сокира рубає дерева, кайло б'є каміння. Залізні — швидші, дають більше й беруть валуни на скелях.</p>

        {tools.map((t, i) => {
          const lvl = state.tools?.[t.id] ?? 0
          const cur = t.levels[lvl - 1]
          const next = t.levels[lvl]
          const ok = next && canAfford(next.cost, state.balance, state.inventory)
          return (
            <motion.div
              key={t.id}
              className="flex items-center gap-2 rounded-sm bg-parch-dark/50 p-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <span className={`text-3xl ${lvl ? '' : 'opacity-40 grayscale'}`}>{t.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">{cur ? cur.name : t.id === 'axe' ? 'Сокири немає' : 'Кайла немає'}</p>
                {next ? (
                  <>
                    <p className="mb-1 text-xs text-ink-soft">Далі: {next.name}</p>
                    <Cost cost={next.cost} />
                  </>
                ) : (
                  <p className="font-pixel text-[9px] text-[#2d6b18]">НАЙКРАЩА</p>
                )}
              </div>
              {next && (
                <PxButton size="sm" variant="green" disabled={!ok || busy} onClick={() => craftTool(t)}>
                  {lvl ? 'Покращити' : 'Зробити'}
                </PxButton>
              )}
            </motion.div>
          )
        })}

        {recipes.map((r) => {
          const n = timesOf(r)
          return (
            <div key={r.id} className="flex items-center gap-2 rounded-sm bg-parch-dark/50 p-2">
              <span className="text-3xl">{r.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">{r.name}</p>
                <p className="flex flex-wrap items-center gap-1 text-xs text-ink-soft">
                  {Object.entries(r.in).map(([id, k]) => (
                    <span key={id} className="inline-flex items-center">
                      <ItemIcon item={itemOf(items, id)} size={14} />×{k}
                    </span>
                  ))}
                  →
                  {Object.entries(r.out).map(([id, k]) => (
                    <span key={id} className="inline-flex items-center">
                      <ItemIcon item={itemOf(items, id)} size={14} />×{k}
                    </span>
                  ))}
                </p>
              </div>
              <PxButton size="sm" variant="green" disabled={n < 1 || busy} onClick={() => craftRecipe(r, 1)}>
                ×1
              </PxButton>
              <PxButton size="sm" variant="yellow" disabled={n < 2 || busy} onClick={() => craftRecipe(r, Math.min(n, 20))}>
                ×{Math.max(2, Math.min(n, 20))}
              </PxButton>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

/** Разова звістка: острів тепер починається з нуля, а все вкладене повернулося в рюкзак. */
export function ResetSheet({ note, onClose }) {
  const { items } = useGame()
  const refund = note?.refund ?? {}
  const got = note?.got ?? {}
  return (
    <Sheet open={!!note} onClose={onClose} title="🏝️ Острів почався з нуля">
      {note && (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm text-ink-soft">
            Тепер на острові лише хатинка й причал. Будівлі, грядки й декор ставиш сам, де хочеш, і переносиш будь-коли. Дерева й каміння
            ростуть самі — рубай, добувай, майструй на верстаті.
          </p>
          {Object.keys(refund).length > 0 && (
            <div className="rounded-sm bg-parch-dark/50 p-2 text-center text-sm">
              <p className="mb-1 font-pixel text-[9px] text-ink-soft">ПОВЕРНУЛИ В РЮКЗАК УСЕ ВКЛАДЕНЕ</p>
              <p>{formatAmounts(items, refund)}</p>
            </div>
          )}
          {Object.keys(got).length > 0 && <p className="text-center text-xs text-ink-soft">І врожай із комори: {formatAmounts(items, got)}</p>}
          <PxButton variant="green" size="lg" className="w-full" onClick={onClose}>
            Будуймо! 🔨
          </PxButton>
        </div>
      )}
    </Sheet>
  )
}
