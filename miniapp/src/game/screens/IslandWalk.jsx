import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { canAfford, formatAmounts, homeStorage, itemOf } from '../data.js'
import { useGame, useNow } from '../context.js'
import { bedCount, fieldView, ownedSeeds, plotSpot, plotView } from '../farm.js'
import { haptic, useBackButton } from '../tg.js'
import { ItemIcon, PxButton, Segmented } from '../ui.jsx'
import atlas from '../walk/atlas.json'
import homeAtlas from '../walk/home-atlas.json'
import decorAtlas from '../walk/home-decor.json'
import artVersion from '../walk/version.json'
import { geomOf } from '../walk/decor.js'
import { INTERIOR_GEOM, interiorInteract } from '../walk/interior.js'
import { DEFAULT_FLOOR, FLOOR_COLORS, FLOOR_SHEET, floorRect } from '../walk/floors.js'
import { DOGS, dogById } from '../walk/companion.js'
import { INTERACT } from '../walk/layout.js'
import { skyAt, skyOverrideFromUrl } from '../walk/sky.js'
import { BuildingSheet, DailySheet } from './Home.jsx'
import { DogSheet, FarmSheet, Hearts, SeedBar } from './islandFarm.jsx'
import { CraftSheet, ResetSheet } from './islandCraft.jsx'

const BUILDINGS = new Set(['house', 'garden', 'workshop', 'lighthouse', 'pier'])
const NO_DECO = []
const DEFAULT_FLOOR_STATE = { ...DEFAULT_FLOOR, owned: [DEFAULT_FLOOR.p] }
const DOG_IDS = DOGS.map((d) => d.id)
const ICONS = { chest: '🎁', fishing: '🎣', boat: '⛵', exit: '🚪', bed: '🛏️', stove: '🔥', shelf: '📚', farmshop: '🌱', workbench: '🪚' }
/** Що написати на кнопці дії. */
const ACTION = { fishing: 'Рибалити', boat: 'Плисти', house: 'Увійти', exit: 'Вийти', bed: 'Подрімати', stove: 'Готувати', shelf: 'Читати', workbench: 'Майструвати', farmshop: 'Відкрити' }
/** Ресурси на острові — «node:<id>». */
const nodeOf = (id) => (id?.startsWith('node:') ? id.slice(5) : null)
/** Чим добувати: кнопка дії. */
const GATHER = { axe: '🪓 Рубати', pickaxe: '⛏️ Добути', hand: '🤲 Зібрати' }
/** Пси-компаньйони — не будівлі, тож їхні «точки» для панелі дії мають id «dog:<ім'я>». */
const dogOf = (id) => (id?.startsWith('dog:') ? dogById(id.slice(4)) : null)
/** Грядки на полі — «plot:<№>». */
const plotOf = (id) => (id?.startsWith('plot:') ? Number(id.slice(5)) : null)

/** Підказка по тапу на небо: що зараз і чим це корисно. */
function skyHint(sky) {
  const wet = sky.weather.id === 'rain' || sky.weather.id === 'storm'
  const time = sky.part.id === 'night' ? 'Ніч — маяк і ліхтарі світять яскравіше.' : `${sky.part.name} за твоїм місцевим часом.`
  const weather = wet ? 'Дощ сам поливає город 🌱' : 'Погода спільна для всіх острівців.'
  return `${sky.part.emoji} ${time} ${sky.weather.emoji} ${weather}`
}
/** Дія в хаті «bed:<id речі>» → «bed» (у хаті може бути кілька ліжок чи полиць). */
const actOf = (id) => id?.split(':')[0]
const FEED_TEXT = [(n) => `😋 ${n} уминає за обидві щоки!`, (n) => `😋 Хрум-хрум! ${n} задоволений.`]
const DOG_PETS = [
  (n) => `🐶 ${n} радісно махає хвостом!`,
  (n) => `🐶 ${n} підставляє вушко — ще, ще!`,
  (n) => `🐶 Гав! ${n} задоволений.`,
  (n) => `🐶 ${n} лизнув тобі руку.`,
]
const CATS = [
  { value: 'build', label: '🏗 Будова' },
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
  { value: 'floor', label: '🟫 Підлога' },
]

