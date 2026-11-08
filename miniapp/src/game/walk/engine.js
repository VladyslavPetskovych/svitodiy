import * as THREE from 'three'
import atlas from './atlas.json'
import { createCameraRig } from './camera.js'
import { DECO_GEOM, decoFootprint, snapDeco } from './decor.js'
import { beamTexture, blobTexture, bubbleTexture, createParticles, dropHeight, glowTexture, popScale, waterMaterial } from './fx.js'
import { geometry } from './grid.js'
import { HOME_MAP, HOME_START, homeInteract, homePlacements } from './home.js'
import { createInput } from './input.js'
import { CELL, INTERACT, LIGHTHOUSE_LAMP, MAP, PIER, SPOTS, START, placements, walkGrid } from './layout.js'
import { FIXED_DT, PHYS, accelerate, createBody, followPath, move, teleport } from './physics.js'

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

const ASSETS = ['ground', 'foam', 'water', 'home', 'sprites']
const AW = atlas.size.w
const AH = atlas.size.h

export function loadAssets() {
  const loader = new THREE.TextureLoader()
  return Promise.all(
    ASSETS.map((name) =>
      loader.loadAsync(`/game/walk/${name}.png`).then(
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
      tex.magFilter = THREE.NearestFilter
      tex.minFilter = THREE.NearestFilter
      tex.generateMipmaps = false
    }
    // Альфа атласу — щоб тап по спрайту влучав лише в непрозорі пікселі.
    const img = a.sprites.image
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    a.alpha = ctx.getImageData(0, 0, c.width, c.height).data
    a.foamFrames = Math.round(a.foam.image.height / MAP.h)
    return a
  })
}

/**
 * Де на мапі димарі й вогні — залежить від рівнів і декору гравця.
 * Кожен ефект прив'язаний до якоря спрайта (ax, ay), бо спрайт стоїть у 3D і обертається
 * разом із камерою: точку (x, y) з 2D-арту перераховуємо в простір цього спрайта.
 */
function effectsFor(levels, deco) {
  const h = SPOTS.house
  const w = SPOTS.workshop
  const l = SPOTS.lighthouse
  const at = (ax, ay, x, y, extra = {}) => ({ ax, ay, dx: x - ax, h: ay - y, ...extra })
  const smoke = [at(h.x, h.y, h.x + 21, h.y - 84)]
  if (levels.workshop >= 2) smoke.push(at(w.x, w.y - 26, w.x + 15, w.y - 90))
  const lights = []
  const lamp = LIGHTHOUSE_LAMP[levels.lighthouse]
  if (lamp) lights.push(at(l.x, l.y, l.x + lamp[0], l.y + lamp[1], { r: 16 + levels.lighthouse * 6, beam: levels.lighthouse >= 3 }))
  if (levels.pier >= 2) for (const dx of [-15, 15]) lights.push(at(PIER.x + dx, 372, PIER.x + dx, 357, { r: 9 }))
  const fires = []
  for (const d of deco) {
    const g = DECO_GEOM[d.k]
    if (g?.light) lights.push(at(d.x, d.y, d.x, d.y + g.light.dy, { r: g.light.r, uid: d.id, warm: g.fire }))
    if (g?.fire) fires.push(at(d.x, d.y, d.x, d.y - 5, { uid: d.id }))
  }
  return { smoke, lights, fires }
}

/** Вогонь у печі хатинки. */
function homeEffects() {
  return { smoke: [], lights: [{ ax: 200, ay: 110, dx: -11, h: 8, r: 26, warm: true }], fires: [] }
}

/** До якої будівлі / точки належить спрайт — для «попу» при покращенні. */
function keyOf(p) {
  if (p.uid) return p.uid
  if (p.s === 'plot_grass') return 'garden'
  if (p.s === 'sign') return 'workshop'
  if (p.s.startsWith('chest')) return 'chest'
  const m = /^(house|garden|workshop|lighthouse)_\d$/.exec(p.s)
  return m ? m[1] : null
}

const SCENES = {
  island: { id: 'island', map: MAP, walk: atlas.walk, bg: 'ground', outdoor: true, spawn: { x: SPOTS.house.x, y: SPOTS.house.y + 12, dir: 'down' } },
  home: { id: 'home', map: HOME_MAP, walk: atlas.homeWalk, bg: 'home', outdoor: false, spawn: { ...HOME_START, dir: 'up' } },
}
for (const sc of Object.values(SCENES)) sc.geo = geometry(sc.walk, sc.map)

