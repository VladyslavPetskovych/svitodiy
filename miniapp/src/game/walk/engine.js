import * as THREE from 'three'
import atlas from './atlas.json'
import homeAtlas from './home-atlas.json'
import decorAtlas from './home-decor.json'
import artVersion from './version.json'
import { createCameraRig } from './camera.js'
import { BUILDING_GEOM, DECO_GEOM, NODE_GEOM, SPRINKLER_R, decoFootprint, geomOf, snapDeco } from './decor.js'
import { DOGS, PET_RANGE } from './companion.js'
import { createDog } from './dog.js'
import rudkoMeta from './dog.json'
import sirkoMeta from './sirko.json'

const DOG_SHEETS = { dog: rudkoMeta, sirko: sirkoMeta }
import { beamTexture, blobTexture, bubbleTexture, createParticles, crispPixels, crispTexture, dropHeight, glowTexture, popScale, textTexture, waterMaterial } from './fx.js'
import { geometry } from './grid.js'
import { FLOOR, HOME_MAP, HOME_START, WALL_H, homePlacements } from './home.js'
import { DEFAULT_FLOOR, FLOOR_CELL, FLOOR_SHEET, floorRect } from './floors.js'
import { INTERIOR_GEOM, dogBedSpot, interiorFootprint, interiorInteract, interiorLights, interiorSize, snapInterior, wallRect, wallSpan } from './interior.js'
import { createInput } from './input.js'
import { HERO_CELL, HERO_FRAME, HERO_FRAMES, composeHero, heroFrameIndex, outfitKey, outfitOf } from './outfit.js'
import { CELL, INTERACT, LIGHTHOUSE_LAMP, MAP, PIER, SPOTS, START, placements, plotCenter, plotRect, walkGrid } from './layout.js'
import { FIXED_DT, PHYS, accelerate, createBody, followPath, move, teleport } from './physics.js'
import { createPeers } from './peers.js'

/**
 * Прогулянка островом і хатинкою на three.js.
 *
 * Світ — площина XZ у пікселях арту (X = x, Z = y мапи), тож координати декору, сітка
 * прохідності й сервер лишилися тими самими. Земля й підлога лежать пласко, а будівлі,
 * дерева й мандрівник — піксельні спрайти-білборди, що стоять на своєму якорі й дивляться
 * в камеру. Їх малюємо «художником» (від дальніх до ближніх), без запису глибини —
 * так виглядають точно як 2D-арт, але камеру можна обертати й наближати.
 *
 * Без React — екран IslandWalk лише створює рушій і передає йому стан гри.
 * Сцени: «island» (острів надворі) і «home» (кімната хатинки).
 */

const ASSETS = ['ground', 'foam', 'water', 'home', 'sprites', 'home-sprites', 'home-decor', 'home-walls', 'home-floors', 'hero-wear', ...Object.keys(DOG_SHEETS)]

/**
 * Аркуші спрайтів: острів (будівлі, декор, город, мандрівник) і окремо — хатинка зсередини
 * (усі home_*). tex — ключ текстури в assets; кожен кадр шукаємо в тому аркуші, де він є.
 */
const SHEETS = [
  { tex: 'sprites', size: atlas.size, frames: atlas.frames },
  { tex: 'home-sprites', size: homeAtlas.size, frames: homeAtlas.frames },
  { tex: 'home-decor', size: decorAtlas.size, frames: decorAtlas.frames },
]
/** Кадр за назвою разом з аркушем, у якому він лежить. */
function frameOf(name) {
  for (const sheet of SHEETS) {
    const f = sheet.frames[name]
    if (f) return { f, sheet }
  }
  return null
}

export function loadAssets() {
  const loader = new THREE.TextureLoader()
  return Promise.all(
    ASSETS.map((name) =>
      loader.loadAsync(`/game/walk/${name}.png?v=${artVersion.v}`).then(
        (tex) => [name, tex],
        () => {
          throw new Error(`Не вдалося завантажити ${name}.png`)
        }
      )
    )
  ).then((pairs) => {
    const a = Object.fromEntries(pairs)
    for (const tex of Object.values(a)) {
      tex.colorSpace = THREE.SRGBColorSpace
      // Лінійний фільтр + crispPixels у матеріалах: пікселі різкі, але не тремтять, коли камера пливе.
      crispTexture(tex)
    }
    // Альфа атласів — щоб тап по спрайту влучав лише в непрозорі пікселі.
    a.alpha = Object.fromEntries(SHEETS.map((sh) => [sh.tex, alphaOf(a[sh.tex].image)]))
    a.sheetAlpha = Object.fromEntries(Object.keys(DOG_SHEETS).map((k) => [k, alphaOf(a[k].image)]))
    a.foamFrames = Math.round(a.foam.image.height / MAP.h)
    return a
  })
}

function alphaOf(img) {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, c.width, c.height).data
}

/**
 * Де на мапі димарі й вогні — залежить від рівнів і декору гравця.
 * Кожен ефект прив'язаний до якоря спрайта (ax, ay), бо спрайт стоїть у 3D і обертається
 * разом із камерою: точку (x, y) з 2D-арту перераховуємо в простір цього спрайта.
 */
function effectsFor(home, deco) {
  const { levels } = home
  const h = SPOTS.house
  const w = home.pos?.workshop
  const l = home.pos?.lighthouse
  const at = (ax, ay, x, y, extra = {}) => ({ ax, ay, dx: x - ax, h: ay - y, ...extra })
  const smoke = [at(h.x, h.y, h.x + 21, h.y - 84)]
  const ws = BUILDING_GEOM.workshop
  if (w && levels.workshop >= ws.smokeLevel) smoke.push(at(w.x, w.y, w.x + ws.smoke[0], w.y - ws.smoke[1], { uid: 'b:workshop' }))
  const lights = []
  // Вікна хатинки (пікселі з house_N у sprites.png): світяться лише вночі.
  const house = Math.max(1, levels.house)
  const windows = [[-19, -23], ...(house >= 2 ? [[20, -23]] : []), ...(house >= 3 ? [[0.5, -54]] : [])]
  for (const [dx, dy] of windows) lights.push(at(h.x, h.y, h.x + dx, h.y + dy, { r: dy < -40 ? 8 : 10, warm: true, night: true, power: 0.5 }))
  const lamp = LIGHTHOUSE_LAMP[levels.lighthouse]
  if (lamp && l) lights.push(at(l.x, l.y, l.x + lamp[0], l.y + lamp[1], { r: 16 + levels.lighthouse * 6, beam: levels.lighthouse >= 3, uid: 'b:lighthouse' }))
  if (levels.pier >= 2) for (const dx of [-15, 15]) lights.push(at(PIER.x + dx, 372, PIER.x + dx, 357, { r: 9 }))
  const fires = []
  const sprays = []
  for (const d of deco) {
    const g = DECO_GEOM[d.k]
    if (g?.light) lights.push(at(d.x, d.y, d.x, d.y + g.light.dy, { r: g.light.r, uid: d.id, warm: g.fire, flicker: g.fire }))
    if (g?.fire) fires.push(at(d.x, d.y, d.x, d.y - 5, { uid: d.id }))
    if (g?.spray) sprays.push(at(d.x, d.y, d.x, d.y - 9, { uid: d.id }))
  }
  return { smoke, lights, fires, sprays }
}

/** Світло в хатинці — від речей, що його дають (піч, лампа на столі), де б вони не стояли. */
function homeEffects(interior) {
  return { smoke: [], lights: interiorLights(interior), fires: [] }
}

/** До якої будівлі / точки належить спрайт — для «попу» при покращенні. */
function keyOf(p) {
  if (p.plot != null) return `plot:${p.plot}`
  if (p.uid) return p.uid
  if (p.node) return `node:${p.node}`
  if (p.s.startsWith('chest')) return 'chest'
  if (p.s.startsWith('house_')) return 'house'
  return null
}

/** Поле: що лежить і росте на кожній грядці (з fieldView у src/game/farm.js). */
function farmPlacements(view) {
  const out = []
  for (const v of view ?? []) {
    // Грядка — це предмет пісочниці «bed»: її можна вибрати, перенести й прибрати.
    const bed = { plot: v.i, uid: `bed:${v.i}`, kind: 'bed', occupies: [plotRect(v)] }
    out.push({ s: v.tilled ? (v.wet ? 'soil_wet' : 'soil_dry') : 'plot_mark', x: v.x, y: v.y, layer: 'floor', soil: true, ...bed })
    if (v.crop) out.push({ s: `crop_${v.crop.id}_${Math.min(v.stage, v.crop.stages)}`, x: v.x, y: v.y - 3, layer: 'obj', plot: v.i, uid: bed.uid, kind: 'bed', crop: v.crop.id, ready: v.ready })
  }
  return out
}

/** Чи перетинаються прямокутники [x, y, w, h]. */
const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]

/** Що показати над мандрівником під час роботи на городі й добування. */
const TOOL_EMOJI = { till: '⛏️', plant: '🌱', water: '💧', harvest: '🧺', clear: '🧹', axe: '🪓', pickaxe: '⛏️', hand: '🤲' }
/** Значок над грядкою: що їй зараз треба (видно здалеку, не підходячи). */
const NEED_EMOJI = { water: '💧', harvest: '🧺', plant: '🌱', till: '⛏️' }
/** Колір спливаючого напису за видом події. */
const FLOAT_COLORS = { info: '#fff4dc', good: '#ffe27a', error: '#ff9d8c', calm: '#cfe8ff' }
/** Скільки написів одночасно — старші зникають, щоб острів не захаращувало. */
const FLOAT_MAX = 6
/** Чим сиплеться ресурс під час добування: тріски, листя чи кам'яний пил. */
const CHIPS = {
  oak: 'wood', birch: 'wood', pine: 'wood', driftwood: 'wood',
  bush: 'leaf', berry_bush: 'leaf', seaweed: 'leaf',
  rock: 'stone', boulder: 'stone', pebble: 'stone', shell: 'stone',
}
/** Будівлі, які гравець ставить сам — підписи для панелі дії рушій не знає, лише id. */
const PLACED_BUILDINGS = Object.keys(BUILDING_GEOM)

const SCENES = {
  island: { id: 'island', map: MAP, walk: atlas.walk, bg: 'ground', outdoor: true, spawn: { x: SPOTS.house.x, y: SPOTS.house.y + 12, dir: 'down' } },
  home: { id: 'home', map: HOME_MAP, walk: atlas.homeWalk, bg: 'home', outdoor: false, spawn: { ...HOME_START, dir: 'up' } },
}
for (const sc of Object.values(SCENES)) sc.geo = geometry(sc.walk, sc.map)

/** Суша острова, на якій можна будувати: з генератора, без мостків над водою. */
const land = walkGrid(atlas.walk, [])
/** Підлога хатинки, на якій можна ставити речі. */
const homeLand = walkGrid(atlas.homeWalk, [])

const HERO_SEQ = [1, 0, 2, 0]
const TAP_SLOP = 10 // CSS px: далі — це вже перетягування, а не тап

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} assets результат loadAssets()
 * @param {{ onNear: (id: string|null) => void, onInteract: (id: string) => void, onBubble: () => void,
 *   onBuildTap: (p: { x: number, y: number, uid: string|null }) => void }} cb
 */