/** Рідний острів зсередини: ходиш мандрівником, підходиш до будівель — або будуєш у пісочниці. */
export default function IslandWalk() {
  const { state, catalog, items, act, toast, switchTab, back } = useGame()
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
  const [floorTry, setFloorTry] = useState(null) // { p, c } — приміряємо ще не куплений візерунок
  const indoors = scene === 'home'
  // Город і пси.
  const [farmTab, setFarmTab] = useState(null) // шторка комори: 'seeds' | 'sell' | 'guide' | null
  const [seed, setSeed] = useState(null) // яке насіння садити наступним тапом
  const [dogSheet, setDogSheet] = useState(null) // id пса, чия шторка відкрита
  const [craft, setCraft] = useState(false) // шторка верстата
  const gathering = useRef(false) // добування в процесі — другий тап не почне нове
  const working = useRef(new Set()) // грядки, на яких дія ще в дорозі до сервера
  const clearArmed = useRef(null) // «викопати» — другий тап підтверджує
  const now = useNow()
  const { home } = state
  const deco = state.deco ?? NO_DECO
  const interior = state.interior ?? NO_DECO
  const floor = state.floor ?? DEFAULT_FLOOR_STATE
  const houseLevel = Math.max(1, home.levels.house ?? 1)
  const nodes = state.nodes ?? NO_DECO
  const tools = state.tools ?? {}
  /**
   * Що можна поставити на острові: будівлі (будуються одразу на місці), грядки, верстат і комора,
   * декор. Будівля — «b:<id>», грядка — «bed»; усе інше — декор за id.
   */
  const islandDefs = useMemo(
    () => [
      ...catalog.buildings.filter((b) => b.placeable).map((b) => ({ id: `b:${b.id}`, cat: 'build', name: b.name, emoji: b.emoji, cost: b.levels[1].cost ?? {}, building: b.id })),
      { id: 'bed', cat: 'build', name: 'Грядка', emoji: '🟫', cost: {} },
      ...(catalog.decor ?? []).map((d) => (d.cat === 'survival' ? { ...d, cat: 'build' } : d)),
    ],
    [catalog]
  )
  /** Що вже стоїть на острові в тому ж вигляді, що й декор: { id, k, x, y }. */
  const islandPlaced = useMemo(
    () => [
      ...Object.entries(home.pos ?? {}).map(([id, p]) => ({ id: `b:${id}`, k: `b:${id}`, x: p.x, y: p.y, building: id })),
      ...Object.entries(state.farm?.plots ?? {}).map(([i, p]) => ({ id: `bed:${i}`, k: 'bed', x: p.x, y: p.y, plot: Number(i), crop: p.c ?? null })),
      ...deco,
    ],
    [home.pos, state.farm, deco]
  )
  /** Пісочниця: острів (будівлі, грядки, декор) чи хатинка (меблі й речі на стінах). */
  const sandbox = indoors
    ? { base: '/home/interior', placed: interior, defs: catalog.interior ?? [] }
    : { base: '/home/deco', placed: islandPlaced, defs: islandDefs }

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

  /* ───── Виживання: добування ───── */

  /** Інструмент, яким добувають ресурс, і чи він у тебе є. */
  const toolFor = (def) => {
    if (!def?.tool) return { kind: 'hand', ok: true, tier: 0 }
    const tier = tools[def.tool] ?? 0
    const t = catalog.craft?.tools.find((x) => x.id === def.tool)
    return { kind: def.tool, ok: tier >= def.tier, tier, need: t?.levels[def.tier - 1]?.name ?? 'інструмент' }
  }
  const nodeDef = (id) => {
    const n = nodes.find((x) => x.id === id)
    return n ? catalog.nodes?.find((d) => d.id === n.k) : null
  }

  /** Зрубати / розбити / підняти: кілька замахів у рушії, потім сервер видає здобич. */
  const gather = async (id) => {
    const def = nodeDef(id)
    if (!def || gathering.current) return
    const tool = toolFor(def)
    if (!tool.ok) {
      haptic('warning')
      toast(`${def.emoji} Потрібна ${tool.need.toLowerCase()} — зроби на верстаті 🪚`, 'error')
      return
    }
    gathering.current = true
    const hits = Math.max(1, def.hits - (tool.tier > def.tier ? 1 : 0))
    await engine.current?.gatherFx(id, hits, tool.kind)
    const res = await act('POST', `/island/nodes/${id}/gather`)
    gathering.current = false
    if (!res) return
    haptic('success')
    toast(Object.keys(res.got).length ? `${def.emoji} Здобуто: ${formatAmounts(items, res.got)}` : `${def.emoji} Нічого цікавого`)
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
    else if (nodeOf(id)) gather(nodeOf(id))
    else if (actOf(id) === 'workbench') setCraft(true)
    else if (actOf(id) === 'farmshop') setFarmTab('seeds')
    else if (id === 'house') goScene('home')
    else if (id === 'exit') goScene('island')
    else if (BUILDINGS.has(id)) setSheet(id)
    else if (id === 'chest') setDaily(true)
    else if (id === 'fishing') switchTab('fishing')
    else if (id === 'boat') switchTab('map')
    else if (actOf(id) === 'bed') toast('😴 Подрімав під вишитою ковдрою — сил додалось!')
    else if (actOf(id) === 'stove') switchTab('backpack') // готують рибу в рюкзаку
    else if (actOf(id) === 'shelf') switchTab('journal')
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
    if (d.building && home.levels[d.building] > 0) {
      haptic('select')
      toast(`${d.emoji} ${d.name} уже стоїть — вибрано, можна перенести`)
      setPick(null)
      showGhost(null)
      select(d.id)
      engine.current?.lookAt?.(home.pos?.[d.building])
      return
    }
    if (d.id === 'bed') {
      const { used, max } = bedCount(state.farm)
      if (used >= max) {
        haptic('warning')
        toast(`🟫 Уже ${max} грядок — більше острів не вмістить`, 'error')
        return
      }
    }
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
    const kind = ghost.kind
    const building = !indoors && kind.startsWith('b:') ? kind.slice(2) : null
    const bed = !indoors && kind === 'bed'
    let res
    if (building) res = await act('POST', `/home/${building}/${ghost.uid ? 'move' : 'place'}`, pos)
    else if (bed) res = ghost.uid ? await act('POST', `/farm/beds/${ghost.uid.slice(4)}/move`, pos) : await act('POST', '/farm/beds', pos)
    else res = ghost.uid ? await act('POST', `${sandbox.base}/${ghost.uid}/move`, pos) : await act('POST', sandbox.base, { kind, ...pos })
    setBusy(false)
    if (!res) return
    haptic('success')
    showGhost(null)
    const def = sandbox.defs.find((d) => d.id === kind)
    if (building && !ghost.uid) toast(`${def.emoji} ${def.name} збудовано! Торкнись її, щоб перенести`)
    if (ghost.uid) select(building || bed ? ghost.uid : res.item.id)
    else if (building) setPick(null)
    else if (bed) {
      const { used, max } = bedCount(res.state.farm)
      if (used >= max) setPick(null)
    }
    // Новий предмет: лишаємо його вибраним — наступний тап поставить ще один.
    else if (!canAfford(def.cost, res.state.balance, res.state.inventory)) setPick(null)
  }

  const startMove = () => {
    const d = sandbox.placed.find((x) => x.id === sel)
    if (!d) return
    select(null)
    setPick(null)
    showGhost(d.wall ? { kind: d.k, wall: d.wall, at: d.at, h: d.h, uid: d.id } : { kind: d.k, x: d.x, y: d.y, uid: d.id })
  }

  const removeArmed = useRef(null) // розібрати будівлю чи грядку з урожаєм — другий тап підтверджує
  const remove = async () => {
    if (!sel || busy) return
    const item = sandbox.placed.find((x) => x.id === sel)
    const building = !indoors && sel.startsWith('b:') ? sel.slice(2) : null
    const bed = !indoors && sel.startsWith('bed:') ? sel.slice(4) : null
    if ((building || (bed && item?.crop)) && (removeArmed.current?.id !== sel || Date.now() - removeArmed.current.at > 2500)) {
      removeArmed.current = { id: sel, at: Date.now() }
      haptic('warning')
      toast(building ? 'Тапни 🗑 ще раз — будівлю розберемо, усе витрачене повернеться' : 'Тапни 🗑 ще раз — грядку приберемо разом з рослиною')
      return
    }
    removeArmed.current = null
    setBusy(true)
    const res = building
      ? await act('DELETE', `/home/building/${building}`)
      : bed
        ? await act('DELETE', `/farm/beds/${bed}`)
        : await act('DELETE', `${sandbox.base}/${sel}`)
    setBusy(false)
    if (!res) return
    haptic('success')
    select(null)
    const refund = res.refund ?? {}
    toast(Object.keys(refund).length ? `${building ? 'Розібрано' : 'Прибрано'}. Повернуто: ${formatAmounts(items, refund)}` : 'Прибрано')
  }

  /* ───── Підлога ───── */

  /** Постелити: свій візерунок — одразу (колір безкоштовний), новий — спершу приміряти, потім «Купити». */
  const chooseFloor = async (p, c) => {
    const def = catalog.floors?.find((f) => f.id === p)
    if (!def || busy) return
    if (floor.owned.includes(p)) {
      setFloorTry(null)
      if (floor.p === p && floor.c === c) return
      setBusy(true)
      engine.current?.setFloor({ p, c }) // одразу, не чекаючи сервера
      const res = await act('POST', '/home/floor', { pattern: p, color: c })
      setBusy(false)
      if (res) haptic('success')
      else engine.current?.setFloor(floor)
      return
    }
    if (def.level > houseLevel) {
      haptic('warning')
      toast(`🔒 Відкриється, коли хатинка стане ${def.level}-го рівня`, 'error')
      return
    }
    haptic('select')
    setFloorTry({ p, c })
  }
  const buyFloor = async () => {
    const def = floorTry && catalog.floors?.find((f) => f.id === floorTry.p)
    if (!def || busy) return
    if (!canAfford(def.cost, state.balance, state.inventory)) {
      haptic('warning')
      toast(`Не вистачає: ${costText(items, def.cost, { ...state.inventory, balance: state.balance })}`, 'error')
      return
    }
    setBusy(true)
    const res = await act('POST', '/home/floor', { pattern: floorTry.p, color: floorTry.c })
    setBusy(false)
    if (!res) return
    haptic('success')
    setFloorTry(null)
    toast(`${def.emoji} Нова підлога — ${def.name.toLowerCase()}!`)
  }
  // Рушій показує приміряну підлогу або збережену.
  useEffect(() => {
    engine.current?.setFloor(floorTry ?? floor)
  }, [ready, floorTry, floor])

  const enterBuild = () => {
    haptic('medium')
    setCat(indoors ? 'furniture' : 'build')
    setBuild(true)
    engine.current?.setMode('build')
  }
  const exitBuild = () => {
    setBuild(false)
    setFloorTry(null)
    setPick(null)
    setGhost(null)
    setSel(null)
    engine.current?.setMode('walk')
  }
  // «Назад» у Telegram у хаті — вийти надвір.
  useBackButton(scene === 'home', () => goScene('island'))
  // «Назад» у Telegram: спершу скасовує вибір, потім виходить із будівництва.
  useBackButton(build, () => {
    if (floorTry) return setFloorTry(null)
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
    engine.current?.setWorld({ home: { levels: home.levels, pos: home.pos ?? {} }, chestOpen, deco, interior, nodes })
  }, [ready, home.levels, home.pos, chestOpen, deco, interior, nodes])

  // Поле: що де росте (оновлюється й саме — волога грядка дорослішає без запитів).
  const field = useMemo(() => fieldView(catalog, state.farm, now), [catalog, state.farm, now])
  useEffect(() => {
    if (ready) engine.current?.setFarm(field)
  }, [ready, field])

  // Небо: справжній час доби там, де гравець, і спільна погода світу.
  const skyOverride = useMemo(() => skyOverrideFromUrl(), [])
  const sky = useMemo(() => skyAt(now, skyOverride), [now, skyOverride])
  useEffect(() => {
    if (ready) engine.current?.setSky(sky)
  }, [ready, sky])

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
  const nearNode = indoors ? null : nodeDef(nodeOf(near))
  const nodeTool = nearNode ? toolFor(nearNode) : null
  const spot = nearDog
    ? { id: near, label: `Песик ${nearDog.name}` }
    : plotV
      ? { id: near, label: plotInfo.label }
      : nearNode
        ? { id: near, label: nearNode.name }
        : indoors
          ? interiorInteract(interior).find((i) => i.id === near)
          : islandSpot(catalog, near)
  const showSeeds = !build && !indoors && (plotV ? plotV.action === 'plant' || plotV.action === 'till' : actOf(near) === 'farmshop')
  const hasBench = deco.some((d) => d.k === 'workbench')
  const hint = build ? null : indoors ? (interior.length ? null : 'Хата порожня — натисни 🔨 і постав, що хочеш.') : survivalHint(state, hasBench, tools)
  /** «Назад»: з хати — надвір, з острова — туди, звідки прийшли. */
  const leave = () => {
    if (indoors) return goScene('island')
    haptic('light')
    back()
  }
  const dogInfo = nearDog ? state.dogs?.[nearDog.id] : null
  const building = catalog.buildings.find((b) => b.id === sheet)
  // Звістка про острів «з нуля» — раз; сервер забуває її після «Будуймо!».
  const [resetSeen, setResetSeen] = useState(false)
  const ackReset = () => {
    setResetSeen(true)
    act('POST', '/home/reset/ack', {}, { silent: true })
  }

  return (
    // Повноекранний острів: полотно на весь екран, керування — поверх нього.
    // Висота полотна не залежить від панелей, тож камера не смикається, коли вони з'являються.
    <div className="relative h-full w-full overflow-hidden bg-[#3b7fd0]">
      <canvas ref={canvas} className="absolute inset-0 block h-full w-full touch-none" />
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0f2a3d]/60 text-center">
          <motion.span className="text-4xl" animate={error ? {} : { y: [0, -6, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
            {error ? '🌫️' : '⛵'}
          </motion.span>
          <p className="px-6 text-sm text-cream">{error ?? 'Пристаємо до берега…'}</p>
        </div>
      )}

      {/* Верх: назад, інструменти (або лічильник у будівництві), погода й камера. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-2" style={{ paddingTop: SAFE_TOP }}>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <HudButton label={build ? '✓ Готово' : '←'} title={build ? 'Готово' : indoors ? 'Надвір' : 'Залишити острів'} onClick={build ? exitBuild : leave} wide={build} />
          {build ? (
            <span className="rounded-sm bg-black/45 px-2 py-1 font-pixel text-[9px] text-cream">
              {indoors ? `РЕЧІ ${interior.length}/${catalog.interiorMax ?? 100}` : `ДЕКОР ${deco.length}/${catalog.decorMax ?? 150}`}
            </span>
          ) : (
            !indoors && (
              <span className="flex gap-2 rounded-sm bg-black/45 px-2 py-1 font-pixel text-[10px] text-cream">
                {(catalog.craft?.tools ?? []).map((t) => (
                  <span key={t.id} className={tools[t.id] ? '' : 'opacity-40 grayscale'}>
                    {t.emoji}
                    {tools[t.id] || '–'}
                  </span>
                ))}
              </span>
            )
          )}
        </div>
        {ready && (
          <div className="pointer-events-auto flex gap-1">
            {!build && <HudButton label={`${sky.part.emoji}${sky.weather.emoji}`} title={`${sky.part.name} · ${sky.weather.name}`} onClick={() => toast(skyHint(sky))} wide />}
            <HudButton label="+" title="Наблизити" onClick={() => engine.current?.zoom(0.8)} />
            <HudButton label="−" title="Віддалити" onClick={() => engine.current?.zoom(1.25)} />
            {!build && <HudButton label="📯" title="Покликати псів" onClick={whistle} />}
          </div>
        )}
      </div>

      {/* Низ: дія поруч, насіння, будівництво — або панель пісочниці. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 px-2" style={{ paddingBottom: SAFE_BOTTOM }}>
        {build ? (
          <div className="pointer-events-auto overflow-hidden rounded-sm bg-[#0f2a3d]/85 p-2 shadow-[0_-4px_16px_#0006] backdrop-blur-[2px]">
            <BuildPanel
              indoor={indoors}
              defs={sandbox.defs}
              placed={sandbox.placed}
              houseLevel={houseLevel}
              cat={cat}
              setCat={(c) => {
                setCat(c)
                setFloorTry(null)
                if (c === 'floor') {
                  clearGhost()
                  select(null)
                }
              }}
              floor={floor}
              floorTry={floorTry}
              onFloor={chooseFloor}
              onBuyFloor={buyFloor}
              onCancelFloor={() => setFloorTry(null)}
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
            />
          </div>
        ) : (
          <>
            {showSeeds && (
              <div className="pointer-events-auto">
                <SeedBar seed={seedToPlant()?.id ?? null} setSeed={setSeed} onShop={() => setFarmTab('seeds')} />
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <AnimatePresence mode="wait" initial={false}>
                  {spot ? (
                    <motion.div
                      key={spot.id}
                      className="px-wood pointer-events-auto flex h-[60px] items-center gap-2 overflow-hidden px-2 py-1.5 text-cream"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {plotV ? (
                        <PlotIcon v={plotV} items={items} />
                      ) : (
                        <span className="text-2xl">{nearDog ? '🐶' : nearNode ? nearNode.emoji : spotIcon(catalog, spot.id)}</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold">{spot.label}</p>
                        {dogInfo ? (
                          <Hearts hearts={dogInfo.hearts} love={dogInfo.love} size={10} />
                        ) : (
                          <p className={`truncate text-[11px] ${nodeTool && !nodeTool.ok ? 'text-[#ffb3a6]' : 'text-cream/75'}`}>
                            {plotInfo ? plotInfo.hint : nearNode ? nodeHint(items, nearNode, nodeTool) : spotHint(catalog, home.levels, chestOpen, spot.id)}
                          </p>
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
                            className={plotV.action === 'wait' ? 'opacity-60' : ''}
                            onClick={() => interact(spot.id)}
                          >
                            {plotV.action === 'plant' && seedToPlant() ? `🌱 ${seedToPlant().name}` : plotInfo.button}
                          </PxButton>
                        </>
                      ) : nearNode ? (
                        <PxButton size="sm" variant={nodeTool.ok ? 'yellow' : 'paper'} className={nodeTool.ok ? '' : 'opacity-60'} onClick={() => interact(spot.id)}>
                          {GATHER[nodeTool.kind]}
                        </PxButton>
                      ) : (
                        <PxButton size="sm" variant="green" onClick={() => interact(spot.id)}>
                          {nearDog ? 'Погладити' : (ACTION[actOf(spot.id)] ?? 'Відкрити')}
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
                  ) : hint ? (
                    // Підказка — лише поки є що підказати (перші кроки), і не заважає тапати по острову.
                    <motion.p
                      key="hint"
                      className="mx-auto w-fit max-w-full rounded-sm bg-black/50 px-3 py-1.5 text-center text-[12px] leading-snug text-cream"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {hint}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
              <div className="pointer-events-auto flex shrink-0 flex-col gap-2">
                {indoors && <RoundButton label="🚪" title="Надвір" variant="blue" onClick={() => goScene('island')} />}
                <RoundButton label="🔨" title={indoors ? 'Облаштувати' : 'Будувати'} variant="yellow" disabled={!ready} onClick={enterBuild} />
              </div>
            </div>
          </>
        )}
      </div>

      <BuildingSheet building={building} onClose={() => setSheet(null)} />
      <DailySheet open={daily} onClose={() => setDaily(false)} />
      <FarmSheet tab={farmTab} setTab={setFarmTab} onClose={() => setFarmTab(null)} />
      <DogSheet dog={dogSheet ? dogById(dogSheet) : null} onClose={() => setDogSheet(null)} onCommand={commandDog} onFeed={feedDog} />
      <CraftSheet open={craft} onClose={() => setCraft(false)} />
      <ResetSheet note={resetSeen ? null : home.reset} onClose={ackReset} />
    </div>
  )
}

/** GameApp показує цей екран на весь екран: без шапки, вкладок і відступів. */
IslandWalk.fullscreen = true

/**
 * Відступи від країв з урахуванням вирізу/жестів і кнопок Telegram у повноекранному режимі
 * (telegram-web-app.js ставить --tg-safe-area-inset-* і --tg-content-safe-area-inset-*).
 */
const SAFE_TOP = 'calc(max(env(safe-area-inset-top, 0px), var(--tg-safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 8px)'
const SAFE_BOTTOM = 'calc(max(env(safe-area-inset-bottom, 0px), var(--tg-safe-area-inset-bottom, 0px)) + 10px)'

/** Маленька напівпрозора кнопка поверх острова. */
function HudButton({ label, title, onClick, wide = false }) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={() => {
        haptic('light')
        onClick()
      }}
      className={`flex h-9 items-center justify-center rounded-sm bg-black/45 font-pixel text-[14px] text-cream drop-shadow active:bg-black/65 ${wide ? 'px-2' : 'w-9'}`}
    >
      {label}
    </button>
  )
}

/** Кругла кнопка дії в правому нижньому куті (будувати, надвір). */
function RoundButton({ label, title, onClick, variant, disabled }) {
  const tone = variant === 'blue' ? 'bg-[#3a8fe0] border-[#1f4f87]' : 'bg-gold border-[#8a6410]'
  return (
    <motion.button
      type="button"
      aria-label={title}
      title={title}
      disabled={disabled}
      whileTap={{ scale: 0.9 }}
      onClick={() => {
        haptic('medium')
        onClick()
      }}
      className={`flex size-14 items-center justify-center rounded-full border-4 text-2xl shadow-[0_4px_0_#0007] disabled:opacity-50 ${tone}`}
    >
      {label}
    </motion.button>
  )
}

/* ───────── Панель пісочниці ───────── */

function BuildPanel({ indoor, defs, placed, houseLevel, cat, setCat, pick, ghost, sel, busy, onChoose, onConfirm, onCancel, onMove, onRemove, floor, floorTry, onFloor, onBuyFloor, onCancelFloor }) {
  const { catalog, state, items } = useGame()
  const decor = defs
  const defOf = (kind) => decor.find((d) => d.id === kind)
  const beds = bedCount(state.farm)
  const selItem = sel && placed.find((d) => d.id === sel)
  const active = ghost ? defOf(ghost.kind) : pick ? defOf(pick) : null
  const where = (d) => (indoor ? (d.wall ? 'на стіні, де повісити' : 'на підлозі, де поставити') : 'на острові, де поставити')

  const floorDef = floorTry && catalog.floors?.find((f) => f.id === floorTry.p)

  let context
  if (indoor && cat === 'floor') {
    context = floorDef ? (
      <>
        <FloorThumb f={floorTry} w={34} h={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">
            {floorDef.name} · {FLOOR_COLORS[floorTry.p][floorTry.c].name.toLowerCase()}
          </p>
          <p className="truncate text-[11px] text-cream/75">Приміряй кольори · ціна: {costText(items, floorDef.cost)}</p>
        </div>
        <PxButton size="sm" variant="green" disabled={busy} onClick={onBuyFloor}>
          Купити
        </PxButton>
        <PxButton size="sm" variant="paper" onClick={onCancelFloor} aria-label="Скасувати">
          ✕
        </PxButton>
      </>
    ) : (
      <p className="flex-1 text-center text-[12px] text-cream/80">Обери візерунок і колір. Куплений візерунок перефарбовуєш безкоштовно.</p>
    )
  } else if (ghost && active) {
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
    const b = selItem.building && catalog.buildings.find((x) => x.id === selItem.building)
    const refund = b ? spentOn(b, state.home.levels[b.id]) : selItem.free ? {} : (d?.cost ?? {})
    context = (
      <>
        <DecoIcon kind={selItem.k} box={34} indoor={indoor} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{d?.name}</p>
          <p className="truncate text-[11px] text-cream/75">
            {selItem.k === 'bed'
              ? selItem.crop ? 'Переносиш разом з рослиною' : 'Перенеси, куди зручно'
              : Object.keys(refund).length
                ? `${b ? 'Розбереш' : 'Прибереш'} — повернеться: ${costText(items, refund)}`
                : selItem.free ? 'Була в хаті від початку' : 'Безкоштовна прикраса'}
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
        Обери {indoor ? 'річ' : 'будівлю чи предмет'} нижче або торкнись {indoor ? 'речі в хаті' : 'того, що вже стоїть'}, щоб перенести чи прибрати.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="px-wood flex min-h-14 items-center gap-2 px-2 py-1.5 text-cream">{context}</div>

      <Segmented options={indoor ? CATS_HOME : CATS} value={cat} onChange={setCat} />

      {indoor && cat === 'floor' ? (
        <FloorPicker floor={floor} floorTry={floorTry} houseLevel={houseLevel} onFloor={onFloor} />
      ) : (
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
        {decor
          .filter((d) => d.cat === cat)
          .map((d) => {
            const built = d.building && state.home.levels[d.building] > 0
            const locked = indoor && d.level > houseLevel
            const full = d.id === 'bed' && beds.used >= beds.max
            const affordable = !locked && !full && (built || canAfford(d.cost, state.balance, state.inventory))
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
                  {built ? (
                    <span className="text-[#2f6b1f]">✓ стоїть</span>
                  ) : d.id === 'bed' ? (
                    <span className={full ? 'text-[#9a2f1d]' : ''}>
                      {beds.used ? `стоїть ${beds.used}` : 'безкоштовно'}
                    </span>
                  ) : Object.keys(d.cost).length
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
      )}

    </div>
  )
}

/** Візерунки підлоги (картки з цінами) і кольори вибраного візерунку. */
function FloorPicker({ floor, floorTry, houseLevel, onFloor }) {
  const { catalog, state, items } = useGame()
  const shown = floorTry ?? floor
  return (
    <>
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
        {(catalog.floors ?? []).map((d) => {
          const owned = floor.owned.includes(d.id)
          const locked = !owned && d.level > houseLevel
          const affordable = owned || (!locked && canAfford(d.cost, state.balance, state.inventory))
          const chosen = shown.p === d.id
          const c = chosen ? shown.c : floor.p === d.id ? floor.c : 0
          return (
            <motion.button
              key={d.id}
              type="button"
              whileTap={{ scale: 0.93 }}
              onClick={() => onFloor(d.id, c)}
              className={`px-slot relative flex w-[84px] shrink-0 flex-col items-center gap-1 py-1.5 ${affordable ? '' : 'opacity-55'}`}
              style={chosen ? { boxShadow: '0 0 0 2px #ffcf3f, 0 0 10px #ffcf3f' } : undefined}
            >
              <FloorThumb f={{ p: d.id, c }} w={64} h={40} />
              {locked && <span className="absolute top-0.5 right-1 font-pixel text-[9px] text-ink">🔒{d.level}</span>}
              <span className="w-full truncate px-1 text-center text-[10px] leading-tight font-extrabold text-ink">{d.name}</span>
              <span className="flex min-h-[14px] flex-wrap justify-center gap-x-1 px-0.5 text-[9px] leading-tight text-ink-soft">
                {owned ? (
                  <span className="text-[#2f6b1f]">{floor.p === d.id ? '✓ постелено' : '✓ куплено'}</span>
                ) : Object.keys(d.cost).length ? (
                  Object.entries(d.cost).map(([id, n]) => {
                    const have = id === 'balance' ? state.balance : (state.inventory[id] ?? 0)
                    return (
                      <span key={id} className={`inline-flex items-center ${have >= n ? '' : 'text-[#9a2f1d]'}`}>
                        {id === 'balance' ? '✨' : <ItemIcon item={itemOf(items, id)} size={13} />}
                        {n}
                      </span>
                    )
                  })
                ) : (
                  'безкоштовно'
                )}
              </span>
            </motion.button>
          )
        })}
      </div>
      <div className="px-wood flex items-center justify-center gap-2 px-2 py-1.5">
        {FLOOR_COLORS[shown.p].map((col, i) => {
          const on = shown.c === i
          return (
            <button
              key={col.name}
              type="button"
              title={col.name}
              aria-label={col.name}
              aria-pressed={on}
              onClick={() => {
                haptic('select')
                onFloor(shown.p, i)
              }}
              className="flex flex-col items-center gap-0.5"
            >
              <span className="rounded-sm" style={{ boxShadow: on ? '0 0 0 2px #ffcf3f, 0 0 8px #ffcf3f' : '0 0 0 2px #0006' }}>
                <FloorThumb f={{ p: shown.p, c: i }} w={40} h={28} />
              </span>
              <span className={`max-w-[64px] truncate text-[9px] leading-tight ${on ? 'font-extrabold text-cream' : 'text-cream/70'}`}>{col.name}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

/** Шматок підлоги з аркуша home-floors.png (із середини кімнати, без тіней від стін), ×2. */
function FloorThumb({ f, w, h }) {
  const r = floorRect(f)
  const s = 2
  return (
    <span
      className="pixelated block shrink-0 rounded-sm"
      style={{
        width: w,
        height: h,
        backgroundImage: `url(/game/walk/home-floors.png?v=${artVersion.v})`,
        backgroundSize: `${FLOOR_SHEET.w * s}px ${FLOOR_SHEET.h * s}px`,
        backgroundPosition: `-${(r.x + 24) * s}px -${(r.y + 60) * s}px`,
      }}
    />
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
  const sprite = indoor ? INTERIOR_GEOM[kind]?.sprite : geomOf(kind)?.sprite
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

/** Що витрачено на будівлю до рівня level (усі ступені) — повернеться, якщо розібрати. */
function spentOn(b, level) {
  const out = {}
  for (let l = 1; l <= level; l++) for (const [id, n] of Object.entries(b.levels[l]?.cost ?? {})) out[id] = (out[id] ?? 0) + n
  return out
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
  return <span className="text-2xl">{v.tilled ? (v.wet ? '💧' : '🟫') : '🌾'}</span>
}

/** Що стоїть на острові під цим id: будівля, верстат, комора чи те, що є завжди. */
function islandSpot(catalog, id) {
  if (!id) return null
  const b = catalog.buildings.find((x) => x.id === id)
  if (b) return { id, label: b.name }
  if (actOf(id) === 'workbench') return { id, label: 'Верстат' }
  if (actOf(id) === 'farmshop') return { id, label: 'Комора городника' }
  return INTERACT.find((i) => i.id === id) ?? null
}

/** Підказка біля ресурсу: що з нього буде або чого бракує. */
function nodeHint(items, def, tool) {
  if (!tool.ok) return `Потрібна ${tool.need.toLowerCase()} — зроби на верстаті`
  return `Дасть: ${def.loot.map((id) => itemOf(items, id).name.toLowerCase()).join(', ')}`
}

/** Підказка, що робити далі: від порожнього острова до сокири й кайла. */
function survivalHint(state, hasBench, tools) {
  if (!hasBench) return 'Збирай руками кущі, камінчики й корчі. 4 гілочки й 2 камені — і став верстат 🪚 (🔨).'
  if (!tools.axe) return 'Біля верстата 🪚 зроби кам\'яну сокиру — і рубай дерева на колоди.'
  if (!tools.pickaxe) return 'Зроби на верстаті кайло ⛏️ — каміння дасть більше каменю.'
  if (!Object.keys(state.farm?.plots ?? {}).length) return 'Постав грядки й комору городника (🔨) — і вирощуй урожай 🌱'
  return null
}

function spotIcon(catalog, id) {
  if (ICONS[actOf(id)]) return ICONS[actOf(id)]
  return catalog.buildings.find((b) => b.id === id)?.emoji ?? ICONS[id] ?? '❔'
}

function spotHint(catalog, levels, chestOpen, id) {
  if (id.startsWith('dog:')) return 'Вірний пес — ходить за тобою слідом'
  if (id === 'exit') return 'Повернутися на острів'
  if (actOf(id) === 'farmshop') return 'Насіння, продаж урожаю й поради'
  if (actOf(id) === 'workbench') return 'Інструменти й дошки з колод'
  if (actOf(id) === 'bed') return 'Перина й вишита ковдра'
  if (actOf(id) === 'stove') return 'Готують рибу — у рюкзаку'
  if (actOf(id) === 'shelf') return 'Щоденник: Думосвіт, Літописець, Арки'
  if (id === 'chest') return chestOpen ? 'Сьогодні вже відкрито — повертайся завтра' : 'Щоденна нагорода чекає!'
  if (id === 'fishing') return 'Закинути вудку з краю причалу'
  if (id === 'boat') return 'Попливти до інших островів'
  const b = catalog.buildings.find((x) => x.id === id)
  const lvl = levels[id] ?? 0
  if (!lvl) return 'Порожня ділянка — можна збудувати'
  return lvl >= b.levels.length - 1 ? `Рівень ${lvl} · найвищий` : `Рівень ${lvl} · можна покращити`
}
