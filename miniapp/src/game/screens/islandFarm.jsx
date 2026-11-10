import { motion } from 'motion/react'
import { useState } from 'react'
import { useGame } from '../context.js'
import { formatAmounts, itemOf } from '../data.js'
import { growTime, ownedSeeds, shortDuration } from '../farm.js'
import { haptic } from '../tg.js'
import { ItemIcon, PxButton, Segmented, Sheet } from '../ui.jsx'

/**
 * Город і пси на рідному острові: шторки «Комора городника» й «Песик», рядок насіння
 * та підказки для панелі дії. Сам екран — IslandWalk.jsx.
 */

/** Рядок пакетиків насіння: що посадити наступним тапом по грядці. */
export function SeedBar({ seed, setSeed, onShop }) {
  const { catalog, state, items } = useGame()
  const seeds = ownedSeeds(catalog, state.inventory)
  return (
    <div className="no-scrollbar -mx-3 flex items-stretch gap-1.5 overflow-x-auto px-3 pb-1">
      {seeds.map(({ crop, count }) => {
        const active = seed === crop.id
        return (
          <motion.button
            key={crop.id}
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              haptic('select')
              setSeed(crop.id)
            }}
            className="px-slot relative flex w-14.5 shrink-0 flex-col items-center py-1"
            style={active ? { boxShadow: '0 0 0 2px #ffcf3f, 0 0 10px #ffcf3f' } : undefined}
            aria-label={`Насіння: ${crop.name}`}
          >
            <ItemIcon item={itemOf(items, `seed_${crop.id}`)} size={32} />
            <span className="w-full truncate px-0.5 text-center text-[9px] leading-tight font-extrabold text-ink">{crop.name}</span>
            <span className="absolute top-0 right-1 font-pixel text-[9px] text-ink drop-shadow-[0_1px_0_#fff8]">{count}</span>
          </motion.button>
        )
      })}
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={onShop}
        className="px-slot flex w-14.5 shrink-0 flex-col items-center justify-center gap-0.5 py-1 text-ink"
      >
        <span className="text-xl">🛒</span>
        <span className="text-[9px] leading-tight font-extrabold">{seeds.length ? 'Ще' : 'Купити насіння'}</span>
      </motion.button>
    </div>
  )
}

/* ───────── Комора городника ───────── */

const FARM_TABS = [
  { value: 'seeds', label: '🌱 Насіння' },
  { value: 'sell', label: '🧺 Продати' },
  { value: 'guide', label: '📖 Як' },
]

export function FarmSheet({ tab, setTab, onClose }) {
  const { state } = useGame()
  const beds = Object.values(state.farm?.plots ?? {})
  const sprinkled = beds.filter((b) => b.a).length
  return (
    <Sheet open={!!tab} onClose={onClose} title="🌱 Комора городника">
      <div className="flex flex-col gap-2.5">
        <p className="text-center text-[12px] text-ink-soft">
          Грядок на острові: {beds.length}
          {sprinkled ? ` · 💦 під дощувачем: ${sprinkled}` : ''} · у тебе {state.balance} ✨
        </p>
        <Segmented options={FARM_TABS} value={tab ?? 'seeds'} onChange={setTab} />
        {tab === 'seeds' && <SeedShop />}
        {tab === 'sell' && <SellCrops />}
        {tab === 'guide' && <FarmGuide />}
      </div>
    </Sheet>
  )
}

