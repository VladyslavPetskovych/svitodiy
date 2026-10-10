import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { canAfford, formatAmounts, homeStorage, itemOf } from '../data.js'
import { useGame, useNow } from '../context.js'
import { haptic, useBackButton } from '../tg.js'
import { ItemIcon, PxButton, ScreenTitle, Segmented } from '../ui.jsx'
import atlas from '../walk/atlas.json'
import { DECO_GEOM, snapDeco } from '../walk/decor.js'
import { createWalk, loadAssets } from '../walk/engine.js'
import { homeInteract } from '../walk/home.js'
import { INTERACT } from '../walk/layout.js'
import { BuildingSheet, DailySheet } from './Home.jsx'

const BUILDINGS = new Set(['house', 'garden', 'workshop', 'lighthouse', 'pier'])
const NO_DECO = []
const ICONS = { chest: '🎁', fishing: '🎣', boat: '⛵', exit: '🚪', bed: '🛏️', stove: '🔥', shelf: '📚' }
/** Що написати на кнопці дії. */
const ACTION = { fishing: 'Рибалити', boat: 'Плисти', house: 'Увійти', exit: 'Вийти', bed: 'Подрімати', stove: 'Готувати', shelf: 'Читати' }
const CATS = [
  { value: 'plants', label: '🌿 Рослини' },
  { value: 'stone', label: '🪨 Камінь' },
  { value: 'wood', label: '🪵 Дерево' },
  { value: 'light', label: '💡 Світло' },
]