export function createWalk(canvas, assets, cb) {
  /** Розміри кадру за назвою — з будь-якого аркуша. */
  const frames = new Proxy({}, { get: (_, name) => frameOf(name)?.f })
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene3 = new THREE.Scene()
  const rig = createCameraRig(1)
  const camera = rig.camera
  const input = createInput()
  const particles = createParticles()
  scene3.add(particles.points)

  /* ───── Спільні ресурси ───── */

  const geoCache = new Map()
  /** Площина спрайта з атласу, якір — низ по центру. flat — лежить на землі. */
  function spriteGeo(name, flat = false) {
    const key = flat ? `${name}#flat` : name
    let g = geoCache.get(key)
    if (g) return g
    const found = frameOf(name)
    if (!found) return null
    const { f, sheet } = found
    const { w: AW, h: AH } = sheet.size
    g = new THREE.PlaneGeometry(f.w, f.h)
    g.translate(0, f.h / 2, 0)
    const u0 = f.x / AW
    const u1 = (f.x + f.w) / AW
    const v1 = 1 - f.y / AH
    const v0 = 1 - (f.y + f.h) / AH
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2))
    if (flat) g.rotateX(-Math.PI / 2)
    geoCache.set(key, g)
    return g
  }
  const spriteMat = crispPixels(new THREE.MeshBasicMaterial({ map: assets.sprites, transparent: true, alphaTest: 0.5, depthWrite: false }))
  /** Матеріал на кожен аркуш: спрайт малюється тим, де лежить його кадр. */
  const sheetMats = Object.fromEntries(
    SHEETS.map((sh) => [sh.tex, sh.tex === 'sprites' ? spriteMat : crispPixels(new THREE.MeshBasicMaterial({ map: assets[sh.tex], transparent: true, alphaTest: 0.5, depthWrite: false }))])
  )
  const matOf = (name) => sheetMats[frameOf(name)?.sheet.tex] ?? spriteMat
  // Привид напівпрозорий, а alphaTest порівнює альфу вже з opacity — тож поріг майже нульовий
  // (альфа піксель-арту й так 0 або 1), інакше блідий привид зникав би повністю.
  const ghostMats = Object.fromEntries(
    Object.entries(sheetMats).map(([k, m]) => {
      const g = crispPixels(m.clone())
      g.alphaTest = 0.01
      return [k, g]
    })
  )
  const ghostMat = ghostMats.sprites
  const glowTex = glowTexture()
  const blobTex = blobTexture()
  const beamTex = beamTexture()
  const bubbleTex = new Map()
  const unitPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

  /* ───── Статичний світ: вода, земля, прибій, хмари ───── */

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
    waterMaterial(assets.water, assets.ground, MAP)
  )
  // На тій самій висоті, що й земля: інакше паралакс зсуває край відтінку на пів пікселя (видно «шов»).
  // Порядок шарів задає renderOrder, глибину ніхто не пише — z-конфлікту немає.
  water.position.set(MAP.w / 2, 0, MAP.h / 2)
  water.renderOrder = -30
  scene3.add(water)

  const groundMat = crispPixels(new THREE.MeshBasicMaterial({ map: assets.ground, transparent: true, depthWrite: false }))
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), groundMat)
  ground.renderOrder = -20
  scene3.add(ground)

  const foamTex = assets.foam.clone()
  foamTex.repeat.set(1, 1 / assets.foamFrames)
  foamTex.needsUpdate = true
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.w, MAP.h).rotateX(-Math.PI / 2),
    crispPixels(new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false }))
  )
  foam.position.set(MAP.w / 2, 0.05, MAP.h / 2)
  foam.renderOrder = -19
  scene3.add(foam)

  /* ───── Стіни хати: вертикальні площини довкола підлоги ─────
   * Аркуш home-walls.png (прямокутники — homeAtlas.walls). n — нормаль усередину кімнати:
   * стіну, з-за якої дивиться камера (передню), ховаємо (розріз, як у ляльковому будиночку), тож
   * завжди видно, що всередині. Речі на стінах (layer 'wall') ховаються разом зі стіною.
   */
  const wallMat = crispPixels(new THREE.MeshBasicMaterial({ map: assets['home-walls'], transparent: true, alphaTest: 0.5, depthWrite: false }))
  const WS = homeAtlas.walls
  const midX = (FLOOR.x0 + FLOOR.x1) / 2
  const midY = (FLOOR.y0 + FLOOR.y1) / 2
  const walls = [
    { id: 'back', at: [midX, FLOOR.y0], rot: 0, n: [0, 1] },
    { id: 'front', at: [midX, FLOOR.y1], rot: Math.PI, n: [0, -1] },
    { id: 'left', at: [FLOOR.x0, midY], rot: Math.PI / 2, n: [1, 0] },
    { id: 'right', at: [FLOOR.x1, midY], rot: -Math.PI / 2, n: [-1, 0] },
  ].map((w) => {
    const r = WS[w.id]
    const g = new THREE.PlaneGeometry(r.w, r.h)
    g.translate(0, r.h / 2, 0)
    const [u0, u1, v1, v0] = [r.x / WS.size.w, (r.x + r.w) / WS.size.w, 1 - r.y / WS.size.h, 1 - (r.y + r.h) / WS.size.h]
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2))
    const mesh = new THREE.Mesh(g, wallMat)
    mesh.position.set(w.at[0], 0, w.at[1])
    mesh.rotation.y = w.rot
    mesh.renderOrder = -5
    mesh.visible = false
    scene3.add(mesh)
    return { ...w, mesh }
  })
  /** Яка стіна зараз видна (камера всередині її півпростору). */
  const wallShown = { back: false, front: false, left: false, right: false }
  function updateWalls() {
    for (const w of walls) {
      const inside = !scene.outdoor && (camera.position.x - w.at[0]) * w.n[0] + (camera.position.z - w.at[1]) * w.n[1] > 0
      w.mesh.visible = inside
      wallShown[w.id] = inside
    }
  }
  /** Куди на видимій стіні дивиться промінь (після rayFrom): { wall, at, h } або null. */
  function wallHit() {
    const h = raycaster.intersectObjects(walls.filter((w) => w.mesh.visible && w.id !== 'front').map((w) => w.mesh), false)[0]
    if (!h) return null
    const id = walls.find((w) => w.mesh === h.object).id
    return { wall: id, at: id === 'back' ? h.point.x : h.point.z, h: h.point.y }
  }
  function wallAt(clientX, clientY) {
    rayFrom(clientX, clientY)
    return wallHit()
  }

  /* ───── Підлога хати: вибраний візерунок і колір з аркуша home-floors.png поверх фону кімнати ───── */
  const floorGeo = new THREE.PlaneGeometry(FLOOR_CELL.w, FLOOR_CELL.h).rotateX(-Math.PI / 2)
  const floorMesh = new THREE.Mesh(
    floorGeo,
    crispPixels(new THREE.MeshBasicMaterial({ map: assets['home-floors'], transparent: true, depthWrite: false }))
  )
  floorMesh.position.set((FLOOR.x0 + FLOOR.x1) / 2, 0, (FLOOR.y0 + FLOOR.y1) / 2)
  floorMesh.renderOrder = -18
  floorMesh.visible = false
  scene3.add(floorMesh)
  let floorShown = null
  /** Показати підлогу { p, c } (і для прев'ю в пісочниці — до покупки). */
  function showFloor(f) {
    const r = floorRect(f ?? DEFAULT_FLOOR)
    const key = `${r.x},${r.y}`
    if (key === floorShown) return
    floorShown = key
    const { w: SW, h: SH } = FLOOR_SHEET
    const [u0, u1, v1, v0] = [r.x / SW, (r.x + r.w) / SW, 1 - r.y / SH, 1 - (r.y + r.h) / SH]
    floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2))
  }
  showFloor(DEFAULT_FLOOR)

  /** Поставити річ на стіну: трохи перед площиною стіни, обличчям у кімнату. */
  function mountOnWall(p, mesh) {
    const lift = 0.3
    if (p.wall === 'back') mesh.position.set(p.at, p.h, FLOOR.y0 + lift)
    else if (p.wall === 'left') mesh.position.set(FLOOR.x0 + lift, p.h, p.at)
    else mesh.position.set(FLOOR.x1 - lift, p.h, p.at)
    mesh.rotation.set(0, walls.find((w) => w.id === p.wall).rot, 0)
    mesh.renderOrder = -4
  }

  const cloudMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x0a1e32, transparent: true, opacity: 0.12, depthWrite: false })
  const clouds = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(unitPlane, cloudMat)
    m.scale.set(140, 1, 140)
    m.renderOrder = -6
    scene3.add(m)
    return m
  })

  /* ───── Світло: карта освітлення ─────
   * Кожен кадр спершу малюємо світло в маленьку текстуру (у LIGHT_DOWN разів менша за кадр —
   * світло м'яке, різниці не видно, а пікселів у 16 разів менше): заливаємо її кольором неба
   * (ambient), а зверху додаємо плями від ламп — на підлозі, на стінах і «об'єм» довкола самої
   * лампи (він освітлює меблі, мандрівника й псів поруч). Потім один повноекранний квад множить
   * на цю карту все, що намальовано до нього, — тож лампа справді освітлює кімнату довкола,
   * а не лише світиться сама. Значення в карті — половинні (0…1 ↔ 0…2): так світло може не лише
   * затемнювати, а й висвітлювати, і для цього вистачає звичайної 8-бітної текстури (працює всюди).
   */
  const LIGHT_DOWN = 4
  const lightRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false })
  const lightScene = new THREE.Scene()
  const lightVert = /* glsl */ `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
  // Плавний спад до краю (1 − d²)²: яскраво біля лампи, без різкої межі.
  const lightFrag = /* glsl */ `varying vec2 vUv; uniform vec3 color;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float d = dot(p, p);
      if (d >= 1.0) discard;
      float f = 1.0 - d;
      gl_FragColor = vec4(color * (f * f * 0.5), 1.0);
    }`
  const lightMat = () =>
    new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Vector3() } },
      vertexShader: lightVert,
      fragmentShader: lightFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  const lightQuad = new THREE.PlaneGeometry(1, 1)
  /** Колір світла лампи для карти — сирі значення hex (як і колір неба), без перетворень простору кольорів. */
  const lightTone = (l) => {
    const n = parseInt((l.color ?? (l.warm ? '#ffd2a0' : '#ffeeb8')).slice(1), 16)
    return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
  }
  const ambient = new THREE.Color()
  const savedClear = new THREE.Color()

  /* ───── Небо: колір доби й погоди поверх світу (sky.js) ─────
   * Повноекранний квад множить усе, що намальовано до нього (renderOrder ≤ 2: земля, спрайти,
   * мандрівник), на карту світла: колір неба плюс лампи. Ореоли вогнів (6), вогонь і бульбашки
   * малюються пізніше — тож уночі вони яскраві на темному тлі. Другий квад — серпанок туману
   * й спалах блискавки.
   */
  const screenQuad = new THREE.PlaneGeometry(2, 2)
  const screenVert = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`
  // Змішування dst·src + src·dst = 2·src·dst — половинні значення карти стають множником 0…2.
  // (Значення в карті понад 1 впираються в межу 8 біт; «коліно» нижче стискає їх ще до того.)
  const tintMat = new THREE.ShaderMaterial({
    uniforms: { lightMap: { value: lightRT.texture }, res: { value: new THREE.Vector2(1, 1) } },
    vertexShader: screenVert,
    fragmentShader: /* glsl */ `uniform sampler2D lightMap; uniform vec2 res;
      void main() {
        // М'яке «коліно» над 1: кілька ламп поруч не випалюють кімнату в біле (межа ~×1.45).
        vec3 L = texture2D(lightMap, gl_FragCoord.xy / res).rgb * 2.0;
        vec3 over = max(L - 1.0, 0.0);
        L = min(L, 1.0) + over / (1.0 + over * 1.8);
        gl_FragColor = vec4(L * 0.5, 1.0);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.SrcColorFactor,
  })
  const veilMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Vector3(1, 1, 1) }, alpha: { value: 0 } },
    vertexShader: screenVert,
    fragmentShader: /* glsl */ `uniform vec3 color; uniform float alpha; void main() { gl_FragColor = vec4(color, alpha); }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const tintQuad = new THREE.Mesh(screenQuad, tintMat)
  const veilQuad = new THREE.Mesh(screenQuad, veilMat)
  tintQuad.frustumCulled = veilQuad.frustumCulled = false
  tintQuad.renderOrder = 4
  veilQuad.renderOrder = 4.5
  scene3.add(tintQuad, veilQuad)
  const FOG = [0.86, 0.9, 0.94]
  const INDOOR_NIGHT = [0.68, 0.58, 0.6]
  /** Що показуємо зараз (плавно тягнеться до skyWant). */
  const skyNow = { tint: [1, 1, 1], night: 0, clouds: 0.12, rain: 0, fog: 0 }
  /** Чи небо щось фарбує (інакше, без ламп, карту світла можна не малювати зовсім). */
  let skyLit = false
  let skyWant = null
  let storm = false
  let flash = 0
  let nextFlash = 0
  let rainAcc = 0
  let flyAcc = 0

  /** Крок неба: колір, туман, блискавка, дощ і світлячки. */
  function skyStep(dt) {
    if (skyWant) {
      const k = 1 - Math.exp(-1.2 * dt)
      for (let i = 0; i < 3; i++) skyNow.tint[i] += (skyWant.tint[i] - skyNow.tint[i]) * k
      for (const f of ['night', 'clouds', 'rain', 'fog']) skyNow[f] += (skyWant[f] - skyNow[f]) * k
    }
    const out = scene.outdoor
    const n = skyNow.night
    // У хаті погоди не видно: уночі там тепло й притемнено, а піч і лампи світять.
    const tint = out ? [...skyNow.tint] : [0, 1, 2].map((i) => 1 + (INDOOR_NIGHT[i] - 1) * n)

    if (out && storm && t >= nextFlash) {
      flash = 1
      nextFlash = t + 6 + Math.random() * 12
    }
    flash = Math.max(0, flash - dt * 3)
    const fl = out ? flash * flash : 0
    for (let i = 0; i < 3; i++) tint[i] += (1 - tint[i]) * fl * 0.7

    // Тло карти світла (половинні значення — див. «Світло: карта освітлення»).
    ambient.setRGB(tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5, THREE.LinearSRGBColorSpace)
    skyLit = tint.some((v) => v < 0.995)
    const fogA = out ? skyNow.fog : 0
    const flashA = fl * 0.35
    if (flashA > fogA) veilMat.uniforms.color.value.set(1, 1, 1)
    else veilMat.uniforms.color.value.set(FOG[0] * tint[0], FOG[1] * tint[1], FOG[2] * tint[2])
    veilMat.uniforms.alpha.value = Math.max(fogA, flashA)
    veilQuad.visible = veilMat.uniforms.alpha.value > 0.005
    particles.setSky(tint)
    cloudMat.opacity = skyNow.clouds

    if (!out) return
    const spread = 1.1 * rig.zoom
    if (skyNow.rain > 0.02) {
      rainAcc += dt * 260 * skyNow.rain * spread * spread
      while (rainAcc >= 1) {
        rainAcc -= 1
        particles.rain(rig.focus.x + (Math.random() - 0.5) * 340 * spread, rig.focus.y + (Math.random() - 0.5) * 320 * spread)
      }
    }
    // Світлячки — тихими ночами, без дощу.
    if (n > 0.6 && skyNow.rain < 0.2) {
      flyAcc += dt * 3 * (n - 0.6) * 2.5
      while (flyAcc >= 1) {
        flyAcc -= 1
        particles.firefly(rig.focus.x + (Math.random() - 0.5) * 220, rig.focus.y + (Math.random() - 0.5) * 200)
      }
    }
  }

  /* ───── Стан ───── */

  let scene = SCENES.island
  let geo = scene.geo
  let interact = INTERACT
  let world = null // останні levels/chestOpen/deco — щоб перебудувати сцену при переході
  let list = []
  let grid = null
  let fx = { smoke: [], lights: [], fires: [] }
  const body = createBody(START.x, START.y)
  const hero = { dir: 'down', step: 0, moving: false, dustT: 0, x: START.x, y: START.y }
  let mode = 'walk'
  let ghost = null // { kind, x, y, uid?, ok, reason? }
  const ghostVis = { x: 0, y: 0, born: -1, badAt: -1 }
  let selected = null
  let bubbles = {}
  let path = []
  let goal = null
  let markerAt = null
  let near = null
  /** Куди дивиться мандрівник у світі (для грядки «перед собою», як у Stardew). */
  const face = { x: 0, y: 1 }
  let farmView = null
  let farmKey = ''
  let t = 0
  let acc = 0
  let lastRepath = 0
  const stuck = { x: 0, y: 0, t: 0 }
  /** Сік: uid / id будівлі → коли й наскільки «попнути» спрайт. */
  const juice = new Map()
  let prevDeco = null
  let prevLevels = null
  let prevPos = null
  let prevNodes = null
  let prevChest = null

  /* ───── Об'єкти сцени ───── */

  /** @type {{ p: object, mesh: THREE.Mesh, flat: boolean, key: string|null }[]} */
  let items = []
  let billboards = [] // меші для raycast
  let glows = []
  let emitters = []
  let beam = null

  // Мандрівник — своя текстура: 12 кадрів, зібраних із шарів одягу (outfit.js); перезбираємо, коли перевдягся.
  const heroCanvas = document.createElement('canvas')
  let heroOutfit = outfitOf(null)
  composeHero(assets['hero-wear'].image, heroOutfit, heroCanvas)
  const heroTex = crispTexture(new THREE.CanvasTexture(heroCanvas))
  heroTex.colorSpace = THREE.SRGBColorSpace
  const heroMat = crispPixels(new THREE.MeshBasicMaterial({ map: heroTex, transparent: true, alphaTest: 0.5, depthWrite: false }))
  const heroGeos = HERO_FRAMES.map((_, i) => {
    const { w, h } = HERO_FRAME
    const AW = HERO_CELL.w * HERO_FRAMES.length
    const AH = HERO_CELL.h
    const g = new THREE.PlaneGeometry(w, h)
    g.translate(0, h / 2, 0)
    const u0 = (i * HERO_CELL.w + 1) / AW
    const u1 = (i * HERO_CELL.w + 1 + w) / AW
    const v1 = 1 - 1 / AH
    const v0 = 1 - (1 + h) / AH
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2))
    return g
  })
  const heroMesh = new THREE.Mesh(heroGeos[0], heroMat)
  scene3.add(heroMesh)
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
  const heroBlob = new THREE.Mesh(unitPlane, blobMat)
  heroBlob.scale.set(13, 1, 8)
  heroBlob.renderOrder = -7
  scene3.add(heroBlob)

  // Інші мандрівники спільного острова (presence.js): ті самі кадри, свій одяг, ім'я над головою.
  const peers = createPeers({
    scene3,
    heroGeos,
    sheet: assets['hero-wear'].image,
    blobTex,
    unitPlane,
    seq: HERO_SEQ,
    maxSpeed: PHYS.maxSpeed,
    anchored: (e, out) => anchored(e, out),
    floatText: (text, o) => floatText(text, o),
  })

  // Пес-компаньйон: свій автомат станів, але та сама сітка, шляхи й фізика.
  // Пси-компаньйони: у кожного свій аркуш і характер, але спільні сітка, шляхи й фізика.
  const dogs = DOGS.map((def) => {
    const d = createDog({
      meta: DOG_SHEETS[def.sheet],
      trait: def.trait,
      texture: assets[def.sheet],
      alpha: assets.sheetAlpha[def.sheet],
      scene: scene3,
      canStand: (x, y) => !!grid && geo.canStand(grid, x, y),
      findPath: (from, to) => (grid ? geo.findPath(grid, from, to) : []),
      player: () => body,
      others: () => dogs.filter((o) => o.id !== def.id && o.sceneId === scene.id && o.visible).map((o) => o.body),
    })
    d.id = def.id
    d.index = DOGS.indexOf(def)
    d.sceneId = 'island' // у якій сцені пес зараз живе
    d.cfg = { mode: 'follow', sit: null } // команда з сервера (state.dogs)
    d.cfgKey = ''
    return d
  })
  let dogPlaced = false
  const dogDist = (dog) => Math.hypot(dog.body.x - body.x, dog.body.y - body.y)
  const dogById = (id) => dogs.find((d) => d.id === id)
  /** Пси, що зараз поруч у цій сцені (решта — в іншій: у хаті чи надворі). */
  const presentDogs = () => dogs.filter((d) => d.sceneId === scene.id && d.visible)
  const bedSpot = (dog) => {
    const b = dogBedSpot(world?.interior)
    return { x: b.x + (dog.index ? -8 : 6), y: b.y + dog.index * 3 }
  }
  const doorSpot = () => ({ x: SPOTS.house.x, y: SPOTS.house.y + 10 })
  const cfgKeyOf = (c) => `${c.mode}|${c.sit ? `${c.sit.scene}:${c.sit.x}:${c.sit.y}` : ''}`

  /**
   * Поставити пса туди, де йому належить бути за командою, з урахуванням поточної сцени.
   * fresh — щойно увійшли в сцену (пес з'являється одразу на місці), інакше — іде туди сам.
   */
  function applyDog(dog, fresh) {
    const { mode, sit } = dog.cfg
    const side = dog.index ? -14 : 14
    if (mode === 'follow') {
      if (dog.sceneId !== scene.id || !dog.visible || fresh) {
        // Прибігає з хати чи з місця, де сидів: з'являється біля дверей або біля тебе.
        const from =
          scene.outdoor && dog.sceneId === 'home' && !fresh ? doorSpot() : { x: body.x + side, y: body.y + (scene.outdoor ? 6 : -6) + dog.index * 4 }
        dog.place(from.x, from.y)
      }
      dog.sceneId = scene.id
      dog.setVisible(true)
      dog.follow()
      return
    }
    if (mode === 'sit' && sit) {
      const wasHere = dog.sceneId === scene.id && dog.visible && !fresh
      dog.sceneId = sit.scene
      if (sit.scene !== scene.id) {
        dog.setVisible(false)
        return
      }
      if (!wasHere) dog.place(sit.x, sit.y)
      dog.setVisible(true)
      dog.stay(sit.x, sit.y)
      return
    }
    // house: живе в хатинці, на лежанці біля печі.
    const bed = bedSpot(dog)
    if (scene.id === 'home') {
      if (dog.sceneId !== 'home' || !dog.visible || fresh) dog.place(bed.x, bed.y)
      dog.sceneId = 'home'
      dog.setVisible(true)
      dog.stay(bed.x, bed.y, true)
    } else if (dog.visible && dog.sceneId === scene.id && !fresh) {
      // Надворі сказали «Додому» — біжить до дверей і зникає в хаті.
      const door = doorSpot()
      dog.runTo(door.x, door.y, () => {
        if (dog.cfg.mode !== 'house' || scene.id !== 'island') return
        dog.sceneId = 'home'
        dog.setVisible(false)
        dog.place(bed.x, bed.y)
        dog.stay(bed.x, bed.y, true)
        particles.puff(door.x, door.y - 2, 6)
      })
    } else {
      dog.sceneId = 'home'
      dog.setVisible(false)
      dog.place(bed.x, bed.y)
      dog.stay(bed.x, bed.y, true)
    }
  }

  const markerMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9, depthWrite: false })
  const marker = new THREE.Mesh(new THREE.RingGeometry(3, 4.2, 20).rotateX(-Math.PI / 2), markerMat)
  marker.renderOrder = -8
  marker.visible = false
  scene3.add(marker)

  // Будівництво: сітка, рамки «ніжок» і привид предмета.
  const gridCanvas = document.createElement('canvas')
  gridCanvas.width = MAP.w
  gridCanvas.height = MAP.h
  const gridTex = new THREE.CanvasTexture(gridCanvas)
  gridTex.magFilter = THREE.NearestFilter
  gridTex.minFilter = THREE.NearestFilter
  gridTex.generateMipmaps = false
  const gridMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.w, MAP.h).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false })
  )
  gridMesh.position.set(MAP.w / 2, 0.1, MAP.h / 2)
  gridMesh.renderOrder = -9
  gridMesh.visible = false
  scene3.add(gridMesh)

  function makeFootprint() {
    const fill = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([-0.5, 0.5, 0.5, -0.5].map((x, i) => new THREE.Vector3(x, 0, [-0.5, -0.5, 0.5, 0.5][i]))),
      new THREE.LineBasicMaterial({ transparent: true, depthWrite: false })
    )
    const g = new THREE.Group()
    g.add(fill, line)
    fill.renderOrder = line.renderOrder = -8
    g.visible = false
    scene3.add(g)
    return {
      group: g,
      set([x, y, w, h], fillColor, fillA, lineColor, lineA) {
        g.visible = true
        g.position.set(x + w / 2, 0.15, y + h / 2)
        g.scale.set(w, 1, h)
        fill.material.color.set(fillColor)
        fill.material.opacity = fillA
        line.material.color.set(lineColor)
        line.material.opacity = lineA
      },
    }
  }
  const ghostFoot = makeFootprint()
  const selFoot = makeFootprint()
  const plotFoot = makeFootprint() // рамка грядки, з якою зараз працюватимеш
  // Скільки поливає дощувач — коло під привидом чи вибраним дощувачем.
  const reach = new THREE.Mesh(
    new THREE.RingGeometry(SPRINKLER_R - 1.2, SPRINKLER_R, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.8, depthWrite: false })
  )
  reach.renderOrder = -8
  reach.visible = false
  scene3.add(reach)

  // Над мандрівником — інструмент, яким щойно попрацював (мотика, лійка…).
  const toolSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }))
  toolSprite.scale.set(13, 14, 1)
  toolSprite.renderOrder = 8
  toolSprite.visible = false
  scene3.add(toolSprite)
  let toolAt = -1

  /* ───── Спливаючі написи й значки над грядками ───── */

  /** @type {{ s: THREE.Sprite, born: number, dur: number, at: string|object, key: string, pos: { x: number, y: number, h: number }, lift: number }[]} */
  const floats = []
  const bubbleOf = (emoji) => {
    if (!bubbleTex.has(emoji)) bubbleTex.set(emoji, bubbleTexture(emoji))
    return bubbleTex.get(emoji)
  }

  /** Висота спрайта рослини на грядці (щоб значок і напис були над нею, а не в ній). */
  const cropTop = (v) => (v.crop ? (frames[`crop_${v.crop.id}_${Math.min(v.stage, v.crop.stages)}`]?.h ?? 14) + 3 : 4)

  /**
   * Де в світі показати напис: над мандрівником, грядкою, псом, ресурсом, точкою взаємодії
   * чи просто { x, y, h }. null — такого вже немає (тоді — над мандрівником).
   */
  function anchorOf(at) {
    if (at && typeof at === 'object') return { x: at.x, y: at.y, h: at.h ?? 16 }
    if (typeof at === 'string') {
      if (at.startsWith('plot:')) {
        const v = plotById(Number(at.slice(5)))
        if (v) {
          const c = plotCenter(v)
          return { x: c.x, y: c.y, h: cropTop(v) + 4 }
        }
      } else if (at.startsWith('dog:')) {
        const d = dogById(at.slice(4))
        if (d?.visible && d.sceneId === scene.id) return { x: d.body.x, y: d.body.y, h: 22 }
      } else if (at.startsWith('node:')) {
        const n = world?.nodes.find((q) => q.id === at.slice(5))
        const it = list.find((p) => p.node === at.slice(5))
        if (n) return { x: n.x, y: n.y, h: (it ? frames[it.s]?.h : 0) || 18 }
      } else if (at !== 'hero') {
        const it = interact.find((i) => i.id === at)
        if (it) return { x: it.near[0], y: it.near[1] - 8, h: 24 }
      }
    }
    return { x: hero.x, y: hero.y, h: 30 }
  }

  /**
   * Напис, що спливає в світі й тане (замість вікон поверх екрана).
   * kind — 'info' | 'good' | 'error' | 'calm'; burst — сипнути частинками ('coins' | 'leaves' | 'water').
   */
  function floatText(text, { at = 'hero', kind = 'info', burst = null } = {}) {
    if (!text) return
    const { tex, w, h } = textTexture(text, FLOAT_COLORS[kind] ?? FLOAT_COLORS.info)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }))
    s.scale.set(w, h, 1)
    s.center.set(0.5, 0)
    s.renderOrder = 9
    scene3.add(s)
    const key = typeof at === 'string' ? at : `${at.x}:${at.y}`
    // Кілька написів над одним місцем — шикуються стовпчиком, а не накладаються.
    const lift = floats.filter((f) => f.key === key && t - f.born < 0.9).reduce((m, f) => Math.max(m, f.lift + f.s.scale.y + 1), 0)
    floats.push({ s, born: t, dur: Math.min(3.2, 1.5 + text.length * 0.03), at, key, pos: anchorOf(at), lift })
    while (floats.length > FLOAT_MAX) dropFloat(0)
    const p = floats.at(-1).pos
    if (burst === 'coins') {
      particles.dust(p.x, p.y + 2, 14, 1.1, [1, 0.84, 0.3])
      rig.addTrauma(0.05)
    } else if (burst === 'leaves') particles.leaves(p.x, p.y + 2, 6)
    else if (burst === 'water') particles.dust(p.x, p.y + 2, 10, 0.7, [0.55, 0.78, 0.98])
    if (kind === 'error') rig.addTrauma(0.03)
  }
  function dropFloat(k) {
    const f = floats[k]
    scene3.remove(f.s)
    f.s.material.map.dispose()
    f.s.material.dispose()
    floats.splice(k, 1)
  }
  function floatStep() {
    for (let k = floats.length - 1; k >= 0; k--) {
      const f = floats[k]
      const age = t - f.born
      if (age >= f.dur) {
        dropFloat(k)
        continue
      }
      // Над мандрівником і псом напис іде разом з ними; над грядкою — стоїть на місці.
      if (f.at === 'hero' || (typeof f.at === 'string' && f.at.startsWith('dog:'))) f.pos = anchorOf(f.at)
      const k01 = age / f.dur
      const rise = 1 - (1 - Math.min(1, age / 0.6)) ** 3
      anchored({ ax: f.pos.x, ay: f.pos.y, dx: 0, h: f.pos.h + f.lift + 3 + rise * 8 + k01 * 4 }, f.s.position)
      const [sx, sy] = popScale(age, 0.5)
      const base = f.s.material.map.image
      f.s.scale.set((base.width / 4) * sx, (base.height / 4) * sy, 1)
      f.s.material.opacity = age > f.dur - 0.45 ? (f.dur - age) / 0.45 : 1
      f.s.visible = scene.outdoor || !(typeof f.at === 'string' && (f.at.startsWith('plot:') || f.at.startsWith('node:')))
    }
  }

  /** Значки над грядками: 💧 суха, 🧺 достигло, 🌱 можна садити. */
  const plotIcons = new Map() // № грядки → { s, emoji, born }
  function syncPlotIcons() {
    const want = new Map((farmView ?? []).filter((v) => NEED_EMOJI[v.need]).map((v) => [v.i, NEED_EMOJI[v.need]]))
    for (const [i, ic] of plotIcons)
      if (want.get(i) !== ic.emoji) {
        scene3.remove(ic.s)
        ic.s.material.dispose()
        plotIcons.delete(i)
      }
    for (const [i, emoji] of want) {
      if (plotIcons.has(i)) continue
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleOf(emoji), transparent: true, depthWrite: false, depthTest: false }))
      s.center.set(0.5, 0)
      s.renderOrder = 7
      s.visible = false
      scene3.add(s)
      plotIcons.set(i, { s, emoji, born: t })
    }
  }
  function plotIconStep() {
    const show = scene.outdoor && mode === 'walk'
    for (const [i, ic] of plotIcons) {
      const v = show ? plotById(i) : null
      ic.s.visible = !!v
      if (!v) continue
      const c = plotCenter(v)
      anchored({ ax: c.x, ay: c.y, dx: 0, h: cropTop(v) + 2 + Math.sin(t * 3 + i) * 1.2 }, ic.s.position)
      const [sx, sy] = popScale(t - ic.born, 0.8)
      // Грядка, біля якої стоїш, — значок трохи більший: «ось вона».
      const big = near === `plot:${i}` ? 1.25 : 1
      ic.s.scale.set(8.5 * sx * big, 9.2 * sy * big, 1)
    }
  }

  const ghostMesh = new THREE.Mesh(spriteGeo('bush'), ghostMat)
  ghostMesh.visible = false
  scene3.add(ghostMesh)
  const ghostBlob = new THREE.Mesh(unitPlane, blobMat)
  ghostBlob.visible = false
  ghostBlob.renderOrder = -7
  scene3.add(ghostBlob)

  /** Бульбашки врожаю: id будівлі → спрайт. */
  const bubbleSprites = new Map()

  function clearItems() {
    for (const it of items) scene3.remove(it.mesh)
    for (const g of glows) {
      scene3.remove(g.sprite)
      g.sprite.material.dispose()
      for (const m of g.lit) {
        lightScene.remove(m)
        m.material.dispose()
      }
    }
    if (beam) {
      scene3.remove(beam)
      beam.geometry.dispose()
      beam.material.dispose()
      beam = null
    }
    items = []
    billboards = []
    glows = []
    emitters = []
  }

  function buildItems() {
    clearItems()
    for (const p of list) {
      const flat = p.layer === 'floor'
      const onWall = p.layer === 'wall'
      const g = spriteGeo(p.s, flat)
      if (!g) continue
      const mesh = new THREE.Mesh(g, matOf(p.s))
      mesh.position.set(p.x, flat ? 0.02 : 0, p.y)
      mesh.renderOrder = flat ? -10 : 0
      if (onWall) mountOnWall(p, mesh)
      const it = { p, mesh, flat, wall: onWall, key: keyOf(p) }
      mesh.userData.item = it
      items.push(it)
      if (!flat) billboards.push(mesh)
      scene3.add(mesh)
    }
    for (const l of fx.lights) {
      const hue = new THREE.Color(l.color ?? (l.warm ? '#ffaa50' : '#ffe68c'))
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hue, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      sprite.scale.set(l.r * 2, l.r * 2, 1)
      sprite.renderOrder = 6
      scene3.add(sprite)
      // Освітлення в карті світла: пляма на підлозі, «об'єм» довкола лампи, у хаті — ще й на стінах.
      const tone = lightTone(l)
      const mk = (geo) => {
        const m = new THREE.Mesh(geo, lightMat())
        m.frustumCulled = false
        lightScene.add(m)
        return m
      }
      const pool = mk(unitPlane)
      const volume = mk(lightQuad)
      const washes = scene.outdoor
        ? []
        : walls
            .filter((w) => w.id !== 'front')
            .map((w) => {
              const m = mk(lightQuad)
              m.rotation.y = w.rot
              return { w, m }
            })
      glows.push({ l, sprite, tone, pool, volume, washes, lit: [pool, volume, ...washes.map((x) => x.m)] })
      if (l.beam) {
        const bg = new THREE.BufferGeometry()
        bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 90, 0, -10, 90, 0, 10], 3))
        bg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 1, 0, 1, 1], 2))
        beam = new THREE.Mesh(
          bg,
          new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
        )
        beam.renderOrder = 6
        beam.userData.l = l
        scene3.add(beam)
      }
    }
    for (const s of fx.smoke) emitters.push({ e: s, kind: 'smoke', acc: Math.random() })
    for (const s of fx.sprays ?? []) emitters.push({ e: s, kind: 'spray', acc: Math.random() })
    for (const f of fx.fires) emitters.push({ e: f, kind: 'fire', acc: 0 })
    if (mode === 'build') drawGrid()
  }

  /** Сітка будівництва: ледь помітні клітинки суші, зайняті — червонуваті. */
  function drawGrid() {
    const ctx = gridCanvas.getContext('2d')
    ctx.clearRect(0, 0, MAP.w, MAP.h)
    const ground = scene.outdoor ? land : homeLand
    const busy = new Uint8Array(geo.cols * geo.rows)
    for (const p of list) for (const b of p.blocks ?? []) for (const c of geo.cellsOf(b)) if (c >= 0) busy[c] = 1
    for (let c = 0; c < ground.length; c++) {
      if (!ground[c]) continue
      const x = (c % geo.cols) * CELL
      const y = Math.floor(c / geo.cols) * CELL
      if (busy[c]) {
        ctx.fillStyle = 'rgba(255, 90, 70, 0.14)'
        ctx.fillRect(x, y, CELL, CELL)
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.13)'
      ctx.fillRect(x, y, CELL, 1)
      ctx.fillRect(x, y, 1, CELL)
    }
    gridTex.needsUpdate = true
  }

  /* ───── Перебудова сцени ───── */

  function rebuild() {
    if (!world) return
    const { home, chestOpen, deco, interior, nodes } = world
    if (scene.outdoor) {
      list = [...placements(home, chestOpen, deco, nodes), ...farmPlacements(farmView)]
      interact = islandInteract()
      fx = effectsFor(home, deco)
    } else {
      list = homePlacements(interior, INTERIOR_GEOM, interiorFootprint)
      interact = interiorInteract(interior)
      fx = homeEffects(interior)
    }
    grid = walkGrid(scene.walk, list)
    if (selected && !list.some((p) => p.uid === selected)) selected = null
    // Щось виросло чи стало просто під ногами — відступаємо на найближче вільне місце, а не до дверей.
    if (!geo.canStand(grid, body.x, body.y)) {
      const free = nearestFree(body.x, body.y)
      teleport(body, free.x, free.y)
    }
    buildItems()
  }

  /** Найближча точка, де можна стати (по спіралі клітинок), або точка входу в сцену. */
  function nearestFree(x, y) {
    for (let r = 1; r <= 8; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const px = x + dx * CELL
          const py = y + dy * CELL
          if (geo.canStand(grid, px, py)) return { x: px, y: py }
        }
    return scene.spawn
  }

  /**
   * Куди можна підійти на острові: те, що стоїть завжди, будівлі, верстат і комора гравця, ресурси.
   * Область тапу — прямокутник спрайта (тап по непрозорому пікселю дає точку арту в ньому).
   */
  function islandInteract() {
    const out = [...INTERACT]
    const boxOf = (p) => {
      const f = frames[p.s]
      return f ? [p.x - f.w / 2, p.y - f.h, f.w, f.h] : [p.x - 8, p.y - 16, 16, 16]
    }
    for (const p of list) {
      if (p.building) out.push({ id: p.building, near: [p.x, p.y + 10], r: 22, box: boxOf(p) })
      else if (p.uid && DECO_GEOM[p.kind]?.act) out.push({ id: `${DECO_GEOM[p.kind].act}:${p.uid}`, near: [p.x, p.y + 9], r: 16, box: boxOf(p) })
      else if (p.node) {
        const small = !NODE_GEOM[p.nodeKind]?.block
        out.push({ id: `node:${p.node}`, node: true, near: [p.x, p.y + (small ? 2 : 9)], r: small ? 12 : 16, box: grow(boxOf(p), small ? 4 : 0) })
      }
    }
    return out
  }

  /** Грядка за номером (з поточного поля) і грядка під точкою. */
  const plotById = (i) => farmView?.find((v) => v.i === i) ?? null
  function plotAt(x, y) {
    for (const v of farmView ?? []) {
      const [rx, ry, rw, rh] = plotRect(v)
      if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) return v.i
    }
    return -1
  }

  /** Сік на зміни світу: новий предмет падає й «попає», прибраний — пуф, покращена будівля — поп. */
  function celebrate(home, chestOpen, deco, nodes) {
    const { levels } = home
    if (!scene.outdoor) return
    if (prevNodes) {
      // Ресурс зник — розсипався трісками/листям; новий — виріс із землі.
      const now = new Set(nodes.map((n) => n.id))
      for (const [id, n] of prevNodes)
        if (!now.has(id)) {
          const chips = CHIPS[n.k]
          if (chips === 'leaf') particles.leaves(n.x, n.y - 6, 8)
          else particles.dust(n.x, n.y - 2, 12, 1, chips === 'wood' ? [0.62, 0.45, 0.28] : [0.66, 0.63, 0.58])
          particles.puff(n.x, n.y - 3, 6)
        }
      for (const n of nodes) if (!prevNodes.has(n.id)) juice.set(`node:${n.id}`, { t0: t, power: 0.8, drop: 0 })
    }
    prevNodes = new Map(nodes.map((n) => [n.id, n]))
    if (prevDeco) {
      const next = new Map(deco.map((d) => [d.id, d]))
      let kick = 0
      for (const d of deco) {
        const old = prevDeco.get(d.id)
        if (!old) {
          juice.set(d.id, { t0: t, power: 1, drop: DECO_GEOM[d.k]?.floor ? 0 : 10 })
          particles.dust(d.x, d.y, 10, 1)
          if (['wildflowers', 'flower_bed', 'sunflowers', 'bush', 'sapling', 'pine', 'pumpkins', 'hay'].includes(d.k)) particles.leaves(d.x, d.y - 4)
          kick = Math.max(kick, 0.14)
        } else if (old.x !== d.x || old.y !== d.y) {
          juice.set(d.id, { t0: t, power: 0.7, drop: DECO_GEOM[d.k]?.floor ? 0 : 6 })
          particles.dust(d.x, d.y, 8, 0.8)
          kick = Math.max(kick, 0.08)
        }
      }
      for (const [id, d] of prevDeco)
        if (!next.has(id)) {
          particles.puff(d.x, d.y - 3)
          kick = Math.max(kick, 0.06)
        }
      if (kick) rig.addTrauma(kick)
    }
    if (prevLevels)
      for (const id of Object.keys(levels)) {
        const s = home.pos?.[id] ?? SPOTS[id]
        const was = prevPos?.[id]
        const moved = s && was && (was.x !== s.x || was.y !== s.y)
        if (levels[id] !== prevLevels[id] || moved) {
          juice.set(PLACED_BUILDINGS.includes(id) ? `b:${id}` : id, { t0: t, power: moved ? 0.8 : 1.2, drop: moved || !prevLevels[id] ? 12 : 0 })
          if (s) particles.dust(s.x, s.y, 16, 2)
          rig.addTrauma(moved ? 0.12 : 0.25)
        } else if (prevLevels[id] > 0 && !levels[id] && was) {
          particles.puff(was.x, was.y - 8, 16)
          rig.addTrauma(0.1)
        }
      }
    prevPos = { ...home.pos }
    if (prevChest !== null && prevChest !== chestOpen) juice.set('chest', { t0: t, power: 1, drop: 0 })
    prevDeco = new Map(deco.map((d) => [d.id, d]))
    prevLevels = { ...levels }
    prevChest = chestOpen
  }

  let prevInterior = null
  /** Сік у хаті: нова річ «падає» й попає, пересунута — попає, прибрана — пуф. */
  function celebrateInterior(interior) {
    if (prevInterior && !scene.outdoor) {
      const next = new Map(interior.map((d) => [d.id, d]))
      for (const d of interior) {
        const old = prevInterior.get(d.id)
        const wallItem = INTERIOR_GEOM[d.k]?.layer === 'wall'
        if (!old) {
          juice.set(d.id, { t0: t, power: 1, drop: wallItem || INTERIOR_GEOM[d.k]?.layer === 'floor' ? 0 : 10 })
          if (!wallItem) particles.dust(d.x, d.y, 8, 0.8)
          rig.addTrauma(0.08)
        } else if (old.x !== d.x || old.y !== d.y || old.at !== d.at || old.h !== d.h || old.wall !== d.wall) juice.set(d.id, { t0: t, power: 0.7, drop: 0 })
      }
      for (const [id, d] of prevInterior) if (!next.has(id) && d.x != null) particles.puff(d.x, d.y - 3)
    }
    prevInterior = new Map(interior.map((d) => [d.id, d]))
  }

  /** Стан острова: { home: { levels, pos }, chestOpen, deco, interior, nodes }. */
  function setWorld({ home, chestOpen, deco = [], interior = [], nodes = [] }) {
    celebrate(home, chestOpen, deco, nodes)
    celebrateInterior(interior)
    world = { home, chestOpen, deco, interior, nodes }
    rebuild()
    if (!dogPlaced) {
      dogPlaced = true
      for (const d of dogs) applyDog(d, true)
    }
  }

  /** Поле змінилось (скопали, полили, виросло) — перебудувати й «попнути» змінені грядки. */
  function setFarm(view) {
    const key = JSON.stringify(view.map((v) => [v.i, v.x, v.y, v.auto, v.tilled, v.wet, v.crop?.id ?? null, v.stage, v.need ?? null]))
    if (key === farmKey) return
    const prev = farmView && new Map(farmView.map((v) => [v.i, v]))
    farmView = view
    farmKey = key
    syncPlotIcons()
    if (prev && scene.outdoor)
      for (const v of view) {
        const o = prev.get(v.i)
        if (!o) {
          // Нова ділянка під грядку.
          juice.set(`plot:${v.i}`, { t0: t, power: 0.8, drop: 0 })
          particles.dust(v.x, v.y - 4, 10, 1, [0.45, 0.3, 0.18])
          continue
        }
        if (o.x !== v.x || o.y !== v.y) juice.set(`plot:${v.i}`, { t0: t, power: 0.7, drop: 0 })
        const grew = o.crop && v.crop && v.stage > o.stage
        const planted = !o.crop && v.crop
        if (grew || planted || o.tilled !== v.tilled) juice.set(`plot:${v.i}`, { t0: t, power: grew ? 0.9 : 0.6, drop: 0 })
        if (grew) {
          const c = plotCenter(v)
          particles.leaves(c.x, c.y + 3, 4)
        }
      }
    if (world) rebuild()
  }

  function applySceneLook() {
    const outdoor = scene.outdoor
    water.visible = foam.visible = outdoor
    floorMesh.visible = !outdoor
    for (const c of clouds) c.visible = outdoor
    groundMat.map = assets[scene.bg]
    groundMat.needsUpdate = true
    ground.scale.set(scene.map.w, 1, scene.map.h)
    ground.position.set(scene.map.w / 2, 0, scene.map.h / 2)
    renderer.setClearColor(outdoor ? 0x3b7fd0 : 0x120c08)
    // Кімната менша за кадр — тримаємо її по центру; острів — з відступом від краю.
    rig.setBounds(scene.map.w, scene.map.h, outdoor ? 40 : 100)
  }

  /** Перейти в іншу сцену («island» / «home»): гравець стає біля входу. */
  function setScene(id) {
    const next = SCENES[id]
    if (!next || next === scene) return
    scene = next
    geo = scene.geo
    teleport(body, scene.spawn.x, scene.spawn.y)
    hero.dir = scene.spawn.dir
    path = []
    goal = null
    markerAt = null
    held = null
    input.clear()
    particles.clear()
    near = null
    cb.onNear(null)
    applySceneLook()
    rig.snap(body.x, body.y)
    rebuild()
    // Пси, що ходять слідом, заходять і виходять разом із тобою; решта — там, де їм сказали.
    for (const d of dogs) {
      if (d.cfg.mode === 'house') d.sceneId = 'home' // біг до дверей, а ти зайшов першим — він уже вдома
      applyDog(d, true)
    }
    for (const s of bubbleSprites.values()) s.visible = false
  }

  /* ───── Розмір ───── */

  function resize() {
    const r = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width))
    const h = Math.max(1, Math.round(r.height))
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w, h, false)
    rig.setAspect(w / h)
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    particles.setScale(size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))))
    lightRT.setSize(Math.max(1, Math.ceil(size.x / LIGHT_DOWN)), Math.max(1, Math.ceil(size.y / LIGHT_DOWN)))
    tintMat.uniforms.res.value.copy(size)
  }

  /* ───── Вибір того, що під пальцем ───── */

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hitPoint = new THREE.Vector3()

  function rayFrom(clientX, clientY) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
  }

  function groundAt(clientX, clientY) {
    rayFrom(clientX, clientY)
    return raycaster.ray.intersectPlane(groundPlane, hitPoint) ? { x: hitPoint.x, y: hitPoint.z } : null
  }

  /** Чи непрозорий піксель спрайта name під точкою UV (у його аркуші). */
  function opaque(name, uv) {
    const sheet = frameOf(name)?.sheet
    if (!sheet) return false
    const { w: AW, h: AH } = sheet.size
    const px = Math.min(AW - 1, Math.floor(uv.x * AW))
    const py = Math.min(AH - 1, Math.floor((1 - uv.y) * AH))
    return assets.alpha[sheet.tex][(py * AW + px) * 4 + 3] > 40
  }

  /**
   * Що під пальцем: бульбашка, спрайт (зверху того, що намальовано останнім) і точка на землі.
   * art — точка в координатах 2D-арту, куди «влучили б» у старому рушії: для спрайта це піксель
   * самого спрайта, тож старі прямокутники взаємодії (INTERACT.box) працюють без змін.
   */
  function pick(clientX, clientY) {
    rayFrom(clientX, clientY)
    raycaster.camera = camera
    const out = { bubble: false, dog: null, art: null, ground: null, item: null, plot: null }
    const visibleBubbles = [...bubbleSprites.values()].filter((s) => s.visible)
    if (visibleBubbles.length && raycaster.intersectObjects(visibleBubbles, false).length) out.bubble = true
    // Пес під пальцем — ближчий до камери, якщо влучили в кількох.
    if (mode === 'walk')
      out.dog = presentDogs().filter((d) => d.hit(raycaster)).sort((a, b) => camera.position.distanceToSquared(a.mesh.position) - camera.position.distanceToSquared(b.mesh.position))[0] ?? null
    let best = null
    let bestD = Infinity
    for (const h of raycaster.intersectObjects(billboards.filter((m) => m.visible), false)) {
      if (!h.uv || !opaque(h.object.userData.item.p.s, h.uv)) continue
      const d = camera.position.distanceToSquared(h.object.position)
      if (d < bestD) {
        best = h
        bestD = d
      }
    }
    if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) out.ground = { x: hitPoint.x, y: hitPoint.z }
    out.wall = scene.outdoor ? null : wallHit()
    // Грядка під пальцем, але її заступає вищий спрайт перед нею (будівля, дерево) — грядка важливіша:
    // вона маленька, а будівлю легко тапнути деінде.
    if (best && scene.outdoor && out.ground) {
      const i = plotAt(out.ground.x, out.ground.y)
      const front = best.object.userData.item
      if (i >= 0 && front.p.plot == null && front.p.y > plotById(i).y) {
        out.plot = i
        out.item = items.find((x) => x.flat && x.p.plot === i) ?? null
        return out
      }
    }
    if (best) {
      const it = best.object.userData.item
      const { f, sheet } = frameOf(it.p.s)
      const { w: AW, h: AH } = sheet.size
      out.item = it
      out.art = { x: it.p.x - f.w / 2 + (best.uv.x * AW - f.x), y: it.p.y - f.h + ((1 - best.uv.y) * AH - f.y) }
      if (it.p.plot != null) out.plot = it.p.plot
    } else if (out.ground) {
      if (scene.outdoor) {
        const i = plotAt(out.ground.x, out.ground.y)
        if (i >= 0) out.plot = i
      }
      // Пласкі предмети (настил, плита) — по прямокутнику на землі; спершу ближчі.
      const g = out.ground
      const flat = items
        .filter((it) => it.flat && it.mesh.visible && it.p.uid)
        .filter((it) => {
          const f = frames[it.p.s]
          return g.x >= it.p.x - f.w / 2 && g.x <= it.p.x + f.w / 2 && g.y >= it.p.y - f.h && g.y <= it.p.y + 1
        })
        .sort((a, b) => b.p.y - a.p.y)
      out.item = flat[0] ?? null
    }
    return out
  }

  /* ───── Пісочниця ───── */

  /**
   * Чи можна поставити декор: на суші, не на зайнятому місці
   * й так, щоб до всіх будівель, скрині й причалу лишався прохід.
   * @returns {{ ok: boolean, reason?: string }}
   */
  /** Чи можна поставити привид g — у поточній сцені. */
  function canPlaceGhost(g) {
    return scene.outdoor ? canPlace(g.kind, g.x, g.y, g.uid ?? null) : canPlaceHome(g)
  }

  /**
   * Хата: на стіну — у межах стіни й не на іншу річ; на підлогу — на підлогу, не на зайняте
   * (килим можна й під меблі), і так, щоб до дверей і речей з дією (ліжко, піч, полиця) лишався прохід.
   */
  function canPlaceHome(gh) {
    const g = INTERIOR_GEOM[gh.kind]
    if (!g) return { ok: false, reason: 'Невідома річ' }
    const others = list.filter((p) => !p.uid || p.uid !== gh.uid)
    if (g.layer === 'wall') {
      const [lo, hi] = wallSpan(gh.wall)
      const r = wallRect(gh.kind, gh.at, gh.h)
      if (r[0] < lo || r[0] + r[2] > hi || r[1] < 0 || r[1] + r[3] > WALL_H) return { ok: false, reason: 'Не влазить на стіну' }
      for (const p of others) {
        if (p.layer !== 'wall' || p.wall !== gh.wall || !p.kind) continue
        if (overlaps(r, wallRect(p.kind, p.at, p.h))) return { ok: false, reason: 'Тут уже щось висить' }
      }
      return { ok: true }
    }
    const fp = interiorFootprint(gh.kind, gh.x, gh.y)
    const cells = geo.cellsOf(fp)
    if (cells.some((c) => c < 0 || !homeLand[c])) return { ok: false, reason: 'Тут ставити не можна' }
    const busy = new Uint8Array(geo.cols * geo.rows)
    for (const p of others) {
      if (g.layer === 'floor') {
        // Килим — лише не на інший килим.
        if (p.layer === 'floor' && p.kind) for (const c of geo.cellsOf(interiorFootprint(p.kind, p.x, p.y))) if (c >= 0) busy[c] = 1
      } else for (const b of p.blocks ?? []) for (const c of geo.cellsOf(b)) if (c >= 0) busy[c] = 1
    }
    if (cells.some((c) => busy[c])) return { ok: false, reason: 'Місце зайняте' }
    if (g.layer === 'obj') {
      const test = walkGrid(atlas.homeWalk, [...others, { blocks: [fp] }])
      const me = geo.cellOf(body.x, body.y)
      if (!test[me]) return { ok: false, reason: 'Тут стоїть мандрівник' }
      // Мають лишитись досяжними двері й ті речі, до яких і зараз можна підійти (не та, яку несемо).
      const must = interact.filter((it) => (!gh.uid || !it.id.endsWith(`:${gh.uid}`)) && geo.allReachable(grid, me, [it]))
      if (!geo.allReachable(test, me, must)) return { ok: false, reason: 'Це перекриє прохід' }
    }
    return { ok: true }
  }

  /** Геометрія привида: спрайт, чи лежить, чи висить. */
  function ghostGeom(kind) {
    if (scene.outdoor) {
      const g = geomOf(kind, levelOf(kind))
      return g && { sprite: g.sprite, floor: !!g.floor, wall: false }
    }
    const g = INTERIOR_GEOM[kind]
    return g && { sprite: g.sprite, floor: g.layer === 'floor', wall: g.layer === 'wall' }
  }
  const footOf = (kind, x, y) => (scene.outdoor ? decoFootprint(kind, x, y) : interiorFootprint(kind, x, y))
  /** Рівень будівлі «b:<id>» — щоб привид, який переносять, мав її справжній вигляд. */
  const levelOf = (kind) => (kind?.startsWith('b:') ? world?.home.levels[kind.slice(2)] || 1 : 1)
  /** Місце привида як рядок — щоб знати, чи він зрушив. */
  const ghostKey = (g) => (g.wall ? `${g.wall}:${g.at}:${g.h}` : `${g.x},${g.y}`)

  /**
   * Чи можна поставити декор, будівлю чи грядку: на суші, не на зайнятому місці
   * й так, щоб до хатинки, причалу, будівель і верстата лишався прохід.
   * Дерева й каміння теж займають місце — спершу зрубай.
   */
  function canPlace(kind, x, y, ignoreUid = null) {
    const g = geomOf(kind, levelOf(kind))
    if (!g) return { ok: false, reason: 'Невідомий предмет' }
    const fp = decoFootprint(kind, x, y)
    const cells = geo.cellsOf(fp)
    if (!scene.outdoor || cells.some((c) => c < 0 || !land[c])) return { ok: false, reason: 'Тут будувати не можна' }
    const others = list.filter((p) => !p.uid || p.uid !== ignoreUid)
    const busy = new Uint8Array(geo.cols * geo.rows)
    let tree = false
    for (const p of others) {
      // Дрібниці на піску (мушля, корч) не заважають ходити, але місце під будівлю теж займають.
      const nodeSpot = p.node && !p.blocks?.length ? [[p.x - 5, p.y - 5, 10, 5]] : []
      for (const b of [...(p.blocks ?? []), ...nodeSpot]) {
        const hit = geo.cellsOf(b).filter((c) => c >= 0)
        for (const c of hit) busy[c] = 1
        if (p.node && hit.some((c) => cells.includes(c))) tree = true
      }
      // Підлогу (настил, грядку) на підлогу не кладемо, а будівлю чи лавку — на грядку.
      const floorish = p.occupies ?? (p.uid && DECO_GEOM[p.kind]?.floor ? [decoFootprint(p.kind, p.x, p.y)] : [])
      for (const b of floorish) for (const c of geo.cellsOf(b)) if (c >= 0) busy[c] = 1
    }
    if (cells.some((c) => busy[c])) return { ok: false, reason: tree ? 'Спершу розчисть місце' : 'Місце зайняте' }
    if (!g.floor) {
      const test = walkGrid(atlas.walk, [...others, { blocks: [fp] }])
      const me = geo.cellOf(body.x, body.y)
      if (!test[me]) return { ok: false, reason: 'Тут стоїть мандрівник' }
      // Ресурси не рахуємо: заросле дерево можна й зрубати.
      const must = interact.filter((it) => !it.node && it.id !== ignoreUid?.slice(2) && !it.id.endsWith(`:${ignoreUid}`))
      if (!geo.allReachable(test, me, must)) return { ok: false, reason: 'Це перекриє прохід' }
    }
    return { ok: true }
  }

  function setGhostMesh() {
    if (!ghost) {
      ghostMesh.visible = ghostBlob.visible = false
      ghostFoot.group.visible = false
      return
    }
    const g = ghostGeom(ghost.kind)
    ghostMesh.geometry = spriteGeo(g.sprite, g.floor)
    ghostMesh.material = ghostMats[frameOf(g.sprite)?.sheet.tex] ?? ghostMat
    ghostMesh.renderOrder = g.floor ? -9 : 2
    ghostMesh.visible = true
    ghostBlob.visible = !g.floor && !g.wall
    if (g.wall) ghostFoot.group.visible = false
    const f = frames[g.sprite]
    ghostBlob.scale.set(Math.max(10, f.w * 0.8), 1, 6)
  }

  /* ───── Ходьба ───── */

  function walkTo(target, goalId = null) {
    path = geo.findPath(grid, body, target)
    goal = goalId
    markerAt = path.length ? { ...path.at(-1), t } : null
    stuck.x = body.x
    stuck.y = body.y
    stuck.t = t
  }

  function arrive() {
    markerAt = null
    if (!goal) return
    const g = goal
    goal = null
    if (g.startsWith('dog:')) {
      const dog = dogById(g.slice(4))
      if (dog && dogDist(dog) <= PET_RANGE + 8) cb.onInteract(g)
      return
    }
    if (g.startsWith('plot:')) {
      const v = plotById(Number(g.slice(5)))
      const c = v && plotCenter(v)
      if (c && Math.hypot(body.x - c.x, body.y - c.y) <= 24) {
        faceToward(c.x, c.y)
        near = g
        cb.onNear(g)
        cb.onInteract(g)
      }
      return
    }
    const it = interact.find((i) => i.id === g)
    if (it && Math.hypot(body.x - it.near[0], body.y - it.near[1]) <= it.r + 6) cb.onInteract(g)
  }

  /** Повернутись до точки: і «погляд» для грядки, і спрайт мандрівника (відносно екрана). */
  function faceToward(x, y) {
    const dx = x - body.x
    const dy = y - body.y
    const d = Math.hypot(dx, dy)
    if (d < 0.5) return
    face.x = dx / d
    face.y = dy / d
    const sx = dx * rig.right.x + dy * rig.right.y
    const sy = dx * rig.down.x + dy * rig.down.y
    hero.dir = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 'right' : 'left') : sy > 0 ? 'down' : 'up'
  }

  /** Куди стати, щоб працювати на грядці: на сусідній клітинці, переважно знизу (як у Stardew). */
  function plotStand(i) {
    const c = plotCenter(plotById(i))
    for (const [dx, dy] of [[0, 12], [0, -12], [-12, 0], [12, 0], [0, 0]]) if (geo.canStand(grid, c.x + dx, c.y + dy)) return { x: c.x + dx, y: c.y + dy }
    return c
  }

  const inBox = (p, [x, y, w, h]) => p && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h

  function tap(p) {
    if (p.bubble) {
      cb.onBubble()
      return
    }
    if (p.dog) {
      // Покликав пса: він завмирає, а мандрівник підходить і гладить.
      const dog = p.dog
      const id = `dog:${dog.id}`
      dog.notice()
      if (dogDist(dog) <= PET_RANGE + 4) {
        path = []
        cb.onInteract(id)
      } else {
        const d = dogDist(dog) || 1
        walkTo({ x: dog.body.x + ((body.x - dog.body.x) / d) * 10, y: dog.body.y + ((body.y - dog.body.y) / d) * 6 }, id)
      }
      return
    }
    if (p.plot != null && plotById(p.plot)) {
      const id = `plot:${p.plot}`
      const c = plotCenter(plotById(p.plot))
      if (Math.hypot(body.x - c.x, body.y - c.y) <= 20) {
        path = []
        goal = null
        faceToward(c.x, c.y)
        near = id
        cb.onNear(id)
        cb.onInteract(id)
      } else walkTo(plotStand(p.plot), id)
      return
    }
    const hit = interact.find((it) => inBox(p.art, it.box)) ?? interact.find((it) => inBox(p.ground, it.box))
    if (hit) {
      // Уже поруч — відкриваємо одразу.
      if (Math.hypot(body.x - hit.near[0], body.y - hit.near[1]) <= hit.r + 4) {
        path = []
        cb.onInteract(hit.id)
        return
      }
      walkTo({ x: hit.near[0], y: hit.near[1] }, hit.id)
      return
    }
    if (p.ground) walkTo(p.ground)
  }

  /* ───── Вказівник: тап, утримання, перетягування, два пальці ───── */

  const pointers = new Map()
  let held = null // один палець: { cx, cy, sx, sy, moved, kind: 'walk'|'pan'|'ghost', ... }
  let gesture = null // два пальці: { dist } — щипок для зуму

  const twoFinger = () => {
    const [a, b] = [...pointers.values()]
    return { dist: Math.hypot(b.x - a.x, b.y - a.y) }
  }

  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (e.pointerType === 'touch') input.touched()
    if (pointers.size === 2) {
      // Другий палець — це жест (зум), а не хода.
      gesture = twoFinger()
      held = null
      if (mode === 'walk') {
        path = []
        goal = null
        markerAt = null
      }
      return
    }
    if (pointers.size > 2) return
    const p = pick(e.clientX, e.clientY)
    held = { cx: e.clientX, cy: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, p }
    if (mode === 'build') {
      const gg = ghost && ghostGeom(ghost.kind)
      if (gg?.wall && p.wall?.wall === ghost.wall) {
        // Привид на стіні: хапаємо, якщо палець на ньому (з невеликим запасом).
        const [x0, y0, w, h] = wallRect(ghost.kind, ghost.at, ghost.h)
        if (p.wall.at >= x0 - 4 && p.wall.at <= x0 + w + 4 && p.wall.h >= y0 - 4 && p.wall.h <= y0 + h + 4) {
          held.kind = 'ghost'
          held.off = { at: ghost.at - p.wall.at, h: ghost.h + interiorSize(ghost.kind).h / 2 - p.wall.h }
          held.cell = ghostKey(ghost)
          return
        }
      }
      const onGhost = gg && !gg.wall && p.ground && (p.item === null || p.item?.p.uid === ghost.uid) && inBox(p.ground, grow(footOf(ghost.kind, ghost.x, ghost.y), 4))
      if (onGhost) {
        held.kind = 'ghost'
        held.off = { x: ghost.x - p.ground.x, y: ghost.y - p.ground.y }
        held.cell = ghostKey(ghost)
      } else {
        held.kind = 'pan'
        held.anchor = p.ground
      }
      return
    }
    held.kind = 'walk'
    tap(p)
  }

  const onMove = (e) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (gesture && pointers.size === 2) {
      const now = twoFinger()
      if (now.dist > 0 && gesture.dist > 0) rig.zoomBy(gesture.dist / now.dist)
      gesture = now
      return
    }
    if (!held) return
    held.cx = e.clientX
    held.cy = e.clientY
    if (!held.moved && Math.hypot(e.clientX - held.sx, e.clientY - held.sy) > TAP_SLOP) held.moved = true
    if (!held.moved) return
    if (held.kind === 'pan' && held.anchor) {
      // Земля під пальцем лишається під пальцем.
      const g = groundAt(e.clientX, e.clientY)
      if (g) {
        rig.pan(held.anchor.x - g.x, held.anchor.y - g.y)
        rig.update(0)
        camera.updateMatrixWorld()
      }
    } else if (held.kind === 'ghost' && ghost) {
      if (ghost.wall) {
        const w = wallAt(e.clientX, e.clientY)
        if (!w || w.wall !== ghost.wall) return
        const tap = { wall: { wall: w.wall, at: w.at + held.off.at, h: w.h + held.off.h } }
        const s = snapInterior(ghost.kind, tap)
        const cell = s && ghostKey(s)
        if (cell && cell !== held.cell) {
          held.cell = cell
          cb.onBuildTap({ ...tap, uid: null })
        }
        return
      }
      const g = groundAt(e.clientX, e.clientY)
      if (!g) return
      const x = g.x + held.off.x
      const y = g.y + held.off.y
      const s = snapOf(ghost.kind, { x, y })
      const cell = s && ghostKey(s)
      if (cell && cell !== held.cell) {
        held.cell = cell
        cb.onBuildTap({ x, y, uid: null })
      }
    }
  }

  const onUp = (e) => {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) gesture = null
    if (!held || pointers.size) {
      if (!pointers.size) held = null
      return
    }
    if (mode === 'build' && !held.moved && (held.p.ground || held.p.wall)) {
      cb.onBuildTap({ x: held.p.ground?.x, y: held.p.ground?.y, wall: held.p.wall, uid: held.p.item?.p.uid ?? null })
    }
    held = null
  }

  /** Прив'язати місце під пальцем до сітки / стіни — у поточній сцені. */
  function snapOf(kind, tap) {
    if (scene.outdoor) return tap.x == null ? null : snapDeco(kind, tap.x, tap.y)
    return snapInterior(kind, tap)
  }

  const onWheel = (e) => {
    e.preventDefault()
    rig.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1)
  }

  /* ───── Фіксований крок фізики ───── */

  function fixedStep(dt) {
    playerStep(dt)
    // Пес живе й у пісочниці: поки будуєш, він собі гуляє.
    if (dogPlaced) for (const d of dogs) if (d.sceneId === scene.id && d.visible) d.fixedStep(dt)
  }

  function playerStep(dt) {
    body.prevX = body.x
    body.prevY = body.y
    if (mode === 'build') {
      body.vx = body.vy = 0
      return
    }
    // Палець тримають і ведуть — ідемо за ним, перераховуючи шлях раз на 150 мс.
    if (held?.kind === 'walk' && held.moved && t - lastRepath > 0.15) {
      lastRepath = t
      const g = groundAt(held.cx, held.cy)
      if (g) walkTo(g)
    }
    const mv = input.move()
    let wx = 0
    let wy = 0
    if (mv.x || mv.y) {
      // Клавіші/стік — відносно камери: «вгору» завжди від глядача.
      path = []
      goal = null
      markerAt = null
      wx = (rig.right.x * mv.x + rig.down.x * mv.y) * PHYS.maxSpeed
      wy = (rig.right.y * mv.x + rig.down.y * mv.y) * PHYS.maxSpeed
    } else if (path.length) {
      const r = followPath(body, path)
      wx = r.wx
      wy = r.wy
      if (r.done) arrive()
    }
    accelerate(body, wx, wy, dt)
    move(body, dt, (x, y) => geo.canStand(grid, x, y))
    const sp = Math.hypot(body.vx, body.vy)
    if (sp > 6 && (wx || wy)) {
      face.x = body.vx / sp
      face.y = body.vy / sp
    }

    // Застряг на шляху (щось стало на дорозі) — пробуємо раз перерахувати, потім здаємося.
    if (path.length && t - stuck.t > 0.6) {
      if (Math.hypot(body.x - stuck.x, body.y - stuck.y) < 3) {
        const target = path.at(-1)
        const g = goal
        walkTo(target, g)
        if (!path.length || Math.hypot(path[0].x - body.x, path[0].y - body.y) < 1) {
          path = []
          markerAt = null
        }
      }
      stuck.x = body.x
      stuck.y = body.y
      stuck.t = t
    }
  }

  /* ───── Кадр ───── */

  const camRight = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  const tmp = new THREE.Vector3()

  /** Точка 2D-арту, прив'язана до якоря спрайта → світ (спрайт дивиться в камеру). */
  function anchored(e, out = tmp) {
    return out.set(e.ax, 0, e.ay).addScaledVector(camRight, e.dx).addScaledVector(camUp, e.h)
  }

  /** Де світить лампа: речі на стіні — нерухома точка у світі, решта — від якоря білборда. */
  function lightAt(l, out) {
    return l.wall ? out.set(l.wx, l.wy, l.wz) : anchored(l, out)
  }

  const lampPos = new THREE.Vector3()
  /** Скільки ламп зараз щось освітлюють (0 — карту світла можна не малювати). */
  let litCount = 0

  /**
   * Вогні й освітлення: маяк, ліхтарі, вогнища надворі; піч, лампи, екрани й неон у хаті.
   * Удень світло ледь помітне (у хаті — тепла пляма, надворі — майже нічого), уночі — на повну.
   */
  function updateLights() {
    const n = skyNow.night
    const out = scene.outdoor
    const strength = out ? (0.04 + 0.96 * n) * 0.6 : 0.16 + 0.54 * n
    const glowBoost = 1 + n * 0.8
    litCount = 0
    for (const g of glows) {
      const { l, sprite } = g
      const hidden = (l.uid && ghost?.uid === l.uid) || (l.wall && !wallShown[l.wall])
      // Вогонь і свічки мерехтять, електрика світить рівно, маяк — дихає.
      const flick = l.flicker ? 0.86 + Math.sin(t * 11 + (l.ax ?? l.wx)) * 0.08 + Math.sin(t * 17.3) * 0.06 : 1
      const pulse = l.flicker ? flick : l.warm ? 0.92 : 0.75 + Math.sin(t * 3 + (l.ax ?? 0)) * 0.25
      const on = (l.night ? n : 1) * (hidden ? 0 : 1)

      lightAt(l, lampPos)
      sprite.visible = on > 0
      sprite.position.copy(lampPos)
      // Ореол — лише «сяйво» самої лампи; світить довкола вже карта світла, тож у хаті він скромніший.
      sprite.material.opacity = Math.min(1, (out ? 0.55 : 0.35) * pulse * glowBoost) * on
      const r = l.r * (out ? 2 : 1.5) * (1 + n * 0.45)
      sprite.scale.set(r, r, 1)

      const power = (l.power ?? 1) * strength * flick * on
      const reach = l.r * (out ? 1.8 + n * 0.4 : 2.6)
      const live = power > 0.05 // удень надворі ліхтарі не світять — і карту світла не малюємо
      for (const m of g.lit) m.visible = false
      if (!live) continue
      litCount++
      // Пляма на підлозі — під лампою (у тій самій точці, що й білборд, але на землі).
      g.pool.visible = true
      g.pool.material.uniforms.color.value.copy(g.tone).multiplyScalar(power)
      if (l.wall) g.pool.position.set(l.wx, 0.05, l.wz)
      else g.pool.position.set(l.ax + camRight.x * l.dx, 0.05, l.ay + camRight.z * l.dx)
      const pr = reach * (1 + Math.min(lampPos.y, 40) / 80) // з висоти світло розходиться ширше
      g.pool.scale.set(pr * 2, 1, pr * 2)
      // «Об'єм»: коло довкола самої лампи — освітлює меблі, мандрівника й псів поруч.
      g.volume.visible = true
      g.volume.material.uniforms.color.value.copy(g.tone).multiplyScalar(power * 0.45)
      g.volume.position.copy(lampPos)
      g.volume.quaternion.copy(camera.quaternion)
      g.volume.scale.set(reach * 1.6, reach * 1.6, 1)
      // Стіни: світла пляма там, куди дістає лампа, — менша й тьмяніша, що далі стіна.
      for (const { w, m } of g.washes) {
        if (!wallShown[w.id]) continue
        const dist = (lampPos.x - w.at[0]) * w.n[0] + (lampPos.z - w.at[1]) * w.n[1]
        if (dist >= reach) continue
        const rr = Math.sqrt(reach * reach - dist * dist)
        m.visible = true
        m.material.uniforms.color.value.copy(g.tone).multiplyScalar(power * (1 - dist / reach) * 0.55)
        m.position.set(lampPos.x - w.n[0] * (dist - 0.4), lampPos.y, lampPos.z - w.n[1] * (dist - 0.4))
        m.scale.set(rr * 2, rr * 2, 1)
      }
    }
    if (beam) {
      anchored(beam.userData.l, beam.position)
      beam.rotation.y = -t * 1.2
      beam.material.opacity = 0.6 + n * 0.4
    }
  }

  /** Карта світла: тло — колір неба, зверху — лампи. Без ламп і з ясним небом — не малюємо нічого. */
  function renderLights() {
    tintQuad.visible = skyLit || litCount > 0
    if (!tintQuad.visible) return
    renderer.getClearColor(savedClear)
    const savedAlpha = renderer.getClearAlpha()
    renderer.setRenderTarget(lightRT)
    renderer.setClearColor(ambient, 1)
    if (litCount > 0) renderer.render(lightScene, camera)
    else renderer.clear(true, false, false)
    renderer.setRenderTarget(null)
    renderer.setClearColor(savedClear, savedAlpha)
  }

  function update(dt) {
    input.poll()
    if (input.take('zoomIn', 0.2)) rig.zoomBy(0.85)
    if (input.take('zoomOut', 0.2)) rig.zoomBy(1 / 0.85)

    if (grid) {
      acc += Math.min(dt, FIXED_DT * PHYS.maxSteps)
      let steps = 0
      while (acc >= FIXED_DT && steps < PHYS.maxSteps) {
        fixedStep(FIXED_DT)
        acc -= FIXED_DT
        steps++
      }
    }
    // Рендер — між двома станами фізики: без тремтіння на будь-якій частоті екрана.
    const a = acc / FIXED_DT
    hero.x = body.prevX + (body.x - body.prevX) * a
    hero.y = body.prevY + (body.y - body.prevY) * a

    if (mode === 'build') {
      // Стрілки рухають камеру; мандрівник чекає.
      const mv = input.move()
      if (mv.x || mv.y) rig.pan((rig.right.x * mv.x + rig.down.x * mv.y) * 140 * dt, (rig.right.y * mv.x + rig.down.y * mv.y) * 140 * dt)
    } else {
      rig.follow(hero.x, hero.y, body.vx, body.vy, dt)
      // Що поруч.
      let found = null
      let bestD = Infinity
      for (const it of interact) {
        const d = Math.hypot(body.x - it.near[0], body.y - it.near[1])
        if (d <= it.r && d < bestD) {
          found = it.id
          bestD = d
        }
      }
      // Грядка перед тобою (або під ногами) — як курсор клітинки в Stardew.
      if (scene.outdoor) {
        let pi = plotAt(body.x + face.x * 10, body.y + face.y * 10)
        if (pi < 0) pi = plotAt(body.x, body.y)
        if (pi >= 0) {
          const c = plotCenter(plotById(pi))
          const d = Math.hypot(body.x - c.x, body.y - c.y) * 0.7
          if (d < bestD) {
            found = `plot:${pi}`
            bestD = d
          }
        }
      }
      // Пес поруч (і не спить) — можна погладити, якщо ближче за будівлю.
      for (const d of presentDogs()) {
        const dd = dogDist(d)
        if (dd <= PET_RANGE && dd < bestD && d.state !== 'sleep') {
          found = `dog:${d.id}`
          bestD = dd
        }
      }
      if (found !== near) {
        near = found
        cb.onNear(near)
      }
      // Натиснув «дію» трохи заздалегідь — спрацює, щойно підійдеш (буфер вводу).
      if (near && input.pending('interact', 0.2)) {
        input.take('interact', 0.2)
        path = []
        cb.onInteract(near)
      }
    }
    rig.update(dt)
    camera.updateMatrixWorld()
    camRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
    updateWalls()

    // Мандрівник: напрям — відносно екрана, кадри ходи — у темпі швидкості.
    const speed = Math.hypot(body.vx, body.vy)
    hero.moving = mode === 'walk' && speed > 4
    if (hero.moving) {
      const sx = body.vx * rig.right.x + body.vy * rig.right.y
      const sy = body.vx * rig.down.x + body.vy * rig.down.y
      if (Math.abs(sx) > Math.abs(sy)) hero.dir = sx > 0 ? 'right' : 'left'
      else hero.dir = sy > 0 ? 'down' : 'up'
      hero.step += dt * (speed / PHYS.maxSpeed)
      hero.dustT -= dt
      if (scene.outdoor && speed > PHYS.maxSpeed * 0.7 && hero.dustT <= 0) {
        hero.dustT = 0.32
        particles.dust(hero.x, hero.y, 2, 0.35)
      }
    } else hero.step = 0
    const fi = hero.moving ? HERO_SEQ[Math.floor(hero.step * 9) % 4] : 0
    heroMesh.geometry = heroGeos[heroFrameIndex(hero.dir, fi)]
    heroMesh.position.set(hero.x, 0, hero.y)
    heroMesh.quaternion.copy(camera.quaternion)
    heroMesh.visible = true
    heroBlob.position.set(hero.x, 0.2, hero.y)
    peers.update(dt, { sceneId: scene.id, camera, rig })
    for (const d of dogs) d.frame(dt, a, camera, rig)

    // Спрайти дивляться в камеру; «поп» і падіння новеньких.
    for (const it of items) {
      const m = it.mesh
      m.visible = it.wall ? wallShown[it.p.wall] : !(ghost?.uid && it.p.uid === ghost.uid)
      if (!it.flat && !it.wall) m.quaternion.copy(camera.quaternion)
      const j = it.key && juice.get(it.key)
      if (j) {
        const age = t - j.t0
        const [sx, sy] = popScale(age, j.power)
        if (it.flat) m.scale.set(sx, 1, sy)
        else m.scale.set(sx, sy, 1)
        m.position.y = it.wall ? it.p.h : (it.flat ? 0.02 : 0) + dropHeight(age, j.drop)
        if (age > 1) juice.delete(it.key)
      } else if (it.p.crop) {
        // Рослини ледь гойдаються на вітрі; стиглі — ще й поблискують.
        m.scale.set(1 + Math.sin(t * 1.7 + it.p.x * 0.3) * 0.025, 1 + Math.sin(t * 2.3 + it.p.y) * 0.015, 1)
        if (it.p.ready && Math.random() < dt * 0.9) particles.dust(it.p.x + (Math.random() - 0.5) * 8, it.p.y - 2, 2, 0.25, [1, 0.94, 0.55])
      } else if (m.scale.x !== 1 || m.scale.y !== 1 || m.scale.z !== 1) m.scale.set(1, 1, 1)
    }

    // Ціль переходу: пульсуюче кільце.
    marker.visible = !!markerAt && mode === 'walk'
    if (markerAt) {
      const k = (t - markerAt.t) % 0.8
      marker.position.set(markerAt.x, 0.2, markerAt.y)
      marker.scale.setScalar(1 + k * 0.6)
      markerMat.opacity = 0.9 * (1 - k / 0.8)
    }

    // Дим і вогонь — частинки в просторі, тож дим справді піднімається вгору.
    for (const em of emitters) {
      if (em.e.uid && ghost?.uid === em.e.uid) continue
      em.acc += dt * (em.kind === 'smoke' ? 2.2 : em.kind === 'spray' ? 6 : 14)
      while (em.acc >= 1) {
        em.acc -= 1
        const p = anchored(em.e)
        if (em.kind === 'spray') particles.dust(em.e.ax + (Math.random() - 0.5) * 10, em.e.ay - 3 + (Math.random() - 0.5) * 6, 2, 0.5, [0.6, 0.82, 1])
        else if (em.kind === 'smoke') particles.smoke(p.x, p.y, p.z)
        else particles.fire(p.x, p.y, p.z)
      }
    }
    skyStep(dt)
    particles.update(dt)

    updateLights()

    // Вода, прибій і тіні хмар — лише надворі.
    if (scene.outdoor) {
      water.material.uniforms.time.value = t
      foam.material.map.offset.y = 1 - ((Math.floor(t / 0.3) % assets.foamFrames) + 1) / assets.foamFrames
      clouds.forEach((c, k) => c.position.set(((t * 6 + k * 230) % (MAP.w + 240)) - 120, 0.3, 80 + k * 130))
    }

    // Будівництво: виділена прикраса й привид нового місця.
    gridMesh.visible = mode === 'build'
    const blink = 0.55 + Math.sin(t * 6) * 0.25
    const sel = mode === 'build' && selected && !ghost && list.find((p) => p.uid === selected)
    if (sel && sel.layer !== 'wall') selFoot.set(footOf(sel.kind, sel.x, sel.y), 0xffdc5a, 0.25 * blink, 0xffe678, blink)
    else selFoot.group.visible = false

    // Дощувач: коло, у якому він поливає грядки (центр грядки на 8 px вище її якоря).
    const sprink = mode === 'build' && scene.outdoor && (ghost?.kind === 'sprinkler' ? ghost : sel?.kind === 'sprinkler' ? sel : null)
    reach.visible = !!sprink
    if (sprink) {
      reach.position.set(sprink.x, 0.16, sprink.y + 8)
      reach.material.opacity = 0.55 + blink * 0.3
    }

    // Рамка грядки, з якою працюватимеш.
    const nearPlot = mode === 'walk' && scene.outdoor && near?.startsWith('plot:') ? plotById(Number(near.slice(5))) : null
    if (nearPlot) {
      const r = plotRect(nearPlot)
      const pulse = 0.65 + Math.sin(t * 5) * 0.2
      plotFoot.set([r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1], 0xfff3b0, 0.1 * pulse, 0xfff7c8, pulse)
    } else plotFoot.group.visible = false

    floatStep()
    plotIconStep()

    // Інструмент над головою — злітає й тане.
    if (toolAt >= 0) {
      const age = t - toolAt
      if (age > 0.8) {
        toolAt = -1
        toolSprite.visible = false
      } else {
        toolSprite.visible = true
        anchored({ ax: hero.x, ay: hero.y, dx: 0, h: 30 + age * 8 }, toolSprite.position)
        toolSprite.material.opacity = age < 0.55 ? 1 : 1 - (age - 0.55) / 0.25
      }
    }
    if (ghost && mode === 'build') {
      // Привид ковзає до клітинки (а не стрибає), трохи «висить» над землею й тремтить, коли сюди не можна.
      const k = 1 - Math.exp(-25 * dt)
      const g = ghostGeom(ghost.kind)
      // На стіні привид ковзає вздовж неї (x — де, y — висота), на підлозі — по клітинках.
      const tx = g.wall ? ghost.at : ghost.x
      const ty = g.wall ? ghost.h : ghost.y
      ghostVis.x += (tx - ghostVis.x) * k
      ghostVis.y += (ty - ghostVis.y) * k
      const wig = ghostVis.badAt >= 0 && t - ghostVis.badAt < 0.3 ? Math.sin((t - ghostVis.badAt) * 60) * 2 * (1 - (t - ghostVis.badAt) / 0.3) : 0
      if (g.wall) {
        mountOnWall({ wall: ghost.wall, at: ghostVis.x, h: ghostVis.y }, ghostMesh)
        ghostMesh.position.addScaledVector(camRight, wig)
        ghostMesh.position.y = ghostVis.y
        ghostMesh.renderOrder = 2
      } else {
        ghostMesh.position.set(ghostVis.x, g.floor ? 0.12 : 2 + Math.sin(t * 4) * 1, ghostVis.y).addScaledVector(camRight, wig)
        if (!g.floor) ghostMesh.quaternion.copy(camera.quaternion)
        else ghostMesh.quaternion.identity()
      }
      const [sx, sy] = popScale(t - ghostVis.born, 0.6)
      ghostMesh.scale.set(sx, g.floor ? 1 : sy, g.floor ? sy : 1)
      const gm = ghostMesh.material
      gm.opacity = ghost.ok ? 0.6 + blink * 0.3 : 0.4
      gm.color.setRGB(1, ghost.ok ? 1 : 0.55, ghost.ok ? 1 : 0.5)
      ghostBlob.position.set(ghostVis.x, 0.2, ghostVis.y)
      if (!g.wall) {
        const fp = footOf(ghost.kind, ghost.x, ghost.y)
        if (ghost.ok) ghostFoot.set(fp, 0x6ee678, 0.35, 0xaaffaa, 0.95)
        else ghostFoot.set(fp, 0xff5046, 0.3 + 0.2 * blink, 0xff6e64, 1)
      }
    }

    // Бульбашки врожаю над будівлями.
    for (const [id, sprite] of bubbleSprites) {
      const p = list.find((q) => q.s === id || q.s.startsWith(`${id}_`))
      sprite.visible = !!p && scene.outdoor && mode === 'walk'
      if (!sprite.visible) continue
      const f = frames[p.s]
      anchored({ ax: p.x, ay: p.y, dx: 0, h: f.h + 9 + Math.sin(t * 3 + p.x) * 1.5 }, sprite.position)
    }
  }

  const timer = new THREE.Timer()
  timer.connect(document)
  renderer.setAnimationLoop(() => {
    timer.update()
    const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1)
    t += dt
    update(dt)
    renderLights()
    renderer.render(scene3, camera)
  })

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  applySceneLook()
  rig.snap(body.x, body.y)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  return {
    setWorld,
    setScene,
    /** Прив'язати тап до сітки (острів, підлога хати) або стіни; null — сюди цю річ не можна. */
    snap: (kind, tap) => snapOf(kind, tap),
    /** 'walk' — гуляємо, 'build' — пісочниця: палець рухає камеру, тап — вибір місця. */
    setMode(m) {
      if (m === mode) return
      mode = m
      held = null
      input.clear()
      path = []
      goal = null
      markerAt = null
      body.vx = body.vy = 0
      if (m === 'build') {
        near = null
        cb.onNear(null)
        drawGrid()
      } else {
        ghost = null
        selected = null
        setGhostMesh()
      }
    },
    /** Привид предмета (або null). Повертає його разом із тим, чи можна тут ставити. */
    setGhost(g) {
      const prev = ghost
      ghost = g ? { ...g, ...canPlaceGhost(g) } : null
      if (ghost) {
        if (!prev || prev.kind !== ghost.kind || prev.uid !== ghost.uid) {
          // Новий привид з'являється одразу на місці й «попає».
          ghostVis.x = ghost.wall ? ghost.at : ghost.x
          ghostVis.y = ghost.wall ? ghost.h : ghost.y
          ghostVis.born = t
        }
        if (!ghost.ok && (!prev || prev.ok || ghostKey(prev) !== ghostKey(ghost))) ghostVis.badAt = t
      }
      setGhostMesh()
      return ghost
    },
    setSelected(uid) {
      selected = uid
      if (uid) juice.set(uid, { t0: t, power: 0.35, drop: 0 })
    },
    setBubbles(b) {
      bubbles = b
      for (const [id, s] of bubbleSprites)
        if (bubbles[id] !== s.userData.emoji) {
          scene3.remove(s)
          s.material.dispose()
          bubbleSprites.delete(id)
        }
      for (const [id, emoji] of Object.entries(bubbles)) {
        if (bubbleSprites.has(id)) continue
        if (!bubbleTex.has(emoji)) bubbleTex.set(emoji, bubbleTexture(emoji))
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex.get(emoji), transparent: true, depthWrite: false, depthTest: false }))
        s.scale.set(16, 17.3, 1)
        s.renderOrder = 8
        s.userData.emoji = emoji
        s.visible = false
        scene3.add(s)
        bubbleSprites.set(id, s)
      }
    },
    /** Підійти до точки взаємодії (кнопка під мапою). */
    goTo(id) {
      const it = interact.find((i) => i.id === id)
      if (it) walkTo({ x: it.near[0], y: it.near[1] }, id)
    },
    zoom(f) {
      rig.zoomBy(f)
    },
    /** Перевести камеру на точку острова (у будівництві — показати вибрану будівлю). */
    lookAt(p) {
      if (p) rig.pan(p.x - rig.focus.x, p.y - 24 - rig.focus.y)
    },
    /** Підлога хатинки { p, c } — збережена або прев'ю з панелі «Облаштувати». */
    setFloor(f) {
      showFloor(f)
    },
    /** Погладити пса за id (кнопка «Погладити» чи E поруч). */
    petDog(id) {
      dogById(id)?.pet()
    },
    /** Нагодували пса: сідає й їсть. */
    feedDog(id) {
      dogById(id)?.feed()
    },
    /**
     * Команда псові: 'follow' | 'sit' | 'house'. Виконується одразу, не чекаючи сервера;
     * повертає, що зберегти на сервері (для «Сидіти» — де саме сидить).
     */
    commandDog(id, m) {
      const dog = dogById(id)
      if (!dog) return null
      const sit = m === 'sit' ? { scene: scene.id, x: Math.round(dog.body.x), y: Math.round(dog.body.y) } : null
      dog.cfg = { mode: m, sit }
      dog.cfgKey = cfgKeyOf(dog.cfg)
      applyDog(dog, false)
      return { mode: m, ...(sit ?? {}) }
    },
    /** Команди з сервера (state.dogs): застосувати ті, що змінились. */
    syncDogs(stateDogs) {
      for (const d of dogs) {
        const c = stateDogs?.[d.id]
        const cfg = { mode: c?.mode ?? 'follow', sit: c?.mode === 'sit' ? c.sit : null }
        const key = cfgKeyOf(cfg)
        if (key === d.cfgKey) continue
        d.cfg = cfg
        d.cfgKey = key
        if (dogPlaced) applyDog(d, false)
      }
    },
    /** Поле з fieldView(): грядки, рослини, бур'ян. */
    setFarm,
    /** Небо зі skyAt() (sky.js): перший раз — одразу, далі зміна тягнеться кілька секунд. */
    setSky(s) {
      const first = !skyWant
      skyWant = { tint: [...s.tint], night: s.night, clouds: s.clouds, rain: s.rain, fog: s.fog }
      storm = s.storm
      if (first) Object.assign(skyNow, { ...skyWant, tint: [...s.tint] })
    },
    /** Сік дії на грядці: пил, листя, бризки, інструмент над головою. */
    farmFx(i, kind) {
      const v = plotById(i)
      if (!v) return
      const c = plotCenter(v)
      if (kind === 'till') {
        particles.dust(c.x, c.y + 4, 12, 1.1, [0.45, 0.3, 0.18])
        rig.addTrauma(0.06)
      } else if (kind === 'plant') particles.leaves(c.x, c.y + 4, 5)
      else if (kind === 'water') {
        particles.dust(c.x, c.y + 3, 14, 0.8, [0.55, 0.78, 0.98])
        particles.dust(c.x, c.y + 6, 8, 0.45, [0.8, 0.92, 1])
      } else if (kind === 'harvest') {
        particles.leaves(c.x, c.y + 2, 8)
        particles.dust(c.x, c.y + 4, 6, 0.6, [1, 0.94, 0.55])
        rig.addTrauma(0.05)
      } else if (kind === 'clear') particles.puff(c.x, c.y + 2, 10)
      juice.set(`plot:${i}`, { t0: t, power: kind === 'harvest' ? 1.1 : 0.7, drop: 0 })
      const emoji = TOOL_EMOJI[kind]
      if (emoji) {
        if (!bubbleTex.has(emoji)) bubbleTex.set(emoji, bubbleTexture(emoji))
        toolSprite.material.map = bubbleTex.get(emoji)
        toolSprite.material.needsUpdate = true
        toolAt = t
      }
    },
    /**
     * Добування ресурсу: мандрівник стає лицем до нього й робить hits замахів (тріски, листя,
     * кам'яний пил, легка тряска). Повертає Promise, що завершиться разом з останнім замахом.
     * tool — 'axe' | 'pickaxe' | 'hand' (емодзі над головою).
     */
    gatherFx(nodeId, hits, tool) {
      const n = world?.nodes.find((q) => q.id === nodeId)
      if (!n) return Promise.resolve()
      path = []
      goal = null
      markerAt = null
      faceToward(n.x, n.y)
      const chips = CHIPS[n.k]
      const swing = () => {
        juice.set(`node:${nodeId}`, { t0: t, power: 0.45, drop: 0 })
        if (chips === 'wood') particles.dust(n.x, n.y - 6, 7, 0.9, [0.72, 0.52, 0.3])
        else if (chips === 'leaf') particles.leaves(n.x, n.y - 6, 4)
        else particles.dust(n.x, n.y - 3, 8, 0.8, [0.7, 0.67, 0.62])
        rig.addTrauma(tool === 'hand' ? 0.03 : 0.08)
        const emoji = TOOL_EMOJI[tool] ?? TOOL_EMOJI.hand
        if (!bubbleTex.has(emoji)) bubbleTex.set(emoji, bubbleTexture(emoji))
        toolSprite.material.map = bubbleTex.get(emoji)
        toolSprite.material.needsUpdate = true
        toolAt = t
      }
      const gap = tool === 'hand' ? 220 : 330
      return new Promise((resolve) => {
        let k = 0
        const step = () => {
          swing()
          if (++k >= hits) setTimeout(resolve, 120)
          else setTimeout(step, gap)
        }
        step()
      })
    },
    /**
     * Спливаючий напис у світі замість вікна поверх екрана.
     * at — 'hero' | 'plot:<№>' | 'dog:<id>' | 'node:<id>' | id точки взаємодії | { x, y, h }.
     */
    floatText,
    /** Підійти до грядки й попрацювати на ній (як тап по ній). false — грядки немає чи зараз не ходимо. */
    goToPlot(i) {
      if (mode !== 'walk' || !scene.outdoor || !plotById(i)) return false
      tap({ plot: i })
      return true
    },
    /** Перевдягнути мандрівника (state.wear: { hat, top, bottom }). Те саме вбрання — нічого не робить. */
    setOutfit(w) {
      const next = outfitOf(w)
      if (outfitKey(next) === outfitKey(heroOutfit)) return
      heroOutfit = next
      composeHero(assets['hero-wear'].image, heroOutfit, heroCanvas)
      heroTex.needsUpdate = true
    },
    /** Де зараз мандрівник (координати мапи). */
    heroPos() {
      return { x: body.x, y: body.y }
    },
    /** Що бачать про тебе інші на спільному острові: сцена, місце, куди дивишся (у світі, не на екрані). */
    selfState() {
      return { scene: scene.id, x: body.x, y: body.y, fx: face.x, fy: face.y }
    },
    /** Інші мандрівники з presence.js; serverNow — годинник сервера (їхні точки — у його часі). */
    setPeers(list, serverNow) {
      peers.set(list, serverNow)
    },
    /** Де на екрані (clientX/Y) точка світу — для тестів і підказок поверх канви. */
    screenOf(x, y, h = 0) {
      const v = new THREE.Vector3(x, h, y).project(camera)
      const r = canvas.getBoundingClientRect()
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
    },
    /** Що під точкою екрана (для тестів): спрайт, грядка, точка арту й землі. */
    probe(clientX, clientY) {
      const p = pick(clientX, clientY)
      const hit = interact.find((it) => inBox(p.art, it.box)) ?? interact.find((it) => inBox(p.ground, it.box))
      return { sprite: p.item?.p.s ?? null, plot: p.plot, art: p.art, ground: p.ground, hit: hit?.id ?? null }
    },
    /** Знімок стану для тестів і налагодження (лише читання). */
    debug() {
      const dogsInfo = Object.fromEntries(
        dogs.map((d) => [d.id, { x: d.body.x, y: d.body.y, state: d.state, mode: d.mode, scene: d.sceneId, visible: d.visible, dist: dogDist(d) }])
      )
      return { player: { x: body.x, y: body.y }, hero: { x: hero.x, y: hero.y, dir: hero.dir, moving: hero.moving, my: heroMesh.position.y }, focus: { ...rig.focus }, dogs: dogsInfo, peers: peers.info(), near, mode, scene: scene.id, sky: { ...skyNow, storm }, particles: particles.points.geometry.drawRange.count }
    },
    destroy() {
      renderer.setAnimationLoop(null)
      timer.dispose()
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      input.destroy()
      clearItems()
      peers.dispose()
      for (const d of dogs) d.dispose()
      for (const s of bubbleSprites.values()) s.material.dispose()
      while (floats.length) dropFloat(0)
      for (const ic of plotIcons.values()) ic.s.material.dispose()
      for (const tex of bubbleTex.values()) tex.dispose()
      for (const g of geoCache.values()) g.dispose()
      particles.dispose()
      // Решта: геометрії й матеріали власних мешів, потім текстури.
      scene3.traverse((o) => {
        if (o.geometry && ![...geoCache.values()].includes(o.geometry)) o.geometry.dispose()
        if (o.material) o.material.dispose()
      })
      for (const m of [...Object.values(sheetMats), ...Object.values(ghostMats)]) m.dispose() // і ті, якими цього разу не малювали
      for (const tex of [glowTex, blobTex, beamTex, gridTex, foamTex, heroTex]) tex.dispose()
      for (const g of heroGeos) g.dispose()
      lightScene.traverse((o) => o.material?.dispose())
      lightQuad.dispose()
      lightRT.dispose()
      for (const name of ASSETS) assets[name].dispose()
      renderer.dispose()
    },
  }
}

/** Розширити прямокутник [x, y, w, h] на m px з усіх боків. */
const grow = ([x, y, w, h], m) => [x - m, y - m, w + m * 2, h + m * 2]