function SeedShop() {
  const { catalog, state, items, act, toast } = useGame()
  const [busy, setBusy] = useState(false)
  const buy = async (crop, count) => {
    if (busy) return
    setBusy(true)
    const res = await act('POST', '/farm/seeds', { crop: crop.id, count })
    setBusy(false)
    if (!res) return
    haptic('success')
    toast(`Куплено: ${formatAmounts(items, res.got)} · −${res.spent} ✨`)
  }
  return (
    <div className="flex flex-col gap-1.5">
      {(catalog.farm?.crops ?? []).map((c) => {
        const owned = state.inventory[`seed_${c.id}`] ?? 0
        return (
          <div key={c.id} className="px-slot flex items-center gap-2 p-1.5">
            <ItemIcon item={itemOf(items, `crop_${c.id}`)} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-extrabold text-ink">
                {c.name} {owned > 0 && <span className="font-pixel text-[9px] text-ink-soft">· є {owned}</span>}
              </p>
              <p className="text-[10px] leading-tight text-ink-soft">
                {c.stages} поливів · ~{shortDuration(growTime(c))} · урожай {c.yield[0] === c.yield[1] ? c.yield[0] : `${c.yield[0]}–${c.yield[1]}`} × {c.sellPrice}✨
                {c.regrow != null ? ' · плодоносить знову' : ''}
                {c.dogFood ? ' · 🐶 смакота' : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <PxButton size="sm" variant="green" disabled={busy || state.balance < c.seedPrice} onClick={() => buy(c, 1)}>
                ×1 · {c.seedPrice}✨
              </PxButton>
              <PxButton size="sm" variant="paper" disabled={busy || state.balance < c.seedPrice * 5} onClick={() => buy(c, 5)}>
                ×5 · {c.seedPrice * 5}✨
              </PxButton>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SellCrops() {
  const { catalog, state, items, act, toast } = useGame()
  const [busy, setBusy] = useState(false)
  const owned = (catalog.farm?.crops ?? []).map((c) => ({ c, n: state.inventory[`crop_${c.id}`] ?? 0 })).filter((x) => x.n > 0)
  const sell = async (crop, count) => {
    if (busy) return
    setBusy(true)
    const res = await act('POST', '/farm/sell', { crop: crop.id, count })
    setBusy(false)
    if (!res) return
    haptic('success')
    toast(`Продано ${crop.name} ×${res.sold} · +${res.earned} ✨`)
  }
  if (!owned.length) return <p className="py-4 text-center text-[13px] text-ink-soft">Урожаю поки немає — посади щось і полий 💧</p>
  return (
    <div className="flex flex-col gap-1.5">
      {owned.map(({ c, n }) => (
        <div key={c.id} className="px-slot flex items-center gap-2 p-1.5">
          <ItemIcon item={itemOf(items, `crop_${c.id}`)} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-extrabold text-ink">
              {c.name} ×{n}
            </p>
            <p className="text-[10px] text-ink-soft">
              {c.sellPrice} ✨ за штуку{c.dogFood ? ' · або нагодуй пса' : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <PxButton size="sm" variant="yellow" disabled={busy} onClick={() => sell(c, 1)}>
              +{c.sellPrice}✨
            </PxButton>
            {n > 1 && (
              <PxButton size="sm" variant="paper" disabled={busy} onClick={() => sell(c, 'all')}>
                Усі · +{c.sellPrice * n}✨
              </PxButton>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function FarmGuide() {
  const { catalog } = useGame()
  const steps = [
    ['🟫', 'Постав грядки', '«Будувати» → «Будова» → «Грядка». Скільки хочеш і де хочеш — переносиш будь-коли.'],
    ['🌱', 'Посади', 'Підійди до грядки й обери пакетик у рядку внизу. Посаджене одразу й полите.'],
    ['💧', 'Полий', 'Над грядкою з’явилась 💧 — земля пересохла. Кожен полив — ще одна стадія росту.'],
    ['🧺', 'Збери', 'Над стиглою — 🧺. Помідори й полуниця плодоносять ще раз.'],
    ['⚡', 'Усі разом', 'Кнопка «Полити всі» / «Зібрати все» — мандрівник сам обійде грядки. Тапни острів, щоб зупинити.'],
  ]
  return (
    <div className="flex flex-col gap-1.5 text-ink">
      {steps.map(([icon, title, text]) => (
        <div key={title} className="px-slot flex items-start gap-2 p-2">
          <span className="text-2xl leading-none">{icon}</span>
          <div>
            <p className="text-[13px] font-extrabold">{title}</p>
            <p className="text-[11px] leading-snug text-ink-soft">{text}</p>
          </div>
        </div>
      ))}
      <p className="text-center text-[11px] leading-snug text-ink-soft">
        Дощувач 💦 (теж у «Будова») поливає сам усі грядки на {Math.round((catalog.farm?.sprinklerR ?? 40) / 16)} клітинки довкола — там рослини
        ростуть без перерви. Дощ поливає весь острів.
      </p>
    </div>
  )
}

/* ───────── Песик ───────── */

const MODES = [
  { mode: 'follow', icon: '🐾', label: 'До мене' },
  { mode: 'sit', icon: '🪑', label: 'Сидіти' },
  { mode: 'house', icon: '🏠', label: 'Додому' },
]
const MODE_TEXT = { follow: 'ходить за тобою', sit: 'сидить, де сказали', house: 'чекає вдома на лежанці' }

export function Hearts({ hearts, love, size = 13 }) {
  const part = (love % 10) / 10
  return (
    <span className="inline-flex gap-px" aria-label={`Дружба: ${hearts} з 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} style={{ fontSize: size, lineHeight: 1, opacity: i < hearts ? 1 : i === hearts && part > 0 ? 0.35 + part * 0.4 : 0.22 }}>
          {i < hearts ? '❤️' : '🤍'}
        </span>
      ))}
    </span>
  )
}

/**
 * Шторка пса: дружба, годування й команди.
 * @param {{ dog: { id: string, name: string } | null, onClose: () => void,
 *   onCommand: (id: string, mode: string) => void, onFeed: (id: string, itemId: string) => void }} p
 */
export function DogSheet({ dog, onClose, onCommand, onFeed }) {
  const { catalog, state, items } = useGame()
  const info = dog ? (state.dogs?.[dog.id] ?? { love: 0, hearts: 0, mode: 'follow' }) : null
  const loves = dog ? catalog.pets?.dogs.find((d) => d.id === dog.id)?.loves : null
  const food = (catalog.pets?.food ?? []).filter((id) => (state.inventory[id] ?? 0) > 0)
  const isFav = (id) => (loves === 'fish' ? itemOf(items, id).kind === 'fish' : id === loves)
  food.sort((a, b) => Number(isFav(b)) - Number(isFav(a)))
  return (
    <Sheet open={!!dog} onClose={onClose} title={dog ? `🐶 ${dog.name}` : ''}>
      {dog && (
        <div className="flex flex-col gap-3 text-ink">
          <div className="flex flex-col items-center gap-1">
            <Hearts hearts={info.hearts} love={info.love} />
            <p className="text-center text-[12px] text-ink-soft">
              {info.fedToday ? 'Ситий і щасливий 😋' : 'Зголоднів — пригости чимось!'} · зараз {MODE_TEXT[info.mode] ?? MODE_TEXT.follow}
            </p>
            <p className="text-center text-[11px] text-ink-soft">
              Найбільше любить: {loves === 'fish' ? 'рибу 🐟' : `${itemOf(items, loves).name} ${itemOf(items, loves).emoji}`}
            </p>
          </div>

          <div>
            <p className="mb-1 font-pixel text-[10px]">КОМАНДИ</p>
            <div className="grid grid-cols-3 gap-1.5">
              {MODES.map((m) => {
                const active = (info.mode ?? 'follow') === m.mode
                return (
                  <PxButton key={m.mode} size="sm" variant={active ? 'green' : 'paper'} onClick={() => onCommand(dog.id, m.mode)}>
                    {m.icon} {m.label}
                  </PxButton>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-1 font-pixel text-[10px]">ПОГОДУВАТИ {info.fedToday && '· ЗАВТРА ЗНОВУ'}</p>
            {food.length ? (
              <div className="grid grid-cols-5 gap-1.5">
                {food.map((id) => {
                  const it = itemOf(items, id)
                  return (
                    <motion.button
                      key={id}
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      disabled={info.fedToday}
                      onClick={() => onFeed(dog.id, id)}
                      className={`px-slot relative flex aspect-square items-center justify-center ${info.fedToday ? 'opacity-40' : ''}`}
                      aria-label={`Нагодувати: ${it.name}`}
                    >
                      <ItemIcon item={it} size={30} />
                      <span className="absolute right-0.5 bottom-0 font-pixel text-[9px]">{state.inventory[id]}</span>
                      {isFav(id) && <span className="absolute top-0 left-0.5 text-[10px]">⭐</span>}
                    </motion.button>
                  )
                })}
              </div>
            ) : (
              <p className="text-[12px] text-ink-soft">
                Нічим пригостити. Пси їдять рибу, риб'ячі кістки, моркву й гарбуз з городу.
              </p>
            )}
          </div>
          <p className="text-center text-[11px] leading-snug text-ink-soft">
            Раз на день можна нагодувати й погладити — дружба росте. Ситий пес інколи щось відкопує й приносить тобі.
          </p>
        </div>
      )}
    </Sheet>
  )
}