/** Рідний острів зсередини: ходиш мандрівником, підходиш до будівель — або будуєш у пісочниці. */
export default function IslandWalk() {
  const { state, catalog, items, act, toast, switchTab } = useGame()
  const canvas = useRef(null)
  const engine = useRef(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [near, setNear] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [daily, setDaily] = useState(false)
  // Пісочниця.
  const [build, setBuild] = useState(false)
  const [cat, setCat] = useState('plants')
  const [pick, setPick] = useState(null) // id декору, який ставимо
  const [ghost, setGhost] = useState(null) // { kind, x, y, uid?, ok, reason? }
  const [sel, setSel] = useState(null) // id виділеної прикраси
  const [busy, setBusy] = useState(false)
  const [scene, setScene] = useState('island') // 'island' | 'home'
  const now = useNow()
  const { home } = state
  const deco = state.deco ?? NO_DECO
  const name = state.user.firstName || 'Мандрівника'

  const collecting = useRef(false)
  const collect = async () => {
    if (collecting.current) return
    collecting.current = true
    const res = await act('POST', '/home/collect')
    collecting.current = false
    if (!res) return
    haptic('success')
    toast(`Зібрано: ${formatAmounts(items, res.got)}`)
  }
  const goScene = (id) => {
    haptic('medium')
    engine.current?.setScene(id)
    setScene(id)
  }
  const interact = (id) => {
    haptic('light')
    if (id === 'house') goScene('home')
    else if (id === 'exit') goScene('island')
    else if (BUILDINGS.has(id)) setSheet(id)
    else if (id === 'chest') setDaily(true)
    else if (id === 'fishing') switchTab('fishing')
    else if (id === 'boat') switchTab('map')
    else if (id === 'bed') toast('😴 Подрімав під вишитою ковдрою — сил додалось!')
    else if (id === 'stove') switchTab('backpack') // готують рибу в рюкзаку
    else if (id === 'shelf') switchTab('journal')
  }

  /* ───── Пісочниця: дії ───── */

  const showGhost = (g) => setGhost(engine.current?.setGhost(g) ?? null)
  const select = (uid) => {
    setSel(uid)
    engine.current?.setSelected(uid)
  }
  const clearGhost = () => {
    showGhost(null)
    setPick(null)
  }

  const buildTap = ({ x, y, uid }) => {
    const kind = ghost?.kind ?? pick
    if (kind) {
      haptic('select')
      showGhost({ kind, ...snapDeco(kind, x, y), uid: ghost?.uid })
      return
    }
    if (uid) haptic('select')
    select(uid)
  }

  const choose = (d) => {
    if (!canAfford(d.cost, state.balance, state.inventory)) {
      haptic('warning')
      toast(`Не вистачає: ${costText(items, d.cost, state.inventory)}`, 'error')
      return
    }
    select(null)
    showGhost(null)
    setPick(pick === d.id ? null : d.id)
  }

  const confirm = async () => {
    if (!ghost?.ok || busy) return
    setBusy(true)
    const res = ghost.uid
      ? await act('POST', `/home/deco/${ghost.uid}/move`, { x: ghost.x, y: ghost.y })
      : await act('POST', '/home/deco', { kind: ghost.kind, x: ghost.x, y: ghost.y })
    setBusy(false)
    if (!res) return
    haptic('success')
    showGhost(null)
    if (ghost.uid) select(res.item.id)
    // Новий предмет: лишаємо його вибраним — наступний тап поставить ще один.
    else if (!canAfford(defOf(catalog, ghost.kind).cost, res.state.balance, res.state.inventory)) setPick(null)
  }

  const startMove = () => {
    const d = deco.find((x) => x.id === sel)
    if (!d) return
    select(null)
    setPick(null)
    showGhost({ kind: d.k, x: d.x, y: d.y, uid: d.id })
  }

  const remove = async () => {
    if (!sel || busy) return
    setBusy(true)
    const res = await act('DELETE', `/home/deco/${sel}`)
    setBusy(false)
    if (!res) return
    haptic('success')
    select(null)
    toast(Object.keys(res.refund).length ? `Прибрано. Повернуто: ${formatAmounts(items, res.refund)}` : 'Прибрано')
  }

  const enterBuild = () => {
    haptic('medium')
    setBuild(true)
    engine.current?.setMode('build')
  }
  const exitBuild = () => {
    setBuild(false)
    setPick(null)
    setGhost(null)
    setSel(null)
    engine.current?.setMode('walk')
  }
  // «Назад» у Telegram у хаті — вийти надвір.
  useBackButton(scene === 'home', () => goScene('island'))
  // «Назад» у Telegram: спершу скасовує вибір, потім виходить із будівництва.
  useBackButton(build, () => {
    if (!ghost && !pick && !sel) return exitBuild()
    clearGhost()
    select(null)
  })

  // Обробники рушія читають свіжі значення через ref — рушій створюється один раз.
  const handlers = useRef({})
  useEffect(() => {
    handlers.current = { interact, collect, buildTap }
  })

  useEffect(() => {
    let alive = true
    let walk = null
    loadAssets().then(
      (assets) => {
        if (!alive || !canvas.current) return
        walk = createWalk(canvas.current, assets, {
          onNear: (id) => {
            if (id) haptic('select')
            setNear(id)
          },
          onInteract: (id) => handlers.current.interact(id),
          onBubble: () => handlers.current.collect(),
          onBuildTap: (p) => handlers.current.buildTap(p),
        })
        engine.current = walk
        setReady(true)
      },
      (e) => alive && setError(e.message)
    )
    return () => {
      alive = false
      walk?.destroy()
      engine.current = null
    }
  }, [])

  // Рівні будівель, скриня й декор → що стоїть на острові.
  const chestOpen = state.daily.claimedToday
  useEffect(() => {
    engine.current?.setWorld(home.levels, chestOpen, deco)
  }, [ready, home.levels, chestOpen, deco])

  // Бульбашки врожаю над будівлями, де вже є що забрати.
  const storage = homeStorage(catalog, home, now)
  const bubbleKey = JSON.stringify(
    Object.fromEntries(
      Object.entries(storage.perBuilding).flatMap(([id, got]) => {
        const top = Object.entries(got).sort((a, b) => b[1] - a[1])[0]
        return top && top[1] >= 1 ? [[id, top[0] === 'balance' ? '✨' : itemOf(items, top[0]).emoji]] : []
      })
    )
  )
  useEffect(() => {
    engine.current?.setBubbles(build ? {} : JSON.parse(bubbleKey))
  }, [ready, bubbleKey, build])

  const indoors = scene === 'home'
  const spot = (indoors ? homeInteract(Math.max(1, home.levels.house)) : INTERACT).find((i) => i.id === near)
  const building = catalog.buildings.find((b) => b.id === sheet)

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle
        title={build ? '🔨 Будуємо острів' : indoors ? '🏠 Хатинка' : `🏝️ ${home.shared ? 'Спільний острів' : `Острів ${name}`}`}
        subtitle={
          build
            ? 'Тягни пальцем, щоб роззирнутися. Обери предмет і торкнись місця.'
            : indoors
              ? 'Тепло біля печі. Двері внизу ведуть надвір.'
              : 'Торкнись землі — підеш туди. Тапни хатинку, щоб зайти всередину.'
        }
      />

      <div
        className={`relative overflow-hidden rounded-sm border-4 bg-[#3b7fd0] shadow-[0_6px_0_#0006] transition-colors ${
          build ? 'border-gold' : 'border-wood-dark'
        }`}
      >
        <canvas ref={canvas} className="block aspect-[5/6] w-full touch-none" />
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0f2a3d]/60 text-center">
            <motion.span
              className="text-4xl"
              animate={error ? {} : { y: [0, -6, 0] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              {error ? '🌫️' : '⛵'}
            </motion.span>
            <p className="px-6 text-sm text-cream">{error ?? 'Пристаємо до берега…'}</p>
          </div>
        )}
        <p className="pointer-events-none absolute top-2 left-2 rounded-sm bg-black/35 px-2 py-1 font-pixel text-[9px] text-cream drop-shadow">
          {build ? `ДЕКОР ${deco.length}/${catalog.decorMax ?? 150}` : indoors ? 'ХАТИНКА' : home.shared ? 'СПІЛЬНИЙ ОСТРІВ' : `ОСТРІВ ${name.toUpperCase()}`}
        </p>
      </div>

      {build ? (
        <BuildPanel
          cat={cat}
          setCat={setCat}
          pick={pick}
          ghost={ghost}
          sel={sel}
          busy={busy}
          onChoose={choose}
          onConfirm={confirm}
          onCancel={() => {
            clearGhost()
            select(null)
          }}
          onMove={startMove}
          onRemove={remove}
          onDone={exitBuild}
        />
      ) : (
        <>
          <div className="px-wood flex min-h-14 items-center gap-2 px-2 py-1.5 text-cream">
            <AnimatePresence mode="wait" initial={false}>
              {spot ? (
                <motion.div
                  key={spot.id}
                  className="flex flex-1 items-center gap-2"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  <span className="text-2xl">{spotIcon(catalog, spot.id)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold">{spot.label}</p>
                    <p className="truncate text-[11px] text-cream/75">{spotHint(catalog, home.levels, chestOpen, spot.id)}</p>
                  </div>
                  <PxButton size="sm" variant="green" onClick={() => interact(spot.id)}>
                    {ACTION[spot.id] ?? 'Відкрити'}
                  </PxButton>
                  {spot.id === 'house' && (
                    <PxButton size="sm" variant="paper" onClick={() => setSheet('house')} aria-label="Покращити хатинку">
                      🔨
                    </PxButton>
                  )}
                </motion.div>
              ) : (
                <motion.p
                  key="hint"
                  className="flex-1 text-center text-[12px] text-cream/80"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {indoors ? 'Тапни підлогу, щоб пройтись, або ліжко, піч чи полицю.' : 'Тапни будівлю — мандрівник сам до неї дійде. На ПК — стрілки/WASD і E.'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          {indoors ? (
            <PxButton variant="blue" size="lg" className="w-full" onClick={() => goScene('island')}>
              🚪 Вийти надвір
            </PxButton>
          ) : (
            <PxButton variant="yellow" size="lg" className="w-full" disabled={!ready} onClick={enterBuild}>
              🔨 Будувати на острові
            </PxButton>
          )}
        </>
      )}

      <BuildingSheet building={building} onClose={() => setSheet(null)} />
      <DailySheet open={daily} onClose={() => setDaily(false)} />
    </div>
  )
}

/* ───────── Панель пісочниці ───────── */

function BuildPanel({ cat, setCat, pick, ghost, sel, busy, onChoose, onConfirm, onCancel, onMove, onRemove, onDone }) {
  const { catalog, state, items } = useGame()
  const decor = catalog.decor ?? []
  const selItem = sel && (state.deco ?? []).find((d) => d.id === sel)
  const active = ghost ? defOf(catalog, ghost.kind) : pick ? defOf(catalog, pick) : null

  let context
  if (ghost && active) {
    context = (
      <>
        <DecoIcon kind={active.id} box={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{active.name}</p>
          <p className={`truncate text-[11px] ${ghost.ok ? 'text-[#b6f29a]' : 'text-[#ffb3a6]'}`}>
            {ghost.ok ? (ghost.uid ? 'Нове місце підходить' : `Ціна: ${costText(items, active.cost)}`) : ghost.reason}
          </p>
        </div>
        <PxButton size="sm" variant="green" disabled={!ghost.ok || busy} onClick={onConfirm}>
          {ghost.uid ? 'Сюди' : 'Поставити'}
        </PxButton>
        <PxButton size="sm" variant="paper" onClick={onCancel} aria-label="Скасувати">
          ✕
        </PxButton>
      </>
    )
  } else if (active) {
    context = (
      <>
        <DecoIcon kind={active.id} box={34} />
        <p className="min-w-0 flex-1 text-[12px] text-cream/85">Торкнись місця на острові, де поставити «{active.name}».</p>
        <PxButton size="sm" variant="paper" onClick={onCancel} aria-label="Скасувати">
          ✕
        </PxButton>
      </>
    )
  } else if (selItem) {
    const d = defOf(catalog, selItem.k)
    context = (
      <>
        <DecoIcon kind={selItem.k} box={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{d?.name}</p>
          <p className="truncate text-[11px] text-cream/75">
            {Object.keys(d?.cost ?? {}).length ? `Прибереш — повернеться: ${costText(items, d.cost)}` : 'Безкоштовна прикраса'}
          </p>
        </div>
        <PxButton size="sm" variant="blue" disabled={busy} onClick={onMove}>
          ↔
        </PxButton>
        <PxButton size="sm" variant="red" disabled={busy} onClick={onRemove} aria-label="Прибрати">
          🗑
        </PxButton>
      </>
    )
  } else {
    context = <p className="flex-1 text-center text-[12px] text-cream/80">Обери предмет нижче або торкнись своєї прикраси, щоб пересунути чи прибрати.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="px-wood flex min-h-14 items-center gap-2 px-2 py-1.5 text-cream">{context}</div>

      <Segmented options={CATS} value={cat} onChange={setCat} />

      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
        {decor
          .filter((d) => d.cat === cat)
          .map((d) => {
            const affordable = canAfford(d.cost, state.balance, state.inventory)
            const chosen = (ghost?.kind ?? pick) === d.id && !ghost?.uid
            return (
              <motion.button
                key={d.id}
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => onChoose(d)}
                className={`px-slot relative flex w-[84px] shrink-0 flex-col items-center gap-1 py-1.5 ${affordable ? '' : 'opacity-55'}`}
                style={chosen ? { boxShadow: '0 0 0 2px #ffcf3f, 0 0 10px #ffcf3f' } : undefined}
              >
                <span className="flex h-11 items-end justify-center">
                  <DecoIcon kind={d.id} box={42} />
                </span>
                <span className="w-full truncate px-1 text-center text-[10px] leading-tight font-extrabold text-ink">{d.name}</span>
                <span className="flex min-h-[14px] flex-wrap justify-center gap-x-1 px-0.5 text-[9px] leading-tight text-ink-soft">
                  {Object.keys(d.cost).length
                    ? Object.entries(d.cost).map(([id, n]) => (
                        <span key={id} className={`inline-flex items-center ${(state.inventory[id] ?? 0) >= n ? '' : 'text-[#9a2f1d]'}`}>
                          <ItemIcon item={itemOf(items, id)} size={13} />
                          {n}
                        </span>
                      ))
                    : 'безкоштовно'}
                </span>
              </motion.button>
            )
          })}
      </div>

      <PxButton variant="green" size="lg" className="w-full" onClick={onDone}>
        ✓ Готово
      </PxButton>
    </div>
  )
}

/** Спрайт декору з атласу, вписаний у квадрат box×box (пікселі лишаються чіткими). */
function DecoIcon({ kind, box }) {
  const f = atlas.frames[DECO_GEOM[kind]?.sprite]
  if (!f) return null
  const s = Math.min(box / f.w, box / f.h, 3)
  return (
    <span
      className="pixelated block shrink-0"
      style={{
        width: f.w * s,
        height: f.h * s,
        backgroundImage: 'url(/game/walk/sprites.png)',
        backgroundSize: `${atlas.size.w * s}px ${atlas.size.h * s}px`,
        backgroundPosition: `-${f.x * s}px -${f.y * s}px`,
      }}
    />
  )
}

const defOf = (catalog, kind) => (catalog.decor ?? []).find((d) => d.id === kind)

/** «2 дошки · 1 камінь» — назви, бо в гілочки, дошки й колоди однакове емодзі. */
function costText(items, cost, inventory) {
  const parts = Object.entries(cost)
    .filter(([id, n]) => !inventory || (inventory[id] ?? 0) < n)
    .map(([id, n]) => `${itemOf(items, id).name} ×${inventory ? n - (inventory[id] ?? 0) : n}`)
  return parts.length ? parts.join(' · ') : 'безкоштовно'
}

function spotIcon(catalog, id) {
  return catalog.buildings.find((b) => b.id === id)?.emoji ?? ICONS[id] ?? '❔'
}

function spotHint(catalog, levels, chestOpen, id) {
  if (id === 'exit') return 'Повернутися на острів'
  if (id === 'bed') return 'Перина й вишита ковдра'
  if (id === 'stove') return 'Готують рибу — у рюкзаку'
  if (id === 'shelf') return 'Щоденник: Думосвіт, Літописець, Арки'
  if (id === 'chest') return chestOpen ? 'Сьогодні вже відкрито — повертайся завтра' : 'Щоденна нагорода чекає!'
  if (id === 'fishing') return 'Закинути вудку з краю причалу'
  if (id === 'boat') return 'Попливти до інших островів'
  const b = catalog.buildings.find((x) => x.id === id)
  const lvl = levels[id] ?? 0
  if (!lvl) return 'Порожня ділянка — можна збудувати'
  return lvl >= b.levels.length - 1 ? `Рівень ${lvl} · найвищий` : `Рівень ${lvl} · можна покращити`
}
