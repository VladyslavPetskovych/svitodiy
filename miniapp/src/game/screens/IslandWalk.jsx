import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { canAfford, homeStorage, itemOf } from '../data.js'
import { useGame, useNow } from '../context.js'
import { bedCount, fieldView, ownedSeeds, plotSpot, plotView, shortDuration } from '../farm.js'
import { createPresence } from '../presence.js'
import { haptic, useBackButton } from '../tg.js'
import { Bar, ItemIcon, PxButton, Segmented } from '../ui.jsx'
import atlas from '../walk/atlas.json'
import homeAtlas from '../walk/home-atlas.json'
import decorAtlas from '../walk/home-decor.json'
import artVersion from '../walk/version.json'
import { geomOf } from '../walk/decor.js'
import { INTERIOR_GEOM, interiorInteract } from '../walk/interior.js'
import { DEFAULT_FLOOR, FLOOR_COLORS, FLOOR_SHEET, floorRect } from '../walk/floors.js'
import { DOGS, dogById } from '../walk/companion.js'
import { INTERACT } from '../walk/layout.js'
import { WINTER_INTERACT } from '../walk/winter.js'
import { skyAt, skyOverrideFromUrl } from '../walk/sky.js'
import { BuildingSheet } from './Home.jsx'
import { DogSheet, FarmSheet, Hearts, SeedBar } from './islandFarm.jsx'
import { CraftSheet, ResetSheet } from './islandCraft.jsx'
import { ClosetSheet } from './islandWardrobe.jsx'

const BUILDINGS = new Set(['house', 'garden', 'workshop', 'lighthouse', 'pier'])
const NO_DECO = []
const DEFAULT_FLOOR_STATE = { ...DEFAULT_FLOOR, owned: [DEFAULT_FLOOR.p] }
const DOG_IDS = DOGS.map((d) => d.id)
const ICONS = { chest: '🎁', fishing: '🎣', boat: '⛵', exit: '🚪', bed: '🛏️', stove: '🔥', shelf: '📚', farmshop: '🌱', workbench: '🪚', closet: '👕', sail_home: '⛵', winter_sign: '🪧', winter_fire: '🔥', windmill: '🌬️', tree: '🌱', rubber: '🟤', net: '🥅' }
/** Що написати на кнопці дії. */
const ACTION = { fishing: 'Рибалити', boat: 'Плисти', house: 'Увійти', exit: 'Вийти', bed: 'Подрімати', stove: 'Готувати', shelf: 'Читати', workbench: 'Майструвати', farmshop: 'Відкрити', closet: 'Перевдягтися', sail_home: 'Додому', winter_sign: 'Читати', winter_fire: 'Погрітися', windmill: 'Глянути', tree: 'Глянути', rubber: 'Зібрати', net: 'Глянути' }
/** Ресурси на острові — «node:<id>». */
const nodeOf = (id) => (id?.startsWith('node:') ? id.slice(5) : null)
/** Чим добувати: кнопка дії. */
const GATHER = { axe: '🪓 Рубати', pickaxe: '⛏️ Добути', shovel: '🪏 Копати', hand: '🤲 Зібрати' }
/** Знахідки, після яких сиплються іскри: гроші й срібло. */
const RARE = new Set(['old_coin', 'silver_piece'])
/** Що сказати біля вогнища на Хуртовині. */
const WARM = ['🔥 Руки відігріті', '🔥 Тепло…', '🔥 Ще хвилинку — і копати далі']
/** Пси-компаньйони — не будівлі, тож їхні «точки» для панелі дії мають id «dog:<ім'я>». */
const dogOf = (id) => (id?.startsWith('dog:') ? dogById(id.slice(4)) : null)
/** Грядки на полі — «plot:<№>». */
const plotOf = (id) => (id?.startsWith('plot:') ? Number(id.slice(5)) : null)
/** Посаджене дерево (декор, server/src/game/trees.js). */
const TREE_KIND = 'tree_sprout'
const TREE_NAMES = { oak: 'дуб', birch: 'береза', pine: 'ялинка' }
/**
 * Скільки стадій пройшло посаджене дерево на мить now: 0…stages-1 — росте,
 * stages — уже доросло (сервер при наступному читанні стану поставить на його місце справжнє дерево).
 */
function treeStage(trees, d, now) {
  const ms = (trees?.growMin ?? 40) * 60_000
  const stages = trees?.stages ?? 3
  return Math.max(0, Math.min(stages, Math.floor(((now - (d.t ?? 0)) / ms) * stages)))
}
/** Гевея (server/src/game/rubber.js): скільки каучуку в чашці на мить now і коли буде наступний. */
const RUBBER_KIND = 'rubber_tree'
function rubberNow(cfg, d, now) {
  const ripe = (d.t ?? 0) + (cfg?.growMin ?? 60) * 60_000
  const unit = 3_600_000 / (cfg?.perHour ?? 3)
  const cap = cfg?.cap ?? 24
  if (now < ripe) return { grown: false, ready: 0, nextIn: ripe - now }
  const from = Math.max(ripe, d.c ?? 0)
  const ready = Math.min(cap, Math.floor((now - from) / unit))
  return { grown: true, ready, cap, nextIn: ready >= cap ? 0 : unit - ((now - from) % unit) }
}

