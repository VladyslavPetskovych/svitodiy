import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { RARITY, itemOf, pct, sourceOf } from '../data.js'
import { useGame } from '../context.js'
import { haptic } from '../tg.js'
import { Chip, FishArt, ItemIcon, ItemSlot, Paper, PxButton, ScreenTitle, Segmented, Sheet } from '../ui.jsx'
import { EquipSheet } from './Fishing.jsx'

export default function Backpack({ tab: initialTab = 'items' }) {
  const [tab, setTab] = useState(initialTab)
  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle title="Рюкзак" subtitle={tab === 'items' ? 'Улов, ресурси й реліквії' : 'Перетворюй ресурси на спорядження'} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'items', label: '🎒 Речі' },
          { value: 'alchemy', label: '🔮 Алхімія' },
        ]}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: tab === 'items' ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'items' ? <Items /> : <Alchemy />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ───────── Речі ───────── */

const FILTERS = [
  { value: 'all', label: 'Усе' },
  { value: 'fish', label: 'Риба' },
  { value: 'resource', label: 'Ресурси' },
  { value: 'relic', label: 'Реліквії' },
]

function Items() {
  const { state, items, catalog, act, reward, switchTab } = useGame()
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [slot, setSlot] = useState(null)
  const [confirmSell, setConfirmSell] = useState(false)

  const order = [...catalog.fish, ...catalog.resources, ...catalog.relics].map((x) => x.id)
  const owned = Object.entries(state.inventory)
    .map(([id, count]) => ({ item: itemOf(items, id), count }))
    .sort((a, b) => order.indexOf(a.item.id) - order.indexOf(b.item.id))
  const shown = owned.filter((x) => filter === 'all' || x.item.kind === filter)
  const fishValue = owned.filter((x) => x.item.kind === 'fish').reduce((s, x) => s + x.item.sellPrice * x.count, 0)
  const equippedIds = new Set([state.equipped.hook, state.equipped.talisman])

  const sellAll = async () => {
    const res = await act('POST', '/fish/sell-all')
    setConfirmSell(false)
    if (res) reward({ title: 'Ринок', icon: '💰', subtitle: `+${res.earned} ✨`, lines: [`Продано риби: ${res.sold}`], tone: 'good' })
  }

  return (
    <div className="flex flex-col gap-3">
      <Paper className="p-2">
        <p className="font-pixel text-[10px] text-ink-soft">СПОРЯДЖЕННЯ</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            ['hook', 'Гачок'],
            ['talisman', 'Талісман'],
          ].map(([s, label]) => {
            const id = state.equipped[s]
            const it = id ? itemOf(items, id) : null
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  haptic('select')
                  setSlot(s)
                }}
                className="flex items-center gap-2 rounded-sm bg-parch-dark/50 p-1.5 text-left"
              >
                <span className="px-slot flex size-11 shrink-0 items-center justify-center">
                  {it ? <ItemIcon item={it} size={28} /> : <span className="text-lg opacity-50">➕</span>}
                </span>
                <span className="min-w-0 text-xs">
                  <b className="block">{label}</b>
                  <span className="text-ink-soft">{it ? `+${pct(it.fishBonus)} риби` : 'порожньо'}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Paper>

      <Segmented value={filter} onChange={setFilter} options={FILTERS} />

      {shown.length === 0 ? (
        <Paper className="flex flex-col items-center gap-2 p-4 text-center">
          <span className="text-4xl">🕸️</span>
          <p className="text-sm text-ink-soft">Тут поки порожньо. Закинь вудку — і рюкзак почне наповнюватись.</p>
          <PxButton onClick={() => switchTab('fishing')}>🎣 До рибалки</PxButton>
        </Paper>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {shown.map(({ item, count }, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
            >
              <ItemSlot item={item} count={count} equipped={equippedIds.has(item.id)} onClick={() => setSelected(item.id)} />
            </motion.div>
          ))}
        </div>
      )}

      {fishValue > 0 && (
        <PxButton variant="yellow" onClick={() => setConfirmSell(true)}>
          💰 Продати всю рибу · +{fishValue} ✨
        </PxButton>
      )}

      <ItemSheet id={selected} onClose={() => setSelected(null)} onEquip={(s) => setSlot(s)} />
      <EquipSheet slot={slot} onClose={() => setSlot(null)} />
      <Sheet open={confirmSell} onClose={() => setConfirmSell(false)} title="Продати всю рибу?">
        <p className="text-center text-sm text-ink-soft">
          Отримаєш <b>+{fishValue} ✨</b>. Риба зникне з рюкзака — для алхімії її краще приготувати.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PxButton variant="paper" onClick={() => setConfirmSell(false)}>
            Скасувати
          </PxButton>
          <PxButton variant="green" onClick={sellAll}>
            Продати
          </PxButton>
        </div>
      </Sheet>
    </div>
  )
}