/** Суша острова, на якій можна будувати: з генератора, без мостків над водою. */
const land = walkGrid(atlas.walk, [])

const HERO_SEQ = [1, 0, 2, 0]
const TAP_SLOP = 10 // CSS px: далі — це вже перетягування, а не тап

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} assets результат loadAssets()
 * @param {{ onNear: (id: string|null) => void, onInteract: (id: string) => void, onBubble: () => void,
 *   onBuildTap: (p: { x: number, y: number, uid: string|null }) => void }} cb
 */
export function createWalk(canvas, assets, cb) {
  const frames = atlas.frames
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
    const f = frames[name]
    if (!f) return null
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
  const spriteMat = new THREE.MeshBasicMaterial({ map: assets.sprites, transparent: true, alphaTest: 0.5, depthWrite: false })
  // Привид напівпрозорий, а alphaTest порівнює альфу вже з opacity — тож поріг майже нульовий
  // (альфа піксель-арту й так 0 або 1), інакше блідий привид зникав би повністю.
  const ghostMat = spriteMat.clone()
  ghostMat.alphaTest = 0.01
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

  const groundMat = new THREE.MeshBasicMaterial({ map: assets.ground, transparent: true, depthWrite: false })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), groundMat)
  ground.renderOrder = -20
  scene3.add(ground)

  const foamTex = assets.foam.clone()
  foamTex.repeat.set(1, 1 / assets.foamFrames)
  foamTex.needsUpdate = true
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.w, MAP.h).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false })
  )
  foam.position.set(MAP.w / 2, 0.05, MAP.h / 2)
  foam.renderOrder = -19
  scene3.add(foam)

  const cloudMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x0a1e32, transparent: true, opacity: 0.12, depthWrite: false })
  const clouds = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(unitPlane, cloudMat)
    m.scale.set(140, 1, 140)
    m.renderOrder = -6
    scene3.add(m)
    return m
  })

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
  let t = 0
  let acc = 0
  let lastRepath = 0
  const stuck = { x: 0, y: 0, t: 0 }
  /** Сік: uid / id будівлі → коли й наскільки «попнути» спрайт. */
  const juice = new Map()
  let prevDeco = null
  let prevLevels = null
  let prevChest = null

  /* ───── Об'єкти сцени ───── */

  /** @type {{ p: object, mesh: THREE.Mesh, flat: boolean, key: string|null }[]} */
  let items = []
  let billboards = [] // меші для raycast
  let glows = []
  let emitters = []
  let beam = null

  const heroMesh = new THREE.Mesh(spriteGeo('hero_down_0'), spriteMat)
  scene3.add(heroMesh)
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
  const heroBlob = new THREE.Mesh(unitPlane, blobMat)
  heroBlob.scale.set(13, 1, 8)
  heroBlob.renderOrder = -7
  scene3.add(heroBlob)

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
      const g = spriteGeo(p.s, flat)
      if (!g) continue
      const mesh = new THREE.Mesh(g, spriteMat)
      mesh.position.set(p.x, flat ? 0.02 : 0, p.y)
      mesh.renderOrder = flat ? -10 : 0
      const it = { p, mesh, flat, key: keyOf(p) }
      mesh.userData.item = it
      items.push(it)
      if (!flat) billboards.push(mesh)
      scene3.add(mesh)
    }
    for (const l of fx.lights) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, color: l.warm ? 0xffaa50 : 0xffe68c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      )
      sprite.scale.set(l.r * 2, l.r * 2, 1)
      sprite.renderOrder = 6
      scene3.add(sprite)
      glows.push({ l, sprite })
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
    for (const f of fx.fires) emitters.push({ e: f, kind: 'fire', acc: 0 })
    if (mode === 'build') drawGrid()
  }

  /** Сітка будівництва: ледь помітні клітинки суші, зайняті — червонуваті. */
  function drawGrid() {
    const ctx = gridCanvas.getContext('2d')
    ctx.clearRect(0, 0, MAP.w, MAP.h)
    if (!scene.outdoor) return
    const busy = new Uint8Array(geo.cols * geo.rows)
    for (const p of list) for (const b of p.blocks ?? []) for (const c of geo.cellsOf(b)) if (c >= 0) busy[c] = 1
    for (let c = 0; c < land.length; c++) {
      if (!land[c]) continue
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
    const { levels, chestOpen, deco } = world
    if (scene.outdoor) {
      list = placements(levels, chestOpen, deco)
      interact = INTERACT
      fx = effectsFor(levels, deco)
    } else {
      const lvl = Math.max(1, levels.house ?? 1)
      list = homePlacements(lvl)
      interact = homeInteract(lvl)
      fx = homeEffects()
    }
    grid = walkGrid(scene.walk, list)
    if (selected && !list.some((p) => p.uid === selected)) selected = null
    if (!geo.canStand(grid, body.x, body.y)) teleport(body, scene.spawn.x, scene.spawn.y)
    buildItems()
  }

  /** Сік на зміни світу: новий предмет падає й «попає», прибраний — пуф, покращена будівля — поп. */
  function celebrate(levels, chestOpen, deco) {
    if (!scene.outdoor) return
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
      for (const id of Object.keys(levels))
        if (levels[id] !== prevLevels[id]) {
          juice.set(id, { t0: t, power: 1.2, drop: 0 })
          const s = SPOTS[id]
          if (s) particles.dust(s.x, s.y, 16, 2)
          rig.addTrauma(0.25)
        }
    if (prevChest !== null && prevChest !== chestOpen) juice.set('chest', { t0: t, power: 1, drop: 0 })
    prevDeco = new Map(deco.map((d) => [d.id, d]))
    prevLevels = { ...levels }
    prevChest = chestOpen
  }

  function setWorld(levels, chestOpen, deco = []) {
    celebrate(levels, chestOpen, deco)
    world = { levels, chestOpen, deco }
    rebuild()
  }

  function applySceneLook() {
    const outdoor = scene.outdoor
    water.visible = foam.visible = outdoor
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

  /** Чи непрозорий піксель атласу під точкою UV. */
  function opaque(uv) {
    const px = Math.min(AW - 1, Math.floor(uv.x * AW))
    const py = Math.min(AH - 1, Math.floor((1 - uv.y) * AH))
    return assets.alpha[(py * AW + px) * 4 + 3] > 40
  }

  /**
   * Що під пальцем: бульбашка, спрайт (зверху того, що намальовано останнім) і точка на землі.
   * art — точка в координатах 2D-арту, куди «влучили б» у старому рушії: для спрайта це піксель
   * самого спрайта, тож старі прямокутники взаємодії (INTERACT.box) працюють без змін.
   */
  function pick(clientX, clientY) {
    rayFrom(clientX, clientY)
    raycaster.camera = camera
    const out = { bubble: false, art: null, ground: null, item: null }
    const visibleBubbles = [...bubbleSprites.values()].filter((s) => s.visible)
    if (visibleBubbles.length && raycaster.intersectObjects(visibleBubbles, false).length) out.bubble = true
    let best = null
    let bestD = Infinity
    for (const h of raycaster.intersectObjects(billboards.filter((m) => m.visible), false)) {
      if (!h.uv || !opaque(h.uv)) continue
      const d = camera.position.distanceToSquared(h.object.position)
      if (d < bestD) {
        best = h
        bestD = d
      }
    }
    if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) out.ground = { x: hitPoint.x, y: hitPoint.z }
    if (best) {
      const it = best.object.userData.item
      const f = frames[it.p.s]
      out.item = it
      out.art = { x: it.p.x - f.w / 2 + (best.uv.x * AW - f.x), y: it.p.y - f.h + ((1 - best.uv.y) * AH - f.y) }
    } else if (out.ground) {
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
  function canPlace(kind, x, y, ignoreUid = null) {
    const g = DECO_GEOM[kind]
    if (!g) return { ok: false, reason: 'Невідомий предмет' }
    const fp = decoFootprint(kind, x, y)
    const cells = geo.cellsOf(fp)
    if (!scene.outdoor || cells.some((c) => c < 0 || !land[c])) return { ok: false, reason: 'Тут будувати не можна' }
    const others = list.filter((p) => !p.uid || p.uid !== ignoreUid)
    const busy = new Uint8Array(geo.cols * geo.rows)
    for (const p of others) {
      for (const b of p.blocks ?? []) for (const c of geo.cellsOf(b)) if (c >= 0) busy[c] = 1
      // Підлогу на підлогу не кладемо.
      if (g.floor && p.uid && DECO_GEOM[p.kind]?.floor)
        for (const c of geo.cellsOf(decoFootprint(p.kind, p.x, p.y))) if (c >= 0) busy[c] = 1
    }
    if (cells.some((c) => busy[c])) return { ok: false, reason: 'Місце зайняте' }
    if (!g.floor) {
      const test = walkGrid(atlas.walk, [...others, { blocks: [fp] }])
      const me = geo.cellOf(body.x, body.y)
      if (!test[me]) return { ok: false, reason: 'Тут стоїть мандрівник' }
      if (!geo.allReachable(test, me, interact)) return { ok: false, reason: 'Це перекриє прохід' }
    }
    return { ok: true }
  }

  function setGhostMesh() {
    if (!ghost) {
      ghostMesh.visible = ghostBlob.visible = false
      ghostFoot.group.visible = false
      return
    }
    const g = DECO_GEOM[ghost.kind]
    ghostMesh.geometry = spriteGeo(g.sprite, !!g.floor)
    ghostMesh.renderOrder = g.floor ? -9 : 2
    ghostMesh.visible = true
    ghostBlob.visible = !g.floor
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
    const it = interact.find((i) => i.id === g)
    if (it && Math.hypot(body.x - it.near[0], body.y - it.near[1]) <= it.r + 6) cb.onInteract(g)
  }

  const inBox = (p, [x, y, w, h]) => p && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h

  function tap(p) {
    if (p.bubble) {
      cb.onBubble()
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
  let gesture = null // два пальці: { dist, angle }

  const twoFinger = () => {
    const [a, b] = [...pointers.values()]
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) }
  }

  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (e.pointerType === 'touch') input.touched()
    if (pointers.size === 2) {
      // Другий палець — це жест (зум/поворот), а не хода.
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
      const onGhost = ghost && p.ground && (p.item === null || p.item?.p.uid === ghost.uid) && inBox(p.ground, grow(decoFootprint(ghost.kind, ghost.x, ghost.y), 4))
      if (onGhost) {
        held.kind = 'ghost'
        held.off = { x: ghost.x - p.ground.x, y: ghost.y - p.ground.y }
        held.cell = `${ghost.x},${ghost.y}`
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
      let da = now.angle - gesture.angle
      if (da > Math.PI) da -= Math.PI * 2
      if (da < -Math.PI) da += Math.PI * 2
      rig.twist(-da)
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
      const g = groundAt(e.clientX, e.clientY)
      if (!g) return
      const x = g.x + held.off.x
      const y = g.y + held.off.y
      const s = snapDeco(ghost.kind, x, y)
      const cell = `${s.x},${s.y}`
      if (cell !== held.cell) {
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
    if (mode === 'build' && !held.moved && held.p.ground) {
      cb.onBuildTap({ x: held.p.ground.x, y: held.p.ground.y, uid: held.p.item?.p.uid ?? null })
    }
    held = null
  }

  const onWheel = (e) => {
    e.preventDefault()
    rig.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1)
  }

  /* ───── Фіксований крок фізики ───── */

  function fixedStep(dt) {
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

  function update(dt) {
    input.poll()
    if (input.take('rotateLeft', 0.2)) rig.rotate(-1)
    if (input.take('rotateRight', 0.2)) rig.rotate(1)
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
    heroMesh.geometry = spriteGeo(`hero_${hero.dir}_${fi}`)
    heroMesh.position.set(hero.x, 0, hero.y)
    if (hero.moving && fi !== 0) heroMesh.position.addScaledVector(camUp, 1)
    heroMesh.quaternion.copy(camera.quaternion)
    heroMesh.visible = true
    heroBlob.position.set(hero.x, 0.2, hero.y)

    // Спрайти дивляться в камеру; «поп» і падіння новеньких.
    for (const it of items) {
      const m = it.mesh
      m.visible = !(ghost?.uid && it.p.uid === ghost.uid)
      if (!it.flat) m.quaternion.copy(camera.quaternion)
      const j = it.key && juice.get(it.key)
      if (j) {
        const age = t - j.t0
        const [sx, sy] = popScale(age, j.power)
        if (it.flat) m.scale.set(sx, 1, sy)
        else m.scale.set(sx, sy, 1)
        m.position.y = (it.flat ? 0.02 : 0) + dropHeight(age, j.drop)
        if (age > 1) juice.delete(it.key)
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
      em.acc += dt * (em.kind === 'smoke' ? 2.2 : 14)
      while (em.acc >= 1) {
        em.acc -= 1
        const p = anchored(em.e)
        if (em.kind === 'smoke') particles.smoke(p.x, p.y, p.z)
        else particles.fire(p.x, p.y, p.z)
      }
    }
    particles.update(dt)

    // Вогні: маяк, ліхтарі на причалі й декор гравця.
    for (const { l, sprite } of glows) {
      sprite.visible = !(l.uid && ghost?.uid === l.uid)
      anchored(l, sprite.position)
      const pulse = l.warm ? 0.8 + Math.sin(t * 11 + l.ax) * 0.12 + Math.sin(t * 17) * 0.08 : 0.75 + Math.sin(t * 3 + l.ax) * 0.25
      sprite.material.opacity = 0.55 * pulse
    }
    if (beam) {
      anchored(beam.userData.l, beam.position)
      beam.rotation.y = -t * 1.2
    }

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
    if (sel) selFoot.set(decoFootprint(sel.kind, sel.x, sel.y), 0xffdc5a, 0.25 * blink, 0xffe678, blink)
    else selFoot.group.visible = false
    if (ghost && mode === 'build') {
      // Привид ковзає до клітинки (а не стрибає), трохи «висить» над землею й тремтить, коли сюди не можна.
      const k = 1 - Math.exp(-25 * dt)
      ghostVis.x += (ghost.x - ghostVis.x) * k
      ghostVis.y += (ghost.y - ghostVis.y) * k
      const g = DECO_GEOM[ghost.kind]
      const wig = ghostVis.badAt >= 0 && t - ghostVis.badAt < 0.3 ? Math.sin((t - ghostVis.badAt) * 60) * 2 * (1 - (t - ghostVis.badAt) / 0.3) : 0
      ghostMesh.position.set(ghostVis.x, g.floor ? 0.12 : 2 + Math.sin(t * 4) * 1, ghostVis.y).addScaledVector(camRight, wig)
      if (!g.floor) ghostMesh.quaternion.copy(camera.quaternion)
      else ghostMesh.quaternion.identity()
      const [sx, sy] = popScale(t - ghostVis.born, 0.6)
      ghostMesh.scale.set(sx, g.floor ? 1 : sy, g.floor ? sy : 1)
      ghostMat.opacity = ghost.ok ? 0.6 + blink * 0.3 : 0.4
      ghostMat.color.setRGB(1, ghost.ok ? 1 : 0.55, ghost.ok ? 1 : 0.5)
      ghostBlob.position.set(ghostVis.x, 0.2, ghostVis.y)
      const fp = decoFootprint(ghost.kind, ghost.x, ghost.y)
      if (ghost.ok) ghostFoot.set(fp, 0x6ee678, 0.35, 0xaaffaa, 0.95)
      else ghostFoot.set(fp, 0xff5046, 0.3 + 0.2 * blink, 0xff6e64, 1)
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
    canPlace,
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
      ghost = g ? { ...g, ...canPlace(g.kind, g.x, g.y, g.uid ?? null) } : null
      if (ghost) {
        if (!prev || prev.kind !== ghost.kind || prev.uid !== ghost.uid) {
          // Новий привид з'являється одразу на місці й «попає».
          ghostVis.x = ghost.x
          ghostVis.y = ghost.y
          ghostVis.born = t
        }
        if (!ghost.ok && (!prev || prev.ok || prev.x !== ghost.x || prev.y !== ghost.y)) ghostVis.badAt = t
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
    /** Повернути камеру на кроки по 45° (кнопки ⟲ ⟳). */
    rotate(steps) {
      rig.rotate(steps)
    },
    zoom(f) {
      rig.zoomBy(f)
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
      for (const s of bubbleSprites.values()) s.material.dispose()
      for (const tex of bubbleTex.values()) tex.dispose()
      for (const g of geoCache.values()) g.dispose()
      particles.dispose()
      // Решта: геометрії й матеріали власних мешів, потім текстури.
      scene3.traverse((o) => {
        if (o.geometry && ![...geoCache.values()].includes(o.geometry)) o.geometry.dispose()
        if (o.material) o.material.dispose()
      })
      for (const tex of [glowTex, blobTex, beamTex, gridTex, foamTex]) tex.dispose()
      for (const name of ASSETS) assets[name].dispose()
      renderer.dispose()
    },
  }
}

/** Розширити прямокутник [x, y, w, h] на m px з усіх боків. */
const grow = ([x, y, w, h], m) => [x - m, y - m, w + m * 2, h + m * 2]