/** Підказка по тапу на небо: що зараз і чим це корисно. */
function skyHint(sky, wild) {
  const wet = sky.weather.id === 'rain' || sky.weather.id === 'storm'
  const time = sky.part.id === 'night' ? 'Ніч — маяк і ліхтарі світять яскравіше.' : `${sky.part.name} за твоїм місцевим часом.`
  if (wild) return `${sky.part.emoji} ${sky.part.name}. ❄️ На Хуртовині завжди сніжить${wet ? ' — а зараз ще й завірюха' : ''}.`
  const weather = wet ? 'Дощ сам поливає город 🌱' : 'Погода спільна для всіх острівців.'
  return `${sky.part.emoji} ${time} ${sky.weather.emoji} ${weather}`
}
/** Дія в хаті «bed:<id речі>» → «bed» (у хаті може бути кілька ліжок чи полиць). */
const actOf = (id) => id?.split(':')[0]
const FEED_TEXT = [(n) => `😋 ${n} уминає!`, () => '😋 Хрум-хрум!']
const DOG_PETS = [() => 'Гав! 🐾', (n) => `${n} махає хвостом`, () => 'Ще, ще! ❤️', (n) => `${n} лизнув руку`]
/** Що сказати, вийшовши з шафи в новому. */
const DRESSED = ['✨ Новий образ!', '😎 Красень!', '👕 Як із голочки']
/** Випадковий елемент масиву (різні репліки пса). */
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)]
/** «+3 🥕  +1 🌱» — коротко, для напису над грядкою чи ресурсом. */
const shortGot = (items, got) =>
  Object.entries(got ?? {})
    .map(([id, n]) => `+${n} ${id === 'balance' ? '✨' : itemOf(items, id).emoji}`)
    .join('  ')
/** Обхід усіх грядок підряд: напис на кнопці й під час роботи. */
const CHAIN = {
  water: { all: '💧 Полити всі', doing: '💧 Поливаю' },
  harvest: { all: '🧺 Зібрати все', doing: '🧺 Збираю' },
  plant: { all: '🌱 Засадити всі', doing: '🌱 Саджу' },
}
/** Розділи будівництва: робочі споруди й будівлі, електрика, посадки, що дають ресурс, і декор. */
const CATS = [
  { value: 'build', label: '🏗 Будова' },
  { value: 'power', label: '⚡ Електрика' },
  { value: 'garden', label: '🌱 Посадки' },
  { value: 'decor', label: '🎨 Декор' },
]
/** Пісочниця в хатинці. */
const CATS_HOME = [
  { value: 'furniture', label: '🪑 Меблі' },
  { value: 'kitchen', label: '🍲 Кухня' },
  { value: 'textile', label: '🧶 Килими' },
  { value: 'wall', label: '🖼 Стіни' },
  { value: 'modern', label: '✨ Модерн' },
  { value: 'floor', label: '🟫 Підлога' },
]

/**
 * Рідний острів зсередини: ходиш мандрівником, підходиш до будівель — або будуєш у пісочниці.
 * start='winter' — Острів Хуртовини: там не будують, а копають замети лопатою й б'ють лід.
 */
