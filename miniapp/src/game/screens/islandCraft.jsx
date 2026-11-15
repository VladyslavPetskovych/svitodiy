import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useGame } from '../context.js'
import { canAfford, formatAmounts, itemOf, toolArt } from '../data.js'
import { haptic } from '../tg.js'
import { Chip, ItemIcon, PxButton, Segmented, Sheet } from '../ui.jsx'

/**
 * Виживання на рідному острові: верстат, електромашини, майстерня (усе разом) і разова звістка
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

/** Верстат: сокира, кайло й лопата (по два рівні), дошки з колод і дріт із мідного злиточка. */
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
        <p className="text-center text-sm text-ink-soft">
          Сокира рубає дерева, кайло б'є каміння, лопата копає замети на Острові Хуртовини. Залізні — швидші, дають більше й беруть валуни та
          великі замети.
        </p>

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
              {toolArt(t.id, lvl) ? (
                <img src={toolArt(t.id, lvl)} alt="" className={`pixelated h-10 w-10 shrink-0 ${lvl ? '' : 'opacity-40 grayscale'}`} />
              ) : (
                <span className={`text-3xl ${lvl ? '' : 'opacity-40 grayscale'}`}>{t.emoji}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">{cur ? cur.name : (t.none ?? 'Немає')}</p>
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
              <ItemIcon item={itemOf(items, Object.keys(r.out)[0])} size={32} className="shrink-0" />
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

/** Електричні машини: рецепти з каталогу, куди слати запит і як назвати (server/src/game/furnace.js → MACHINES). */
const MACHINE_UI = {
  furnace: { title: '🔥 Електропіч', who: 'Піч', recipes: (c) => c.furnace?.recipes, url: (id) => `/home/furnace/${id}/smelt` },
  e_bench: { title: '⚙️ Електроверстат', who: 'Верстат', recipes: (c) => c.eBench?.recipes, url: (id) => `/home/e-bench/${id}/craft` },
}

/**
 * Електропіч чи електроверстат: рецепти за енергію з акумуляторів мережі машини.
 * kind — 'furnace' | 'e_bench', id — яка саме (у кожної своя мережа). Відкрили — оновлюємо стан: сервер дозаряджає акумулятори.
 */
export function MachineSheet({ kind, id, onClose }) {
  const { state, catalog, items, act, toast } = useGame()
  const [busy, setBusy] = useState(false)
  const ui = MACHINE_UI[kind] ?? MACHINE_UI.furnace
  const recipes = ui.recipes(catalog) ?? []
  const net = id ? state.cables?.networks?.find((n) => n.devices.includes(id)) : null
  const stored = net?.stored ?? 0

  useEffect(() => {
    if (id) act('GET', '/state', undefined, { silent: true })
  }, [id, act])

  const smelt = async (r, count) => {
    if (busy) return
    setBusy(true)
    const res = await act('POST', ui.url(id), { recipe: r.id, count })
    setBusy(false)
    if (!res) return
    haptic('success')
    toast(`${r.emoji} ${formatAmounts(items, res.got)} · ⚡−${res.used} Вт·год`)
  }
  /** Скільки разів вистачить і матеріалів, і енергії (не більше 10 за раз). */
  const timesOf = (r) => Math.min(10, Math.floor(stored / r.energy + 1e-9), ...Object.entries(r.in).map(([k, n]) => Math.floor((state.inventory[k] ?? 0) / n)))

  const status = !net
    ? { tone: 'text-[#a3341f]', text: `🔌 ${ui.who} не під'єднано. У будові → ⚡ Електрика протягни кабель від акумулятора.` }
    : !net.capacity
      ? { tone: 'text-[#a3341f]', text: '🔋 У цій мережі немає акумулятора — енергії нізвідки взяти.' }
      : !net.max
        ? { tone: 'text-[#8a5a00]', text: `🔋 ${wh(stored)} / ${net.capacity} Вт·год · у мережі немає вітряка чи панелі, нова енергія не прийде.` }
        : { tone: 'text-[#2d6b18]', text: `🔋 ${wh(stored)} / ${net.capacity} Вт·год у мережі` }

  return (
    <Sheet open={!!id} onClose={onClose} title={ui.title}>
      <div className="flex flex-col gap-3">
        <p className={`rounded-sm bg-parch-dark/50 p-2 text-center text-sm font-bold ${status.tone}`}>{status.text}</p>
        <p className="text-center text-xs text-ink-soft">
          {ui.who} бере енергію з акумулятора своєї мережі. Вітряк дає від 0 до 40 Вт — як подме (у середньому ~20 Вт·год за годину);
          сонячна панель удень — до 60 Вт.
        </p>
        {recipes.map((r) => {
          const n = timesOf(r)
          const energyOk = stored + 1e-9 >= r.energy
          return (
            <div key={r.id} className="flex items-center gap-2 rounded-sm bg-parch-dark/50 p-2">
              <ItemIcon item={itemOf(items, Object.keys(r.out)[0])} size={32} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">{r.name}</p>
                <p className="flex flex-wrap items-center gap-1 text-xs text-ink-soft">
                  {Object.entries(r.in).map(([k, c]) => (
                    <Chip key={k} ok={(state.inventory[k] ?? 0) >= c}>
                      <ItemIcon item={itemOf(items, k)} size={14} />
                      {Math.min(state.inventory[k] ?? 0, c)}/{c}
                    </Chip>
                  ))}
                  <Chip ok={energyOk}>⚡{r.energy} Вт·год</Chip>
                </p>
              </div>
              <PxButton size="sm" variant="green" disabled={n < 1 || busy} onClick={() => smelt(r, 1)}>
                ×1
              </PxButton>
              <PxButton size="sm" variant="yellow" disabled={n < 2 || busy} onClick={() => smelt(r, n)}>
                ×{Math.max(2, n)}
              </PxButton>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

const wh = (v) => (Math.floor((v ?? 0) * 10) / 10).toString().replace('.', ',')

/**
 * Три місця майстерні: звичайний верстат (без енергії, server/src/game/craft.js) і дві електромашини
 * (server/src/game/furnace.js → MACHINES). batch — скільки разів за один запит дозволяє сервер.
 */
const STATIONS = [
  { id: 'workbench', tab: '🪚 Верстат', name: 'Верстат', emoji: '🪚', batch: 20 },
  {
    id: 'e_bench',
    tab: '⚙️ Електро',
    name: 'Електроверстат',
    emoji: '⚙️',
    batch: 10,
    recipes: (c) => c.eBench?.recipes,
    url: (id) => `/home/e-bench/${id}/craft`,
  },
  {
    id: 'furnace',
    tab: '🔥 Піч',
    name: 'Електропіч',
    emoji: '🔥',
    batch: 10,
    recipes: (c) => c.furnace?.recipes,
    url: (id) => `/home/furnace/${id}/smelt`,
  },
]
const NOT_STOCK = new Set(['fish', 'crop', 'seed'])

/**
 * Майстерня: усі рецепти верстата, електроверстата й печі на трьох вкладках, а згори — усе, що є в рюкзаку
 * (крім риби й городини). Рецепти видно завжди; якщо машини ще не поставили — кнопки неактивні й підказка, як її поставити.
 * station — з якої вкладки почати, deviceId — машина, біля якої відкрили (у кожної печі своя мережа й свій заряд).
 */
export function WorkshopSheet({ open, station, deviceId, onClose }) {
  const { state, catalog, items, act, toast } = useGame()
  const [tab, setTab] = useState(station ?? 'workbench')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setTab(station ?? 'workbench')
  }, [open, station])
  // Відкрили — оновлюємо стан: сервер дозаряджає акумулятори, і заряд у мережах стає свіжим.
  useEffect(() => {
    if (open) act('GET', '/state', undefined, { silent: true })
  }, [open, act])

  const st = STATIONS.find((s) => s.id === tab) ?? STATIONS[0]
  const deco = state.deco ?? []
  const networks = state.cables?.networks ?? []
  const netOf = (id) => networks.find((n) => n.devices.includes(id))
  const stored = (id) => netOf(id)?.stored ?? 0
  // Машина цієї вкладки: та, біля якої стоїмо, інакше — з найбільшим зарядом у мережі.
  const machines = st.url ? deco.filter((d) => d.k === st.id) : []
  const machine = machines.find((d) => d.id === deviceId) ?? [...machines].sort((a, b) => stored(b.id) - stored(a.id))[0] ?? null
  const hasBench = deco.some((d) => d.k === 'workbench')
  const placed = st.url ? !!machine : hasBench
  const net = machine ? netOf(machine.id) : null
  const energy = net?.stored ?? 0

  const tools = st.url ? [] : (catalog.craft?.tools ?? [])
  const recipes = (st.url ? st.recipes(catalog) : catalog.craft?.recipes) ?? []
  /** Що з рюкзака йде в рецепти цієї вкладки — ці ресурси підсвічуємо. */
  const used = new Set([
    ...recipes.flatMap((r) => Object.keys(r.in)),
    ...tools.flatMap((t) => t.levels.flatMap((l) => Object.keys(l.cost))),
  ])

  const run = async (r, count) => {
    if (busy) return
    setBusy(true)
    const res = st.url
      ? await act('POST', st.url(machine.id), { recipe: r.id, count })
      : await act('POST', '/craft/recipe', { recipe: r.id, count })
    setBusy(false)
    if (!res) return
    haptic('success')
    toast(`${r.emoji} ${formatAmounts(items, res.got)}${res.used ? ` · ⚡−${res.used} Вт·год` : ''}`, 'good')
  }
  const craftTool = async (t) => {
    if (busy) return
    setBusy(true)
    const res = await act('POST', '/craft/tool', { tool: t.id })
    setBusy(false)
    if (!res) return
    haptic('success')
    toast(`${t.emoji} Готово: ${res.name}!`, 'good')
  }
  /** Скільки разів вистачить матеріалів (і енергії для машин), не більше, ніж сервер дає за раз. */
  const timesOf = (r) =>
    Math.min(
      st.batch,
      st.url ? Math.floor(energy / r.energy + 1e-9) : Infinity,
      ...Object.entries(r.in).map(([id, n]) => Math.floor((state.inventory[id] ?? 0) / n))
    )

  const status = !placed
    ? { tone: 'text-[#a3341f]', text: `${st.emoji} ${st.name}: ще не поставлено. Постав через 🔨 «Будувати» — і рецепти оживуть.` }
    : !st.url
      ? { tone: 'text-[#2d6b18]', text: '🪚 Верстат стоїть — майструй без енергії.' }
      : !net
        ? { tone: 'text-[#a3341f]', text: `🔌 ${st.name} не під'єднано. У будові → ⚡ Електрика протягни кабель від акумулятора.` }
        : !net.capacity
          ? { tone: 'text-[#a3341f]', text: '🔋 У цій мережі немає акумулятора — енергії нізвідки взяти.' }
          : !net.max
            ? { tone: 'text-[#8a5a00]', text: `🔋 ${wh(energy)} / ${net.capacity} Вт·год · немає вітряка чи панелі, нова енергія не прийде.` }
            : { tone: 'text-[#2d6b18]', text: `🔋 ${wh(energy)} / ${net.capacity} Вт·год у мережі` }

  return (
    <Sheet open={open} onClose={onClose} title="🛠 Майстерня">
      <div className="flex flex-col gap-3">
        <Stock used={used} />
        <Segmented value={tab} onChange={setTab} options={STATIONS.map((s) => ({ value: s.id, label: s.tab }))} />
        <p className={`rounded-sm bg-parch-dark/50 p-2 text-center text-sm font-bold ${status.tone}`}>
          {status.text}
          {machines.length > 1 && <span className="block text-[11px] font-normal text-ink-soft">Таких машин {machines.length} — береться та, де найбільше заряду.</span>}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="flex flex-col gap-2"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {tools.length > 0 && <p className="font-pixel text-[9px] text-ink-soft">ІНСТРУМЕНТИ</p>}
            {tools.map((t) => {
              const lvl = state.tools?.[t.id] ?? 0
              const cur = t.levels[lvl - 1]
              const next = t.levels[lvl]
              const ok = placed && next && canAfford(next.cost, state.balance, state.inventory)
              return (
                <div key={t.id} className="flex items-center gap-2 rounded-sm bg-parch-dark/50 p-2">
                  {toolArt(t.id, lvl) ? (
                    <img src={toolArt(t.id, lvl)} alt="" className={`pixelated h-9 w-9 shrink-0 ${lvl ? '' : 'opacity-40 grayscale'}`} />
                  ) : (
                    <span className={`text-3xl ${lvl ? '' : 'opacity-40 grayscale'}`}>{t.emoji}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold">{cur ? cur.name : (t.none ?? 'Немає')}</p>
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
                </div>
              )
            })}

            {recipes.length > 0 && <p className="font-pixel text-[9px] text-ink-soft">РЕЦЕПТИ</p>}
            {recipes.map((r) => {
              const n = placed ? timesOf(r) : 0
              return (
                <div key={r.id} className={`flex items-center gap-2 rounded-sm bg-parch-dark/50 p-2 ${placed ? '' : 'opacity-70'}`}>
                  <ItemIcon item={itemOf(items, Object.keys(r.out)[0])} size={32} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold">
                      {r.name}
                      {Object.values(r.out)[0] > 1 && <span className="font-normal text-ink-soft"> ×{Object.values(r.out)[0]}</span>}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {Object.entries(r.in).map(([id, c]) => (
                        <Chip key={id} ok={(state.inventory[id] ?? 0) >= c}>
                          <ItemIcon item={itemOf(items, id)} size={14} />
                          {Math.min(state.inventory[id] ?? 0, c)}/{c}
                        </Chip>
                      ))}
                      {r.energy != null && <Chip ok={energy + 1e-9 >= r.energy}>⚡{r.energy}</Chip>}
                    </div>
                  </div>
                  <PxButton size="sm" variant="green" disabled={n < 1 || busy} onClick={() => run(r, 1)}>
                    ×1
                  </PxButton>
                  <PxButton size="sm" variant="yellow" disabled={n < 2 || busy} onClick={() => run(r, n)}>
                    ×{Math.max(2, n)}
                  </PxButton>
                </div>
              )
            })}
            {st.url && (
              <p className="text-center text-xs text-ink-soft">
                Енергія — з акумулятора мережі машини. Вітряк дає 0–40 Вт (у середньому ~20 Вт·год за годину), сонячна панель удень — до 60 Вт.
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  )
}

/** Усе, що є в рюкзаку (без риби й городини): потрібне на цій вкладці — яскраве, решта — приглушена. Тап — назва. */
function Stock({ used }) {
  const { state, catalog, items } = useGame()
  const [picked, setPicked] = useState(null)
  const order = [...catalog.resources, ...catalog.relics].map((x) => x.id)
  const rank = (id) => {
    const i = order.indexOf(id)
    return i < 0 ? order.length : i
  }
  const stock = Object.entries(state.inventory)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ item: itemOf(items, id), n }))
    .filter((x) => !NOT_STOCK.has(x.item.kind))
    .sort((a, b) => Number(used.has(b.item.id)) - Number(used.has(a.item.id)) || rank(a.item.id) - rank(b.item.id))
  const shown = picked && stock.find((x) => x.item.id === picked)

  return (
    <div className="rounded-sm bg-parch-dark/50 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="font-pixel text-[9px] text-ink-soft">ТВОЇ РЕСУРСИ</p>
        <p className="truncate text-xs font-bold">
          {shown ? `${shown.item.name} · ${shown.n}` : <span className="text-ink-soft">✨ {state.balance}</span>}
        </p>
      </div>
      {stock.length ? (
        <div className="grid max-h-[136px] grid-cols-7 gap-1 overflow-y-auto">
          {stock.map(({ item, n }) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                haptic('select')
                setPicked((p) => (p === item.id ? null : item.id))
              }}
              className={`px-slot relative flex aspect-square items-center justify-center transition ${used.has(item.id) ? '' : 'opacity-45'} ${picked === item.id ? 'ring-2 ring-[#2d6b18]' : ''}`}
            >
              <ItemIcon item={item} size={26} />
              <span className="absolute right-0.5 bottom-0 font-pixel text-[8px] text-ink drop-shadow-[0_1px_0_#fff8]">{n}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-ink-soft">Рюкзак порожній — збирай кущі, камінчики й корчі на острові.</p>
      )}
    </div>
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