function ItemSheet({ id, onClose, onEquip }) {
  const { state, items, catalog, act, reward } = useGame()
  // Поки шторка ховається, id вже null — показуємо останній предмет, щоб вміст не зник посеред анімації.
  const [lastId, setLastId] = useState(id)
  if (id && id !== lastId) setLastId(id)
  const shownId = id ?? lastId
  const item = shownId ? itemOf(items, shownId) : null
  const count = shownId ? (state.inventory[shownId] ?? 0) : 0

  // Предмет закінчився (продали/приготували останній) — закриваємо шторку.
  useEffect(() => {
    if (id && count === 0) onClose()
  }, [id, count, onClose])

  const sell = async (n) => {
    const res = await act('POST', '/fish/sell', { fishId: item.id, count: n })
    if (res) haptic('success')
  }
  const cook = async () => {
    const res = await act('POST', '/fish/cook', { fishId: item.id })
    if (!res) return
    reward({
      title: 'Смачного!',
      icon: '🍲',
      subtitle: 'Отримано інгредієнти',
      lines: [Object.entries(res.drops).map(([rid, n]) => `${itemOf(items, rid).emoji} ${itemOf(items, rid).name} ×${n}`).join(' · ')],
      tone: 'good',
    })
  }

  const usedIn = item ? catalog.recipes.filter((r) => item.id in r.consumes) : []
  const source = item?.kind === 'resource' ? sourceOf(catalog, item.id) : null
  const rarity = item?.kind === 'fish' ? RARITY[item.rarity] : null

  return (
    <Sheet open={!!id} onClose={onClose} title={item ? item.name : ''}>
      {item && (
        <div className="flex flex-col gap-3">
          {item.kind === 'fish' && item.image ? (
            <FishArt
              item={item}
              className="aspect-[16/9] w-full rounded-sm border-4 border-wood-dark"
              style={{ boxShadow: `0 0 0 2px ${rarity.color}` }}
            />
          ) : (
            <div className="flex justify-center py-2">
              <ItemIcon item={item} size={80} />
            </div>
          )}
          <div className="text-center">
            {rarity && (
              <p className="font-pixel text-[10px]" style={{ color: rarity.color }}>
                {rarity.label}
              </p>
            )}
            <p className="mt-1 text-sm text-ink-soft">
              {item.kind === 'fish' && `📏 ~${item.size} · ${item.flavor}`}
              {item.kind === 'relic' && (item.fishBonus ? `Спорядження: +${pct(item.fishBonus)} до шансу риби` : 'Рідкісна реліквія з глибин')}
              {item.kind === 'resource' && (source ? `Де взяти: ${source}` : 'Ресурс для алхімії')}
            </p>
            <p className="mt-1 font-pixel text-[11px]">У рюкзаку: ×{count}</p>
          </div>

          {item.kind === 'fish' && (
            <div className="grid grid-cols-2 gap-2">
              <PxButton variant="yellow" onClick={() => sell(1)}>
                💰 Продати +{item.sellPrice}
              </PxButton>
              <PxButton variant="blue" onClick={cook}>
                🍲 Приготувати
              </PxButton>
              {count > 1 && (
                <PxButton variant="paper" className="col-span-2" onClick={() => sell('all')}>
                  Продати всі {count} · +{item.sellPrice * count} ✨
                </PxButton>
              )}
            </div>
          )}
          {item.kind === 'fish' && (
            <p className="text-center text-xs text-ink-soft">Готування дає 1–3 інгредієнти для алхімії.</p>
          )}

          {item.kind === 'relic' && item.slot && (
            <PxButton
              variant="green"
              onClick={() => {
                onClose()
                onEquip(item.slot)
              }}
            >
              {state.equipped[item.slot] === item.id ? 'Вдягнуто · змінити' : 'Вдягнути'}
            </PxButton>
          )}

          {usedIn.length > 0 && (
            <div>
              <p className="mb-1 font-pixel text-[10px] text-ink-soft">ПОТРІБНО ДЛЯ</p>
              <div className="flex flex-wrap gap-1">
                {usedIn.map((r) => (
                  <span key={r.id} className="rounded-sm bg-parch-dark/60 px-1.5 py-0.5 text-xs font-bold">
                    {r.emoji} {r.name} ×{r.consumes[item.id]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

/* ───────── Алхімія ───────── */

function Alchemy() {
  const { catalog, state, items, act, reward, toast } = useGame()
  const [crafting, setCrafting] = useState(null)

  const can = (r) => Object.entries(r.consumes).every(([id, n]) => (state.inventory[id] ?? 0) >= n)
  const recipes = [...catalog.recipes].sort((a, b) => Number(can(b)) - Number(can(a)))

  const craft = async (r) => {
    setCrafting(r.id)
    haptic('medium')
    const [res] = await Promise.all([act('POST', '/alchemy/craft', { recipeId: r.id }), new Promise((ok) => setTimeout(ok, 900))])
    setCrafting(null)
    if (!res) return
    const out = itemOf(items, res.output.id)
    reward({
      title: 'Алхімія вдалася!',
      icon: out.image ? undefined : out.emoji,
      sprite: out.image ?? undefined,
      subtitle: `${out.name}${res.output.amount > 1 ? ` ×${res.output.amount}` : ''}`,
      lines: [out.fishBonus ? `Вдягни в рюкзаку: +${pct(out.fishBonus)} до шансу риби` : 'Додано в рюкзак'],
      tone: out.kind === 'relic' ? 'epic' : 'good',
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {recipes.map((r, i) => {
        const out = itemOf(items, r.output.id)
        const ok = can(r)
        const owned = state.inventory[r.output.id] ?? 0
        return (
          <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Paper className={`p-2 ${ok ? '' : 'opacity-90'}`}>
              <div className="flex items-center gap-3">
                <motion.div
                  className="px-slot relative flex size-14 shrink-0 items-center justify-center"
                  animate={crafting === r.id ? { rotate: [0, -8, 8, 0], scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.3, repeat: crafting === r.id ? Infinity : 0 }}
                  style={ok ? { boxShadow: '0 0 0 2px #5cb83c, 0 0 10px #5cb83c88' } : undefined}
                >
                  <ItemIcon item={out} size={34} />
                  {r.output.amount > 1 && <span className="absolute right-0.5 bottom-0 font-pixel text-[9px]">×{r.output.amount}</span>}
                </motion.div>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">
                    {r.emoji} {r.name}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {out.fishBonus ? `${out.slot === 'hook' ? 'Гачок' : 'Талісман'}: +${pct(out.fishBonus)} риби` : out.kind === 'relic' ? 'Реліквія' : `Ресурс: ${out.name}`}
                    {owned > 0 && ` · є ×${owned}`}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(r.consumes).map(([id, need]) => {
                  const have = state.inventory[id] ?? 0
                  const it = itemOf(items, id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        const src = sourceOf(catalog, id)
                        toast(`${it.emoji} ${it.name}${src ? ` — ${src.toLowerCase()}` : ''}`)
                      }}
                    >
                      <Chip ok={have >= need}>
                        <ItemIcon item={it} size={18} /> {Math.min(have, need)}/{need}
                      </Chip>
                    </button>
                  )
                })}
              </div>
              <PxButton variant="green" className="mt-2 w-full" disabled={!ok || !!crafting} onClick={() => craft(r)}>
                {crafting === r.id ? '🫧 Вариться…' : ok ? '✨ Створити' : '🔒 Бракує ресурсів'}
              </PxButton>
            </Paper>
          </motion.div>
        )
      })}
      <p className="px-1 text-center text-xs text-sky">Торкнись інгредієнта — підкажу, де його взяти.</p>
    </div>
  )
}
