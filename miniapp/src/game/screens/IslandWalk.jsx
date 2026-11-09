import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { canAfford, formatAmounts, homeStorage, itemOf } from '../data.js'
import { useGame, useNow } from '../context.js'
import { fieldView, ownedSeeds, plotSpot, plotView } from '../farm.js'
import { haptic, useBackButton } from '../tg.js'
import { ItemIcon, PxButton, ScreenTitle, Segmented } from '../ui.jsx'
import atlas from '../walk/atlas.json'
import homeAtlas from '../walk/home-atlas.json'
import decorAtlas from '../walk/home-decor.json'
import artVersion from '../walk/version.json'
import { DECO_GEOM } from '../walk/decor.js'
import { INTERIOR_GEOM } from '../walk/interior.js'
import { DOGS, dogById } from '../walk/companion.js'
import { homeInteract } from '../walk/home.js'
import { INTERACT } from '../walk/layout.js'
import { BuildingSheet, DailySheet } from './Home.jsx'
import { DogSheet, FarmSheet, Hearts, SeedBar } from './islandFarm.jsx'

const BUILDINGS = new Set(['house', 'garden', 'workshop', 'lighthouse', 'pier'])
const NO_DECO = []
const DOG_IDS = DOGS.map((d) => d.id)
const ICONS = { chest: '🎁', fishing: '🎣', boat: '⛵', exit: '🚪', bed: '🛏️', stove: '🔥', shelf: '📚', farmshop: '🌱' }
/** Що написати на кнопці дії. */
const ACTION = { fishing: 'Рибалити', boat: 'Плисти', house: 'Увійти', exit: 'Вийти', bed: 'Подрімати', stove: 'Готувати', shelf: 'Читати' }
/** Пси-компаньйони — не будівлі, тож їхні «точки» для панелі дії мають id «dog:<ім'я>». */
const dogOf = (id) => (id?.startsWith('dog:') ? dogById(id.slice(4)) : null)
/** Грядки на полі — «plot:<№>». */
const plotOf = (id) => (id?.startsWith('plot:') ? Number(id.slice(5)) : null)
const FEED_TEXT = [(n) => `😋 ${n} уминає за обидві щоки!`, (n) => `😋 Хрум-хрум! ${n} задоволений.`]
const DOG_PETS = [
  (n) => `🐶 ${n} радісно махає хвостом!`,
  (n) => `🐶 ${n} підставляє вушко — ще, ще!`,
  (n) => `🐶 Гав! ${n} задоволений.`,
  (n) => `🐶 ${n} лизнув тобі руку.`,
]
const CATS = [
  { value: 'plants', label: '🌿 Рослини' },
  { value: 'stone', label: '🪨 Камінь' },
  { value: 'wood', label: '🪵 Дерево' },
  { value: 'light', label: '💡 Світло' },
]
/** Пісочниця в хатинці. */
const CATS_HOME = [
  { value: 'furniture', label: '🪑 Меблі' },
  { value: 'kitchen', label: '🍲 Кухня' },
  { value: 'textile', label: '🧶 Килими' },
  { value: 'wall', label: '🖼 Стіни' },
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
  const indoors = scene === 'home'
  // Город і пси.
  const [farmTab, setFarmTab] = useState(null) // шторка комори: 'seeds' | 'sell' | 'guide' | null
  const [seed, setSeed] = useState(null) // яке насіння садити наступним тапом
  const [dogSheet, setDogSheet] = useState(null) // id пса, чия шторка відкрита
  const working = useRef(new Set()) // грядки, на яких дія ще в дорозі до сервера
  const clearArmed = useRef(null) // «викопати» — другий тап підтверджує
  const now = useNow()
  const { home } = state
  const deco = state.deco ?? NO_DECO
  const interior = state.interior ?? NO_DECO
  const houseLevel = Math.max(1, home.levels.house ?? 1)
  /** Пісочниця: острів (декор) чи хатинка (меблі й речі на стінах). */
  const sandbox = indoors
    ? { base: '/home/interior', placed: interior, defs: catalog.interior ?? [] }
    : { base: '/home/deco', placed: deco, defs: catalog.decor ?? [] }
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
  /* ───── Город ───── */

  /** Що посадити: обране насіння, якщо воно ще є, інакше — перше, що є в рюкзаку. */
  const seedToPlant = () => {
    const owned = ownedSeeds(catalog, state.inventory)
    return owned.find((x) => x.crop.id === seed)?.crop ?? owned[0]?.crop ?? null
  }

  /** Розумна дія на грядці (як у Stardew — інструмент сам за станом): скопати, посадити, полити, зібрати. */
  const farmAction = async (i) => {
    if (working.current.has(i)) return
    const v = plotView(catalog, state.farm, i, now)
    if (v.action === 'locked') {
      haptic('warning')
      toast(`🌿 ${plotSpot(catalog, state.farm, v, now).hint}`, 'error')
      return
    }
    if (v.action === 'wait') {
      toast(`💧 ${plotSpot(catalog, state.farm, v, now).hint}`)
      return
    }
    let body
    const kind = v.action
    if (kind === 'plant') {
      const crop = seedToPlant()
      if (!crop) {
        haptic('warning')
        toast('Немає насіння — купи в коморі городника 🌱', 'error')
        setFarmTab('seeds')
        return
      }
      body = { crop: crop.id }
    }
    working.current.add(i)
    engine.current?.farmFx(i, kind)
    const res = await act('POST', `/farm/${i}/${kind}`, body)
    working.current.delete(i)
    if (!res) return
    haptic(kind === 'harvest' ? 'success' : 'light')
    if (res.got) toast(`🧺 Зібрано: ${formatAmounts(items, res.got)}`)
  }

  /** Викопати рослину (подвійний тап — щоб не зробити це випадково). */
  const clearPlot = async (i) => {
    if (clearArmed.current?.i !== i || Date.now() - clearArmed.current.at > 2500) {
      clearArmed.current = { i, at: Date.now() }
      haptic('warning')
      toast('Тапни 🗑 ще раз — рослину буде викопано')
      return
    }
    clearArmed.current = null
    engine.current?.farmFx(i, 'clear')
    if (await act('POST', `/farm/${i}/clear`)) haptic('success')
  }

  /* ───── Пси ───── */

  const petDog = (dog) => {
    engine.current?.petDog(dog.id)
    haptic('success')
    toast(DOG_PETS[Math.floor(Math.random() * DOG_PETS.length)](dog.name))
    // Дружба росте від першого погладжування за день.
    if (!state.dogs?.[dog.id]?.pettedToday) act('POST', `/dogs/${dog.id}/pet`, {}, { silent: true })
  }

  const commandDog = async (id, mode) => {
    const dog = dogById(id)
    const cmd = engine.current?.commandDog(id, mode)
    if (!dog || !cmd) return
    haptic('medium')
    setDogSheet(null)
    const text = { follow: `🐾 ${dog.name} біжить до тебе!`, sit: `🪑 ${dog.name} сів і чекає тут.` }[mode] ??
      (scene === 'home' ? `🏠 ${dog.name} вмостився на лежанці.` : `🏠 ${dog.name} побіг до хатинки.`)
    toast(text)
    await act('POST', `/dogs/${id}/command`, cmd)
  }

  const feedDog = async (id, itemId) => {
    const dog = dogById(id)
    const res = await act('POST', `/dogs/${id}/feed`, { item: itemId })
    if (!res || !dog) return
    setDogSheet(null)
    engine.current?.feedDog(id)
    haptic('success')
    toast(`${FEED_TEXT[Math.floor(Math.random() * FEED_TEXT.length)](dog.name)}${res.favorite ? ' Улюблене! ⭐' : ''}`)
    if (res.gift) setTimeout(() => toast(`🐶 ${dog.name} щось відкопав і приніс: ${formatAmounts(items, res.gift)}`), 1900)
  }

  /** Свисток: усі пси, що сидять чи чекають удома, біжать до тебе. */
  const whistle = async () => {
    const away = DOG_IDS.filter((id) => (state.dogs?.[id]?.mode ?? 'follow') !== 'follow')
    if (!away.length) {
      toast('🐾 Пси й так поруч.')
      return
    }
    haptic('medium')
    toast('📯 Фіть-фіть! Пси біжать до тебе.')
    for (const id of away) {
      const cmd = engine.current?.commandDog(id, 'follow')
      if (cmd) await act('POST', `/dogs/${id}/command`, cmd, { silent: true })
    }
  }

  const interact = (id) => {
    haptic('light')
    const dog = dogOf(id)
    const plot = plotOf(id)
    if (dog) petDog(dog)
    else if (plot != null) farmAction(plot)
    else if (id === 'farmshop') setFarmTab('seeds')
    else if (id === 'house') goScene('home')
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

  const buildTap = (tap) => {
    const { uid } = tap
    const kind = ghost?.kind ?? pick
    if (kind) {
      const pos = engine.current?.snap(kind, tap)
      if (!pos) {
        haptic('warning')
        toast(INTERIOR_GEOM[kind]?.layer === 'wall' && indoors ? 'Цю річ вішають — торкнись стіни' : 'Торкнись підлоги, де поставити')
        return
      }
      haptic('select')
      showGhost({ kind, ...pos, uid: ghost?.uid })
      return
    }
    if (uid) haptic('select')
    select(uid)
  }

  const choose = (d) => {
    if (indoors && d.level > houseLevel) {
      haptic('warning')
      toast(`🔒 Відкриється, коли хатинка стане ${d.level}-го рівня`, 'error')
      return
    }
    if (!canAfford(d.cost, state.balance, state.inventory)) {
      haptic('warning')
      toast(`Не вистачає: ${costText(items, d.cost, { ...state.inventory, balance: state.balance })}`, 'error')
      return
    }
    select(null)
    showGhost(null)
    setPick(pick === d.id ? null : d.id)
  }

  const confirm = async () => {
    if (!ghost?.ok || busy) return
    setBusy(true)
    const pos = ghost.wall ? { wall: ghost.wall, at: ghost.at, h: ghost.h } : { x: ghost.x, y: ghost.y }
    const res = ghost.uid
      ? await act('POST', `${sandbox.base}/${ghost.uid}/move`, pos)
      : await act('POST', sandbox.base, { kind: ghost.kind, ...pos })
    setBusy(false)
    if (!res) return
    haptic('success')
    showGhost(null)
    if (ghost.uid) select(res.item.id)
    // Новий предмет: лишаємо його вибраним — наступний тап поставить ще один.
    else if (!canAfford(sandbox.defs.find((d) => d.id === ghost.kind).cost, res.state.balance, res.state.inventory)) setPick(null)
  }

  const startMove = () => {
    const d = sandbox.placed.find((x) => x.id === sel)
    if (!d) return
    select(null)
    setPick(null)
    showGhost(d.wall ? { kind: d.k, wall: d.wall, at: d.at, h: d.h, uid: d.id } : { kind: d.k, x: d.x, y: d.y, uid: d.id })
  }

  const remove = async () => {
    if (!sel || busy) return
    setBusy(true)
    const res = await act('DELETE', `${sandbox.base}/${sel}`)
    setBusy(false)
    if (!res) return
    haptic('success')
    select(null)
    toast(Object.keys(res.refund).length ? `Прибрано. Повернуто: ${formatAmounts(items, res.refund)}` : 'Прибрано')
  }

  const enterBuild = () => {
    haptic('medium')
    setCat(indoors ? 'furniture' : 'plants')
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
    // three.js вантажимо лише тут: решта гри не платить за 3D-рушій.
    import('../walk/engine.js').then(({ createWalk, loadAssets }) => loadAssets().then((assets) => ({ createWalk, assets }))).then(
      ({ createWalk, assets }) => {
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
        if (import.meta.env.DEV) window.__walk = walk // для ручних перевірок у консолі
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
    engine.current?.setWorld(home.levels, chestOpen, deco, interior)
  }, [ready, home.levels, chestOpen, deco, interior])

  // Поле: що де росте (оновлюється й саме — волога грядка дорослішає без запитів).
  const field = useMemo(() => fieldView(catalog, state.farm, now), [catalog, state.farm, now])
  useEffect(() => {
    if (ready) engine.current?.setFarm(field)
  }, [ready, field])

  // Команди псам, збережені на сервері (сидить там-то, чекає вдома).
  useEffect(() => {
    if (ready) engine.current?.syncDogs(state.dogs)
  }, [ready, state.dogs])

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

  const nearDog = dogOf(near)
  const nearPlot = indoors ? null : plotOf(near)
  const plotV = nearPlot != null ? field[nearPlot] : null
  const plotInfo = plotV ? plotSpot(catalog, state.farm, plotV, now) : null
  const spot = nearDog
    ? { id: near, label: `Песик ${nearDog.name}` }
    : plotV
      ? { id: near, label: plotInfo.label }
      : (indoors ? homeInteract(Math.max(1, home.levels.house)) : INTERACT).find((i) => i.id === near)
  const showSeeds = !build && !indoors && (plotV ? plotV.action === 'plant' || plotV.action === 'till' : near === 'farmshop')
  const dogInfo = nearDog ? state.dogs?.[nearDog.id] : null
  const building = catalog.buildings.find((b) => b.id === sheet)

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle
        title={build ? (indoors ? '🔨 Облаштовуємо хату' : '🔨 Будуємо острів') : indoors ? '🏠 Хатинка' : `🏝️ ${home.shared ? 'Спільний острів' : `Острів ${name}`}`}
        subtitle={
          build
            ? indoors
              ? 'Обери річ і торкнись підлоги чи стіни, перетягни привид, куди треба. Поверни камеру ⟲, щоб дістати іншу стіну.'
              : 'Тягни пальцем, щоб роззирнутися. Обери предмет, торкнись місця — і перетягни привид, куди треба.'
            : indoors
              ? 'Тепло біля печі. Двері внизу ведуть надвір.'
              : 'Торкнись землі — підеш туди. Двома пальцями — поворот і наближення.'
        }
      />

      <div
        className={`relative overflow-hidden rounded-sm border-4 bg-[#3b7fd0] shadow-[0_6px_0_#0006] transition-colors ${
          build ? 'border-gold' : 'border-wood-dark'
        }`}
      >
        <canvas ref={canvas} className="block aspect-[5/6] w-full touch-none" />
        {ready && <CameraControls engine={engine} onWhistle={whistle} />}
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
          {build
            ? indoors
              ? `РЕЧІ ${interior.length}/${catalog.interiorMax ?? 100}`
              : `ДЕКОР ${deco.length}/${catalog.decorMax ?? 150}`
            : indoors ? 'ХАТИНКА' : home.shared ? 'СПІЛЬНИЙ ОСТРІВ' : `ОСТРІВ ${name.toUpperCase()}`}
        </p>
      </div>

      {build ? (
        <BuildPanel
          indoor={indoors}
          houseLevel={houseLevel}
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
                  {plotV ? (
                    <PlotIcon v={plotV} items={items} />
                  ) : (
                    <span className="text-2xl">{nearDog ? '🐶' : spotIcon(catalog, spot.id)}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold">{spot.label}</p>
                    {dogInfo ? (
                      <Hearts hearts={dogInfo.hearts} love={dogInfo.love} size={10} />
                    ) : (
                      <p className="truncate text-[11px] text-cream/75">{plotInfo ? plotInfo.hint : spotHint(catalog, home.levels, chestOpen, spot.id)}</p>
                    )}
                  </div>
                  {plotV ? (
                    <>
                      {plotV.crop && !plotV.ready && (
                        <PxButton size="sm" variant="paper" onClick={() => clearPlot(plotV.i)} aria-label="Викопати">
                          🗑
                        </PxButton>
                      )}
                      <PxButton
                        size="sm"
                        variant={plotV.action === 'harvest' ? 'yellow' : plotV.action === 'water' ? 'blue' : 'green'}
                        className={plotV.action === 'wait' || plotV.action === 'locked' ? 'opacity-60' : ''}
                        onClick={() => interact(spot.id)}
                      >
                        {plotV.action === 'plant' && seedToPlant() ? `🌱 ${seedToPlant().name}` : plotInfo.button}
                      </PxButton>
                    </>
                  ) : (
                    <PxButton size="sm" variant="green" onClick={() => interact(spot.id)}>
                      {nearDog ? 'Погладити' : (ACTION[spot.id] ?? 'Відкрити')}
                    </PxButton>
                  )}
                  {nearDog && (
                    <PxButton size="sm" variant="paper" onClick={() => setDogSheet(nearDog.id)} aria-label="Нагодувати й команди">
                      🦴
                    </PxButton>
                  )}
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
                  {indoors
                    ? 'Тапни підлогу, щоб пройтись, або ліжко, піч чи полицю.'
                    : 'Тапни будівлю чи грядку — мандрівник сам дійде. На ПК — WASD, E — дія, Q/R — поворот, коліщатко — зум.'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          {showSeeds && <SeedBar seed={seedToPlant()?.id ?? null} setSeed={setSeed} onShop={() => setFarmTab('seeds')} />}
          {indoors ? (
            <div className="grid grid-cols-2 gap-2">
              <PxButton variant="yellow" size="lg" disabled={!ready} onClick={enterBuild}>
                🔨 Облаштувати
              </PxButton>
              <PxButton variant="blue" size="lg" onClick={() => goScene('island')}>
                🚪 Надвір
              </PxButton>
            </div>
          ) : (
            <PxButton variant="yellow" size="lg" className="w-full" disabled={!ready} onClick={enterBuild}>
              🔨 Будувати на острові
            </PxButton>
          )}
        </>
      )}

      <BuildingSheet building={building} onClose={() => setSheet(null)} />
      <DailySheet open={daily} onClose={() => setDaily(false)} />
      <FarmSheet tab={farmTab} setTab={setFarmTab} onClose={() => setFarmTab(null)} />
      <DogSheet dog={dogSheet ? dogById(dogSheet) : null} onClose={() => setDogSheet(null)} onCommand={commandDog} onFeed={feedDog} />
    </div>
  )
}

/* ───────── Камера: поворот і зум для тих, хто не користується двома пальцями ───────── */

function CameraControls({ engine, onWhistle }) {
  const btn = (label, title, fn) => (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={() => {
        haptic('light')
        fn(engine.current)
      }}
      className="flex h-8 w-8 items-center justify-center rounded-sm bg-black/35 font-pixel text-[13px] text-cream drop-shadow active:bg-black/55"
    >
      {label}
    </button>
  )
  return (
    <div className="absolute top-2 right-2 flex gap-1">
      {btn('⟲', 'Повернути ліворуч', (e) => e?.rotate(-1))}
      {btn('⟳', 'Повернути праворуч', (e) => e?.rotate(1))}
      {btn('+', 'Наблизити', (e) => e?.zoom(0.8))}
      {btn('−', 'Віддалити', (e) => e?.zoom(1.25))}
      {btn('📯', 'Покликати псів', () => onWhistle())}
    </div>
  )
}

/* ───────── Панель пісочниці ───────── */

function BuildPanel({ indoor, houseLevel, cat, setCat, pick, ghost, sel, busy, onChoose, onConfirm, onCancel, onMove, onRemove, onDone }) {
  const { catalog, state, items } = useGame()
  const decor = (indoor ? catalog.interior : catalog.decor) ?? []
  const placed = (indoor ? state.interior : state.deco) ?? []
  const defOf = (kind) => decor.find((d) => d.id === kind)
  const selItem = sel && placed.find((d) => d.id === sel)
  const active = ghost ? defOf(ghost.kind) : pick ? defOf(pick) : null
  const where = (d) => (indoor ? (d.wall ? 'на стіні, де повісити' : 'на підлозі, де поставити') : 'на острові, де поставити')

  let context
  if (ghost && active) {
    context = (
      <>
        <DecoIcon kind={active.id} box={34} indoor={indoor} />
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
        <DecoIcon kind={active.id} box={34} indoor={indoor} />
        <p className="min-w-0 flex-1 text-[12px] text-cream/85">
          Торкнись місця {where(active)} «{active.name}».
        </p>
        <PxButton size="sm" variant="paper" onClick={onCancel} aria-label="Скасувати">
          ✕
        </PxButton>
      </>
    )
  } else if (selItem) {
    const d = defOf(selItem.k)
    const refund = selItem.free ? {} : (d?.cost ?? {})
    context = (
      <>
        <DecoIcon kind={selItem.k} box={34} indoor={indoor} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{d?.name}</p>
          <p className="truncate text-[11px] text-cream/75">
            {Object.keys(refund).length ? `Прибереш — повернеться: ${costText(items, refund)}` : selItem.free ? 'Була в хаті від початку' : 'Безкоштовна прикраса'}
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
    context = (
      <p className="flex-1 text-center text-[12px] text-cream/80">
        Обери {indoor ? 'річ' : 'предмет'} нижче або торкнись {indoor ? 'речі в хаті' : 'своєї прикраси'}, щоб пересунути чи прибрати.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="px-wood flex min-h-14 items-center gap-2 px-2 py-1.5 text-cream">{context}</div>

      <Segmented options={indoor ? CATS_HOME : CATS} value={cat} onChange={setCat} />

      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
        {decor
          .filter((d) => d.cat === cat)
          .map((d) => {
            const locked = indoor && d.level > houseLevel
            const affordable = !locked && canAfford(d.cost, state.balance, state.inventory)
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
                  <DecoIcon kind={d.id} box={42} indoor={indoor} />
                </span>
                {locked && <span className="absolute top-0.5 right-1 font-pixel text-[9px] text-ink">🔒{d.level}</span>}
                <span className="w-full truncate px-1 text-center text-[10px] leading-tight font-extrabold text-ink">{d.name}</span>
                <span className="flex min-h-[14px] flex-wrap justify-center gap-x-1 px-0.5 text-[9px] leading-tight text-ink-soft">
                  {Object.keys(d.cost).length
                    ? Object.entries(d.cost).map(([id, n]) => {
                        const have = id === 'balance' ? state.balance : (state.inventory[id] ?? 0)
                        return (
                          <span key={id} className={`inline-flex items-center ${have >= n ? '' : 'text-[#9a2f1d]'}`}>
                            {id === 'balance' ? '✨' : <ItemIcon item={itemOf(items, id)} size={13} />}
                            {n}
                          </span>
                        )
                      })
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

/** Аркуші, з яких беремо іконки: острів, хатинка, нові речі для хати. */
const ICON_SHEETS = [
  { file: 'sprites.png', atlas },
  { file: 'home-sprites.png', atlas: homeAtlas },
  { file: 'home-decor.png', atlas: decorAtlas },
]

/** Спрайт декору чи речі для хати, вписаний у квадрат box×box (пікселі лишаються чіткими). */
function DecoIcon({ kind, box, indoor = false }) {
  const sprite = (indoor ? INTERIOR_GEOM : DECO_GEOM)[kind]?.sprite
  const sheet = ICON_SHEETS.find((sh) => sh.atlas.frames[sprite])
  if (!sheet) return null
  const f = sheet.atlas.frames[sprite]
  const s = Math.min(box / f.w, box / f.h, 3)
  return (
    <span
      className="pixelated block shrink-0"
      style={{
        width: f.w * s,
        height: f.h * s,
        backgroundImage: `url(/game/walk/${sheet.file}?v=${artVersion.v})`,
        backgroundSize: `${sheet.atlas.size.w * s}px ${sheet.atlas.size.h * s}px`,
        backgroundPosition: `-${f.x * s}px -${f.y * s}px`,
      }}
    />
  )
}

/** «2 дошки · 1 камінь» — назви, бо в гілочки, дошки й колоди однакове емодзі. */
function costText(items, cost, inventory) {
  const parts = Object.entries(cost)
    .filter(([id, n]) => !inventory || (inventory[id] ?? 0) < n)
    .map(([id, n]) => `${id === 'balance' ? '✨' : itemOf(items, id).name} ×${inventory ? n - (inventory[id] ?? 0) : n}`)
  return parts.length ? parts.join(' · ') : 'безкоштовно'
}

/** Іконка грядки: що на ній росте (арт урожаю) або земля/бур'ян. */
function PlotIcon({ v, items }) {
  if (v.crop) return <ItemIcon item={itemOf(items, `crop_${v.crop.id}`)} size={30} className={v.ready ? '' : 'opacity-80 grayscale-[35%]'} />
  return <span className="text-2xl">{v.locked ? '🌿' : v.tilled ? (v.wet ? '💧' : '🟫') : '🌾'}</span>
}

function spotIcon(catalog, id) {
  return catalog.buildings.find((b) => b.id === id)?.emoji ?? ICONS[id] ?? '❔'
}

function spotHint(catalog, levels, chestOpen, id) {
  if (id.startsWith('dog:')) return 'Вірний пес — ходить за тобою слідом'
  if (id === 'exit') return 'Повернутися на острів'
  if (id === 'farmshop') return 'Насіння, продаж урожаю й поради'
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