export default function IslandWalk({ start = 'island' }) {
  const { wa, state, catalog, items, act, toast, setToastSink, switchTab, go, back } = useGame()
  const canvas = useRef(null)
  const engine = useRef(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [near, setNear] = useState(null)
  const [sheet, setSheet] = useState(null)
  // Пісочниця.
  const [build, setBuild] = useState(false)
  const [cat, setCat] = useState('build')
  const [pick, setPick] = useState(null) // id декору, який ставимо
  const [ghost, setGhost] = useState(null) // { kind, x, y, uid?, ok, reason? }
  const [sel, setSel] = useState(null) // id виділеної прикраси
  const [busy, setBusy] = useState(false)
  const [scene, setScene] = useState(start) // 'island' | 'home' | 'winter'
  const [floorTry, setFloorTry] = useState(null) // { p, c } — приміряємо ще не куплений візерунок
  const indoors = scene === 'home'
  /** Дикий острів (Хуртовина): ні будівництва, ні города — лише ресурси й човен додому. */
  const wild = scene === 'winter'
  // Город і пси.
  const [farmTab, setFarmTab] = useState(null) // шторка комори: 'seeds' | 'sell' | 'guide' | null
  const [seed, setSeed] = useState(null) // яке насіння садити наступним тапом
  const [dogSheet, setDogSheet] = useState(null) // id пса, чия шторка відкрита
  const [craft, setCraft] = useState(false) // шторка верстата
  const [closet, setCloset] = useState(false) // шторка шафи з одягом
  const gathering = useRef(false) // добування в процесі — другий тап не почне нове
  // Ресурси, які вже добуто: поки новий стан не дійшов до кнопки, повторний тап не шле запит удруге.
  const gathered = useRef(new Set())
  const working = useRef(new Set()) // грядки, на яких дія ще в дорозі до сервера
  // «Викопати» / «Розібрати»: перший тап перетворює кнопку на «Точно?», другий — підтверджує.
  const [armed, setArmed] = useState(null)
  const armTimer = useRef(null)
  const arm = (id) => {
    haptic('warning')
    setArmed(id)
    clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(null), 2500)
  }
  // «Полити всі» тощо: мандрівник сам обходить грядки одну за одною.
  const chain = useRef(null) // { kind, target, timer }
  const [chainKind, setChainKind] = useState(null)
  // Звістка про острів «з нуля» — раз; сервер забуває її після «Будуймо!».
  const [resetSeen, setResetSeen] = useState(false)
  const now = useNow()
  const { home } = state
  const rawDeco = state.deco ?? NO_DECO
  const interior = state.interior ?? NO_DECO
  const floor = state.floor ?? DEFAULT_FLOOR_STATE
  const houseLevel = Math.max(1, home.levels.house ?? 1)
  const nodes = state.nodes ?? NO_DECO
  const winterNodes = state.winter?.nodes ?? NO_DECO
  /** Ресурси острова, на якому ти зараз. */
  const sceneNodes = wild ? winterNodes : nodes
  const tools = state.tools ?? {}
  // Посаджені дерева ростуть самі: стадія — з часу посадки; рядок змінюється лише разом зі стадією,
  // тож острів перебудовується раз на стадію, а не щокілька секунд.
  // Гевея — так само, плюс «f», коли в чашці є каучук (інший спрайт).
  const treeStages = rawDeco
    .filter((d) => d.k === TREE_KIND || d.k === RUBBER_KIND)
    .map((d) =>
      d.k === TREE_KIND ? String(treeStage(catalog.trees, d, now)) : `${treeStage(catalog.rubber, d, now)}${rubberNow(catalog.rubber, d, now).ready > 0 ? 'f' : ''}`
    )
    .join(',')
  const deco = useMemo(() => {
    if (!treeStages) return rawDeco
    const g = treeStages.split(',')
    const last = (catalog.trees?.stages ?? 3) - 1
    let i = 0
    return rawDeco.map((d) => {
      if (d.k === TREE_KIND) return { ...d, g: Math.min(last, parseInt(g[i++], 10)) }
      if (d.k === RUBBER_KIND) {
        const v = g[i++]
        return { ...d, g: parseInt(v, 10), full: v.endsWith('f') }
      }
      return d
    })
  }, [rawDeco, treeStages, catalog.trees])
  /** Посаджене дерево вже доросло — сервер має поставити на його місце справжнє. */
  const ripe = rawDeco.some((d) => d.k === TREE_KIND && treeStage(catalog.trees, d, now) >= (catalog.trees?.stages ?? 3))
  /** Електрика острова: скільки Вт дають вітряки (server/src/game/power.js). */
  const power = state.power ?? { gen: 0, use: 0, sources: 0 }
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

  /**
   * Напис у світі: спливає над мандрівником, грядкою, псом чи ресурсом і тане.
   * Поки рушій не готовий — звичайний напис на місці дотику.
   */
  const say = (text, at = 'hero', kind = 'info', burst = null) => {
    if (engine.current) engine.current.floatText(text, { at, kind, burst })
    else toast(text, kind)
  }

  const collecting = useRef(false)
  const collect = async () => {
    if (collecting.current) return
    collecting.current = true
    const res = await act('POST', '/home/collect')
    collecting.current = false
    if (!res) return
    haptic('success')
    say(shortGot(items, res.got), 'hero', 'good', 'coins')
  }

  /** Скриня на березі: тап — і дарунок твій, без вікон. */
  const claiming = useRef(false)
  const claimDaily = async () => {
    const rewards = catalog.config.dailyRewards
    if (state.daily.claimedToday) {
      say(`Завтра: +${rewards[(state.daily.todayIndex + 1) % rewards.length]} ✨`, 'chest', 'calm')
      return
    }
    if (claiming.current) return
    claiming.current = true
    const res = await act('POST', '/daily/claim')
    claiming.current = false
    if (!res) return
    haptic('success')
    say(`+${res.reward} ✨`, 'chest', 'good', 'coins')
    setTimeout(() => say(`🔥 ${res.streak} ${res.streak === 1 ? 'день' : 'дні(в)'} поспіль`, 'chest', 'calm'), 300)
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
    if (!v) return
    const c = chain.current
    if (c && v.action !== c.kind) {
      // Обходимо грядки, а ця вже не потребує тієї ж дії (пішов дощ, хтось зібрав) — до наступної.
      if (c.target === i) setTimeout(() => handlers.current.chainNext(), 0)
      return
    }
    if (v.action === 'wait') {
      say(v.nextAt ? `⏳ ще ${shortDuration(v.nextAt - now)}` : '⏳ Росте', `plot:${i}`, 'calm')
      return
    }
    let body
    const kind = v.action
    let crop = null
    if (kind === 'plant') {
      crop = seedToPlant()
      if (!crop) {
        // Немає насіння — одразу до крамнички, без зайвих повідомлень.
        haptic('warning')
        setFarmTab('seeds')
        return
      }
      body = { crop: crop.id }
    }
    working.current.add(i)
    engine.current?.farmFx(i, kind)
    const res = await act('POST', `/farm/${i}/${kind}`, body)
    working.current.delete(i)
    if (!res) {
      stopChain()
      return
    }
    haptic(kind === 'harvest' ? 'success' : 'light')
    if (kind === 'harvest') say(shortGot(items, res.got), `plot:${i}`, 'good')
    else if (kind === 'plant') say(`🌱 ${crop.name}`, `plot:${i}`, 'good')
    // Обхід усіх грядок — до наступної, щойно прийде свіжий стан.
    if (chain.current) setTimeout(() => handlers.current.chainNext(), 200)
  }

  /** Почати обхід: та сама дія на всіх грядках, від найближчої. */
  const startChain = (kind) => {
    haptic('medium')
    chain.current = { kind, target: null, timer: 0 }
    setChainKind(kind)
    chainNext()
  }
  const stopChain = (msg) => {
    if (!chain.current) return
    clearTimeout(chain.current.timer)
    chain.current = null
    setChainKind(null)
    if (msg) say(msg, 'hero', 'good')
  }
  /** Наступна найближча грядка з тією ж дією (або кінець обходу). */
  const chainNext = () => {
    const c = chain.current
    if (!c) return
    clearTimeout(c.timer)
    if (c.kind === 'plant' && !seedToPlant()) return stopChain('Насіння скінчилось 🌱')
    const me = engine.current?.heroPos()
    const todo = fieldView(catalog, state.farm, now).filter((v) => v.action === c.kind && !working.current.has(v.i))
    if (!me || !todo.length) return stopChain('✓ Готово!')
    const dist = (v) => Math.hypot(v.x - me.x, v.y - 8 - me.y)
    const next = todo.reduce((a, b) => (dist(b) < dist(a) ? b : a))
    c.target = next.i
    // Не дійшов (шлях перекрито) — не чекаємо вічно.
    c.timer = setTimeout(() => chain.current === c && c.target === next.i && stopChain(), 10000)
    if (!engine.current.goToPlot(next.i)) stopChain()
  }

  /** Викопати рослину: перший тап — «Точно?» на кнопці, другий — викопує. */
  const clearPlot = async (i) => {
    if (armed !== `plot:${i}`) return arm(`plot:${i}`)
    setArmed(null)
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
    const n = sceneNodes.find((x) => x.id === id)
    return n ? catalog.nodes?.find((d) => d.id === n.k) : null
  }

  /** Зрубати / розбити / підняти: кілька замахів у рушії, потім сервер видає здобич. */
  const gather = async (id) => {
    const def = nodeDef(id)
    if (!def || gathering.current || gathered.current.has(id)) return
    const tool = toolFor(def)
    if (!tool.ok) {
      haptic('warning')
      say(`Потрібна ${tool.need.toLowerCase()} 🪚`, `node:${id}`, 'error')
      return
    }
    gathering.current = true
    const hits = Math.max(1, def.hits - (tool.tier > def.tier ? 1 : 0))
    await engine.current?.gatherFx(id, hits, tool.kind)
    const res = await act('POST', `/${wild ? 'winter' : 'island'}/nodes/${id}/gather`)
    gathering.current = false
    if (!res) return
    gathered.current.add(id)
    haptic('success')
    const got = shortGot(items, res.got)
    // Гроші й срібло з-під снігу — з іскрами.
    const rare = Object.keys(res.got ?? {}).some((k) => RARE.has(k))
    say(got || 'Нічого цікавого', 'hero', got ? 'good' : 'calm', rare ? 'coins' : null)
  }

  /** Сісти в човен на Хуртовині й попливти додому — на рідний острів. */
  const sailHome = () => {
    haptic('medium')
    switchTab('home')
    go('walk')
  }

  /* ───── Пси ───── */

  const petDog = (dog) => {
    engine.current?.petDog(dog.id)
    haptic('success')
    say(pickOne(DOG_PETS)(dog.name), `dog:${dog.id}`)
    // Дружба росте від першого погладжування за день.
    if (!state.dogs?.[dog.id]?.pettedToday) act('POST', `/dogs/${dog.id}/pet`, {}, { silent: true })
  }

  const commandDog = async (id, mode) => {
    const dog = dogById(id)
    const cmd = engine.current?.commandDog(id, mode)
    if (!dog || !cmd) return
    haptic('medium')
    setDogSheet(null)
    const text = { follow: '🐾 Біжу!', sit: '🪑 Сиджу тут' }[mode] ?? (scene === 'home' ? '🏠 На лежанку' : '🏠 Додому!')
    say(text, `dog:${id}`)
    await act('POST', `/dogs/${id}/command`, cmd)
  }

  const feedDog = async (id, itemId) => {
    const dog = dogById(id)
    const res = await act('POST', `/dogs/${id}/feed`, { item: itemId })
    if (!res || !dog) return
    setDogSheet(null)
    engine.current?.feedDog(id)
    haptic('success')
    say(`${pickOne(FEED_TEXT)(dog.name)}${res.favorite ? ' ⭐' : ''}`, `dog:${id}`, 'good')
    if (res.gift) setTimeout(() => say(`🎁 ${shortGot(items, res.gift)}`, `dog:${id}`, 'good', 'coins'), 1900)
  }

  /** Свисток: усі пси, що сидять чи чекають удома, біжать до тебе. */
  const whistle = async () => {
    const away = DOG_IDS.filter((id) => (state.dogs?.[id]?.mode ?? 'follow') !== 'follow')
    if (!away.length) {
      say('🐾 Пси й так поруч', 'hero', 'calm')
      return
    }
    haptic('medium')
    say('📯 Фіть-фіть!')
    for (const id of away) {
      const cmd = engine.current?.commandDog(id, 'follow')
      if (cmd) await act('POST', `/dogs/${id}/command`, cmd, { silent: true })
    }
  }

  /** Вітряк: скільки дає він і весь острів — напис над ним. */
  const windmillInfo = (id) => {
    const watts = catalog.decor?.find((d) => d.id === 'windmill')?.watts ?? 40
    say(power.sources > 1 ? `⚡ ${watts} Вт · острів: ${power.gen} Вт` : `⚡ ${watts} Вт електрики`, id, 'good')
  }
  /** Посаджене дерево: скільки ще рости й що з нього буде. */
  const treeInfo = (id) => {
    const d = deco.find((x) => x.id === id.slice(5))
    if (!d) return
    const left = (d.t ?? 0) + (catalog.trees?.growMin ?? 40) * 60_000 - now
    const name = TREE_NAMES[d.sp] ?? 'дерево'
    say(left > 0 ? `🌱 ${d.g >= 2 ? name[0].toUpperCase() + name.slice(1) : 'Паросток'} · ще ${shortDuration(left)}` : `🌳 Ось-ось виросте ${name}!`, id, 'calm', 'leaves')
  }

  /** Сітка сама ловить дари моря: напис — скільки до наступного улову і скільки їх за один раз. */
  const netInfo = (id) => {
    const d = deco.find((x) => x.id === id.slice(4))
    if (!d) return
    const every = (catalog.nets?.everyMin ?? 15) * 60_000
    const left = d.nc ? every - ((now - d.nc) % every) : every
    say(`🥅 Сама ловить дари моря · наступний улов ${shortDuration(left)}`, id, 'calm', 'water')
  }

  /** Гевея: доросла — злити каучук із чашки; ні — скільки ще чекати. */
  const collectingRubber = useRef(false)
  const rubberAction = async (id) => {
    const d = deco.find((x) => x.id === id.slice(7))
    if (!d || collectingRubber.current) return
    const v = rubberNow(catalog.rubber, d, now)
    if (!v.grown) return say(`🌱 Гевея росте · ще ${shortDuration(v.nextIn)}`, id, 'calm', 'leaves')
    if (v.ready < 1) return say(`⏳ Латекс капає · ще ${shortDuration(v.nextIn)}`, id, 'calm')
    collectingRubber.current = true
    const res = await act('POST', `/home/rubber/${d.id}/collect`)
    collectingRubber.current = false
    if (!res) return
    haptic('success')
    say(`${shortGot(items, res.got)}${v.ready >= v.cap ? ' · чашка була повна!' : ''}`, id, 'good', 'coins')
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
    else if (actOf(id) === 'windmill') windmillInfo(id)
    else if (actOf(id) === 'tree') treeInfo(id)
    else if (actOf(id) === 'rubber') rubberAction(id)
    else if (actOf(id) === 'net') netInfo(id)
    else if (id === 'house') goScene('home')
    else if (id === 'exit') goScene('island')
    else if (BUILDINGS.has(id)) setSheet(id)
    else if (id === 'chest') claimDaily()
    else if (id === 'sail_home') sailHome()
    else if (id === 'winter_sign') say('❄️ Острів Хуртовини. Копай замети лопатою 🪏 — під снігом трапляється всяке.', 'winter_sign', 'calm')
    else if (id === 'winter_fire') say(pickOne(WARM), 'hero', 'calm')
    else if (id === 'fishing') switchTab('fishing')
    else if (id === 'boat') switchTab('map')
    else if (actOf(id) === 'bed') say('😴 Сил додалось!', 'hero', 'calm')
    else if (actOf(id) === 'stove') switchTab('backpack') // готують рибу в рюкзаку
    else if (actOf(id) === 'shelf') switchTab('journal')
    else if (actOf(id) === 'closet') setCloset(true)
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
    if (!indoors && d.limit && deco.filter((x) => x.k === d.id).length >= d.limit) {
      haptic('warning')
      toast(`${d.emoji} Уже ${d.limit} — більше не треба`, 'error')
      return
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
    if (building && !ghost.uid && pos.x != null) say(`${def.emoji} ${def.name}!`, { x: pos.x, y: pos.y, h: 40 }, 'good', 'coins')
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

  // Розібрати будівлю чи грядку з урожаєм: перший тап — «Точно?» на кнопці, другий — прибирає.
  const remove = async () => {
    if (!sel || busy) return
    const item = sandbox.placed.find((x) => x.id === sel)
    const building = !indoors && sel.startsWith('b:') ? sel.slice(2) : null
    const bed = !indoors && sel.startsWith('bed:') ? sel.slice(4) : null
    if ((building || (bed && item?.crop)) && armed !== sel) return arm(sel)
    setArmed(null)
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
    if (Object.keys(refund).length) say(shortGot(items, refund), item?.x != null ? { x: item.x, y: item.y, h: 14 } : 'hero', 'good')
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
    say(`${def.emoji} Нова підлога!`, 'hero', 'good')
  }
  // Рушій показує приміряну підлогу або збережену.
  useEffect(() => {
    engine.current?.setFloor(floorTry ?? floor)
  }, [ready, floorTry, floor])

  const enterBuild = () => {
    haptic('medium')
    stopChain()
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
    handlers.current = { interact, collect, buildTap, chainNext }
  })

  // Усі повідомлення на острові (і помилки сервера) — написами над мандрівником, а не плашками.
  // Поки відкрита шторка чи будуєш — написи спливають там, де тапнув (острів тоді за шторкою чи не в фокусі).
  const overlayOpen = !!(sheet || farmTab || dogSheet || craft || closet || build || (home.reset && !resetSeen))
  const overlay = useRef(overlayOpen)
  useEffect(() => {
    overlay.current = overlayOpen
  })
  useEffect(() => {
    if (!ready) return
    setToastSink((text, kind) => {
      if (overlay.current || !engine.current) return false
      engine.current.floatText(text, { at: 'hero', kind: kind === 'error' ? 'error' : 'info' })
      return true
    })
    return () => setToastSink(null)
  }, [ready, setToastSink])
  // Пішов з острова чи почав будувати — обхід грядок зупиняється.
  useEffect(() => () => clearTimeout(chain.current?.timer), [])

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
        if (start !== 'island') walk.setScene(start)
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
    // start не змінюється, поки екран відкритий (інший острів — інший екран у навігації).
  }, [start])

  // Острів Хуртовини: замети, лід і хмиз.
  useEffect(() => {
    if (ready) engine.current?.setWinter({ nodes: winterNodes })
  }, [ready, winterNodes])

  // Посаджене дерево доросло — просимо свіжий стан: сервер уже поставить на його місці справжнє дерево.
  // Не частіше, ніж раз на 10 с (годинник телефона може трохи випереджати серверний).
  const ripeAsked = useRef(0)
  useEffect(() => {
    if (!ready || !ripe || Date.now() - ripeAsked.current < 10_000) return
    ripeAsked.current = Date.now()
    act('GET', '/state', undefined, { silent: true })
  }, [ready, ripe, now, act])

  // Рівні будівель, скриня й декор → що стоїть на острові.
  const chestOpen = state.daily.claimedToday
  useEffect(() => {
    engine.current?.setWorld({ home: { levels: home.levels, pos: home.pos ?? {} }, chestOpen, deco, interior, nodes })
  }, [ready, home.levels, home.pos, chestOpen, deco, interior, nodes])

  // Поле: що де росте (оновлюється й саме — волога грядка дорослішає без запитів).
  // need — значок над грядкою (💧 🧺 🌱): що їй треба, видно здалеку. 🌱 — лише якщо є що садити.
  const hasSeeds = ownedSeeds(catalog, state.inventory).length > 0
  const field = useMemo(() => fieldView(catalog, state.farm, now), [catalog, state.farm, now])
  const farmIcons = useMemo(
    () => field.map((v) => ({ ...v, need: v.action === 'wait' || (v.action === 'plant' && !hasSeeds) ? null : v.action })),
    [field, hasSeeds]
  )
  useEffect(() => {
    if (ready) engine.current?.setFarm(farmIcons)
  }, [ready, farmIcons])

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
  // Перевдягся в шафі — мандрівник у світі теж.
  useEffect(() => {
    if (ready) engine.current?.setOutfit(state.wear)
  }, [ready, state.wear])

  // Спільний острів: інші мешканці гуляють поруч (presence.js), а їхні зміни острова
  // підтягуються самі — тихим /state, не частіше ніж раз на 2 с.
  const shared = !!state.household?.shared
  const actRef = useRef(act)
  useEffect(() => {
    actRef.current = act
  }, [act])
  const [company, setCompany] = useState([]) // [{ id, name, scene }] — для значка 👥 угорі
  useEffect(() => {
    if (!ready || !shared) return
    let lastRefresh = 0
    let refreshing = false
    const presence = createPresence({
      initData: wa.initData,
      getSelf: () => engine.current?.selfState(),
      onPeers: (list, serverNow) => {
        engine.current?.setPeers(list, serverNow)
        const brief = list.map((q) => ({ id: q.id, name: q.name, scene: q.s?.at(-1)?.[3] ?? null }))
        setCompany((prev) => (JSON.stringify(prev) === JSON.stringify(brief) ? prev : brief))
      },
      onChanged: () => {
        const t = Date.now()
        if (refreshing || t - lastRefresh < 2000) return
        lastRefresh = t
        refreshing = true
        actRef.current('GET', '/state', undefined, { silent: true }).finally(() => {
          refreshing = false
        })
      },
      onOff: () => setCompany([]),
    })
    // Апку сховали — нас більше не видно; повернулись — знову на острові.
    const onVisible = () => (document.visibilityState === 'visible' ? presence.start() : presence.stop())
    onVisible()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      presence.stop()
    }
  }, [ready, shared, wa.initData])

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
  const plotV = nearPlot != null ? (field.find((v) => v.i === nearPlot) ?? null) : null
  const plotInfo = plotV ? plotSpot(catalog, state.farm, plotV, now) : null
  // Скільки грядок потребують того ж, що й ця: від двох — кнопка «Полити всі» / «Зібрати все».
  const sameCount = plotV && CHAIN[plotV.action] && (plotV.action !== 'plant' || hasSeeds) ? field.filter((v) => v.action === plotV.action).length : 0
  const seedNow = plotV?.action === 'plant' ? seedToPlant() : null
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
          : wild
            ? (WINTER_INTERACT.find((i) => i.id === near) ?? null)
            : islandSpot(catalog, near)
  const showSeeds = !build && !indoors && (plotV ? plotV.action === 'plant' || plotV.action === 'till' : actOf(near) === 'farmshop')
  const hasBench = deco.some((d) => d.k === 'workbench')
  const hint = build
    ? null
    : indoors
      ? interior.length
        ? null
        : 'Хата порожня — натисни 🔨 і постав, що хочеш.'
      : wild
        ? winterHint(tools)
        : survivalHint(state, hasBench, tools)
  /** «Назад»: з хати — надвір, з острова — туди, звідки прийшли. */
  const leave = () => {
    if (indoors) return goScene('island')
    haptic('light')
    back()
  }
  const dogInfo = nearDog ? state.dogs?.[nearDog.id] : null
  const building = catalog.buildings.find((b) => b.id === sheet)
  const ackReset = () => {
    setResetSeen(true)
    act('POST', '/home/reset/ack', {}, { silent: true })
  }

  return (
    // Повноекранний острів: полотно на весь екран, керування — поверх нього.
    // Висота полотна не залежить від панелей, тож камера не смикається, коли вони з'являються.
    <div className={`relative h-full w-full overflow-hidden ${wild ? 'bg-[#2d5f86]' : 'bg-[#3b7fd0]'}`}>
      {/* Будь-який дотик до острова під час обходу грядок — зупиняє обхід (гравець перехопив керування). */}
      <canvas ref={canvas} className="absolute inset-0 block h-full w-full touch-none" onPointerDown={() => stopChain()} />
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0f2a3d]/60 text-center">
          <motion.span className="text-4xl" animate={error ? {} : { y: [0, -6, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
            {error ? '🌫️' : '⛵'}
          </motion.span>
          <p className="px-6 text-sm text-cream">{error ?? (wild ? 'Пливемо до Хуртовини…' : 'Пристаємо до берега…')}</p>
        </div>
      )}

      {/* Верх: назад, інструменти (або лічильник у будівництві), погода й камера. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-2" style={{ paddingTop: SAFE_TOP }}>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <HudButton label={build ? '✓ Готово' : '←'} title={build ? 'Готово' : indoors ? 'Надвір' : 'Залишити острів'} onClick={build ? exitBuild : leave} wide={build} />
          {build ? (
            <span className="rounded-sm bg-black/45 px-2 py-1 font-pixel text-[9px] text-cream">
              {indoors ? `РЕЧІ ${interior.length}/${catalog.interiorMax ?? 100}` : `ДЕКОР ${deco.length}/${catalog.decorMax ?? 150}`}
              {!indoors && power.gen > 0 && <span className="ml-2 text-[#ffe066]">⚡{power.gen} Вт</span>}
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
                {!wild && power.gen > 0 && <span className="text-[#ffe066]">⚡{power.gen}Вт</span>}
              </span>
            )
          )}
        </div>
        {ready && (
          <div className="pointer-events-auto flex gap-1">
            {!build && company.length > 0 && (
              <HudButton
                label={`👥${company.length}`}
                title="Хто ще на острові"
                onClick={() => say(company.map((c) => `${c.name} ${c.scene === 'home' ? 'у хатинці 🏠' : c.scene === 'winter' ? 'на Хуртовині ❄️' : 'надворі 🌿'}`).join(' · '), 'hero', 'calm')}
                wide
              />
            )}
            {!build && (
              <HudButton
                label={`${sky.part.emoji}${wild ? '❄️' : sky.weather.emoji}`}
                title={`${sky.part.name} · ${wild ? 'сніг' : sky.weather.name}`}
                onClick={() => say(skyHint(sky, wild), 'hero', 'calm')}
                wide
              />
            )}
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
              armed={!!sel && armed === sel}
            />
          </div>
        ) : (
          <>
            {showSeeds && !chainKind && (
              <div className="pointer-events-auto">
                <SeedBar seed={seedToPlant()?.id ?? null} setSeed={setSeed} onShop={() => setFarmTab('seeds')} />
              </div>
            )}
            {/* Обхід грядок: «Полити всі (5)» — або, поки триває, «Поливаю… ✕». */}
            {chainKind ? (
              <motion.button
                type="button"
                className="pointer-events-auto mx-auto flex items-center gap-2 rounded-sm bg-black/60 px-3 py-1.5 text-[13px] font-extrabold text-cream"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => stopChain()}
              >
                <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                  {CHAIN[chainKind].doing}… {field.filter((v) => v.action === chainKind).length}
                </motion.span>
                <span className="rounded-sm bg-white/15 px-1.5">✕ Стоп</span>
              </motion.button>
            ) : (
              sameCount > 1 && (
                <motion.div className="pointer-events-auto mx-auto" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <PxButton size="sm" variant={plotV.action === 'harvest' ? 'yellow' : plotV.action === 'water' ? 'blue' : 'green'} onClick={() => startChain(plotV.action)}>
                    {CHAIN[plotV.action].all} · {sameCount}
                  </PxButton>
                </motion.div>
              )
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
                        ) : plotV?.crop && !plotV.ready ? (
                          <Growth v={plotV} now={now} raining={sky.weather.id === 'rain' || sky.weather.id === 'storm'} />
                        ) : (
                          <p className={`truncate text-[11px] ${nodeTool && !nodeTool.ok ? 'text-[#ffb3a6]' : 'text-cream/75'}`}>
                            {plotInfo ? plotInfo.hint : nearNode ? nodeHint(items, nearNode, nodeTool) : spotHint(catalog, home.levels, chestOpen, spot.id)}
                          </p>
                        )}
                      </div>
                      {plotV ? (
                        <>
                          {plotV.crop && !plotV.ready && (
                            <PxButton
                              size="sm"
                              variant={armed === `plot:${plotV.i}` ? 'red' : 'paper'}
                              onClick={() => clearPlot(plotV.i)}
                              aria-label="Викопати"
                            >
                              {armed === `plot:${plotV.i}` ? 'Точно?' : '🗑'}
                            </PxButton>
                          )}
                          {plotV.action !== 'wait' && (
                            <PxButton
                              size="sm"
                              variant={plotV.action === 'harvest' ? 'yellow' : plotV.action === 'water' ? 'blue' : 'green'}
                              onClick={() => {
                                stopChain()
                                interact(spot.id)
                              }}
                            >
                              {plotV.action === 'plant' ? (seedNow ? `🌱 ${seedNow.name}` : '🛒 Насіння') : plotInfo.button}
                            </PxButton>
                          )}
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
                {wild ? (
                  <RoundButton label="⛵" title="Додому" variant="blue" disabled={!ready} onClick={sailHome} />
                ) : (
                  <RoundButton label="🔨" title={indoors ? 'Облаштувати' : 'Будувати'} variant="yellow" disabled={!ready} onClick={enterBuild} />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <BuildingSheet building={building} onClose={() => setSheet(null)} />
      <FarmSheet tab={farmTab} setTab={setFarmTab} onClose={() => setFarmTab(null)} />
      <DogSheet dog={dogSheet ? dogById(dogSheet) : null} onClose={() => setDogSheet(null)} onCommand={commandDog} onFeed={feedDog} />
      <CraftSheet open={craft} onClose={() => setCraft(false)} />
      <ClosetSheet open={closet} onClose={() => setCloset(false)} onDressed={() => say(pickOne(DRESSED), 'hero', 'good')} />
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

function BuildPanel({ indoor, defs, placed, houseLevel, cat, setCat, pick, ghost, sel, busy, onChoose, onConfirm, onCancel, onMove, onRemove, armed, floor, floorTry, onFloor, onBuyFloor, onCancelFloor }) {
  const { catalog, state, items } = useGame()
  const decor = defs
  const defOf = (kind) => decor.find((d) => d.id === kind)
  const beds = bedCount(state.farm)
  const selItem = sel && placed.find((d) => d.id === sel)
  const active = ghost ? defOf(ghost.kind) : pick ? defOf(pick) : null
  const where = (d) => (indoor ? (d.wall ? 'на стіні, де повісити' : 'на підлозі, де поставити') : d.water ? 'у воді біля пляжу, куди закинути' : 'на острові, де поставити')

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
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-cream/85">
            Торкнись місця {where(active)} «{active.name}».
          </p>
          {active.hint && <p className="text-[10px] leading-tight text-cream/65">{active.hint}</p>}
        </div>
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
          {armed ? 'Точно?' : '🗑'}
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
            const count = d.limit ? placed.filter((x) => x.k === d.id).length : 0
            const full = (d.id === 'bed' && beds.used >= beds.max) || (d.limit > 0 && count >= d.limit)
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
                {d.limit > 0 && (
                  <span className="absolute top-0.5 right-1 font-pixel text-[9px] text-ink">
                    {count}/{d.limit}
                  </span>
                )}
                {d.watts > 0 && <span className="absolute top-0.5 left-1 font-pixel text-[8px] text-[#9a6a00]">⚡{d.watts}Вт</span>}
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
  const sprite = indoor ? INTERIOR_GEOM[kind]?.sprite : (geomOf(kind)?.icon ?? geomOf(kind)?.sprite)
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

/** Як росте рослина: смужка (стадії й поступ поточної) і скільки ще чекати — або що земля суха. */
function Growth({ v, now, raining }) {
  const ms = v.crop.stageMin * 60_000
  const part = v.nextAt ? Math.min(1, Math.max(0, 1 - (v.nextAt - now) / ms)) : 0
  const dry = v.action === 'water'
  return (
    <span className="mt-0.5 flex items-center gap-1.5">
      <Bar value={(v.stage + part) / v.crop.stages} tone={dry ? 'gold' : ''} className="h-2! flex-1" />
      <span className={`shrink-0 text-[11px] font-extrabold ${dry ? 'text-[#ffd27a]' : 'text-cream/80'}`}>
        {dry ? '💧 Суха — полий!' : v.nextAt ? `${v.auto ? '💦' : raining ? '🌧️' : '⏳'} ${shortDuration(v.nextAt - now)}` : '⏳'}
      </span>
    </span>
  )
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
  if (actOf(id) === 'windmill') return { id, label: 'Вітряк' }
  if (actOf(id) === 'tree') return { id, label: 'Посаджене дерево' }
  if (actOf(id) === 'rubber') return { id, label: 'Гевея' }
  if (actOf(id) === 'net') return { id, label: 'Сітка' }
  return INTERACT.find((i) => i.id === id) ?? null
}

/** Підказка біля ресурсу: що з нього буде або чого бракує. */
function nodeHint(items, def, tool) {
  if (!tool.ok) return `Потрібна ${tool.need.toLowerCase()} — зроби на верстаті`
  const name = (id) => itemOf(items, id).name.toLowerCase()
  if (def.finds) return `Під снігом: ${def.finds.slice(0, 3).map(name).join(', ')}…`
  return `Дасть: ${def.loot.map(name).join(', ')}`
}

/** Підказка на Хуртовині: без лопати замети не розкопати. */
function winterHint(tools) {
  if (!tools.shovel) return 'Замети копають лопатою 🪏 — зроби її вдома на верстаті 🪚. Хмиз можна зібрати й руками.'
  return null
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
  if (id === 'sail_home') return 'Попливти на рідний острів'
  if (id === 'winter_sign') return 'Що тут і як'
  if (id === 'winter_fire') return 'Тут тепло — можна відігріти руки'
  if (actOf(id) === 'farmshop') return 'Насіння, продаж урожаю й поради'
  if (actOf(id) === 'workbench') return 'Інструменти, дошки й дріт'
  if (actOf(id) === 'windmill') return 'Крутиться на вітрі — дає 40 Вт електрики'
  if (actOf(id) === 'tree') return 'Росте саме — згодом стане деревом'
  if (actOf(id) === 'rubber') return 'Каучукове дерево — 3 каучуку щогодини'
  if (actOf(id) === 'net') return 'Сама ловить дари моря; дрібниці на березі поруч — тапай і збирай'
  if (actOf(id) === 'bed') return 'Перина й вишита ковдра'
  if (actOf(id) === 'stove') return 'Готують рибу — у рюкзаку'
  if (actOf(id) === 'shelf') return 'Щоденник: Думосвіт, Літописець, Арки'
  if (actOf(id) === 'closet') return 'Перевдягтися, пошити чи купити одяг'
  if (id === 'chest') return chestOpen ? 'Сьогодні вже відкрито — повертайся завтра' : 'Щоденна нагорода чекає!'
  if (id === 'fishing') return 'Закинути вудку з краю причалу'
  if (id === 'boat') return 'Попливти до інших островів'
  const b = catalog.buildings.find((x) => x.id === id)
  const lvl = levels[id] ?? 0
  if (!lvl) return 'Порожня ділянка — можна збудувати'
  return lvl >= b.levels.length - 1 ? `Рівень ${lvl} · найвищий` : `Рівень ${lvl} · можна покращити`
}
