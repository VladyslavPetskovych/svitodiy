import atlas from './atlas.json'
import { DECO_GEOM, decoFootprint } from './decor.js'
import { HOME_MAP, HOME_START, homeInteract, homePlacements } from './home.js'
import { CELL, INTERACT, LIGHTHOUSE_LAMP, MAP, PIER, SPOTS, START, placements, walkGrid } from './layout.js'

/**
 * Прогулянка островом і хатинкою: canvas, камера, гравець, пошук шляху й ефекти.
 * Без React — екран IslandWalk лише створює рушій і передає йому стан гри.
 * Сцени: «island» (острів надворі) і «home» (кімната хатинки) — кожна зі своєю мапою й сіткою.
 */

const SPEED = 62 // px арту за секунду
const VIEW = 200 // скільки px арту хочемо бачити по ширині
const ASSETS = ['ground', 'foam', 'water', 'home', 'sprites']

export function loadAssets() {
  return Promise.all(
    ASSETS.map(
      (name) =>
        new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve([name, img])
          img.onerror = () => reject(new Error(`Не вдалося завантажити ${name}.png`))
          img.src = `/game/walk/${name}.png`
        })
    )
  ).then((pairs) => {
    const a = Object.fromEntries(pairs)
    // Кадри води — окремі полотна, щоб робити з них візерунок для заливки.
    a.waterFrames = [0, 1, 2, 3].map((i) => {
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 64
      c.getContext('2d').drawImage(a.water, 0, i * 64, 64, 64, 0, 0, 64, 64)
      return c
    })
    return a
  })
}

/**
 * Усе, що залежить від розміру сітки: клітинки, «ступня» гравця, пошук шляху.
 * @param {string[]} walk рядки '0'/'1' з генератора
 */
function geometry(walk, map) {
  const cols = walk[0].length
  const rows = walk.length
  const cellOf = (x, y) => Math.floor(y / CELL) * cols + Math.floor(x / CELL)
  const centerOf = (c) => ({ x: (c % cols) * CELL + CELL / 2, y: Math.floor(c / cols) * CELL + CELL / 2 })

  /** Ширина «ступні» гравця: точки, які мусять бути на прохідних клітинках. */
  function canStand(grid, x, y) {
    for (const [dx, dy] of [[-3, -1], [3, -1], [-3, -4], [3, -4]]) {
      const px = x + dx
      const py = y + dy
      if (px < 0 || py < 0 || px >= map.w || py >= map.h || !grid[cellOf(px, py)]) return false
    }
    return true
  }

  function lineClear(grid, a, b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      if (!canStand(grid, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false
    }
    return true
  }

  /**
   * Пошук у ширину по 8 напрямках (без зрізання кутів). Якщо до цілі не дійти —
   * ведемо до найближчої досяжної клітинки. Потім спрямлюємо там, де видно напряму.
   */
  function findPath(grid, from, to) {
    const start = cellOf(from.x, from.y)
    const prev = new Int32Array(cols * rows).fill(-1)
    prev[start] = start
    const queue = [start]
    const dist = (c) => {
      const p = centerOf(c)
      return Math.hypot(p.x - to.x, p.y - to.y)
    }
    let best = start
    let bestD = dist(start)
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]
      const d = dist(c)
      if (d < bestD) {
        best = c
        bestD = d
      }
      const cx = c % cols
      const cy = Math.floor(c / cols)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
          const n = ny * cols + nx
          if (prev[n] !== -1 || !grid[n]) continue
          if (dx && dy && (!grid[cy * cols + nx] || !grid[ny * cols + cx])) continue
          prev[n] = c
          queue.push(n)
        }
    }
    const path = []
    for (let c = best; c !== start; c = prev[c]) path.push(centerOf(c))
    path.reverse()
    if (best === cellOf(to.x, to.y) && canStand(grid, to.x, to.y)) {
      if (path.length) path[path.length - 1] = { x: to.x, y: to.y }
      else path.push({ x: to.x, y: to.y })
    }
    // Спрямлення: пропускаємо точки, до яких видно напряму.
    const out = []
    let cur = from
    let i = 0
    while (i < path.length) {
      let j = i
      while (j + 1 < path.length && lineClear(grid, cur, path[j + 1])) j++
      out.push(path[j])
      cur = path[j]
      i = j + 1
    }
    return out
  }

  /** Клітинки, які накриває прямокутник [x, y, w, h]; -1 — за межами мапи. */
  function cellsOf([x, y, w, h]) {
    const out = []
    for (let cy = Math.floor(y / CELL); cy <= Math.floor((y + h - 1) / CELL); cy++)
      for (let cx = Math.floor(x / CELL); cx <= Math.floor((x + w - 1) / CELL); cx++)
        out.push(cx < 0 || cy < 0 || cx >= cols || cy >= rows ? -1 : cy * cols + cx)
    return out
  }

  /** Чи досяжні з клітинки start усі точки взаємодії. */
  function allReachable(grid, start, interact) {
    const seen = new Uint8Array(cols * rows)
    const queue = [start]
    seen[start] = 1
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]
      const cx = c % cols
      const cy = Math.floor(c / cols)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx
        const ny = cy + dy
        const n = ny * cols + nx
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[n] || !grid[n]) continue
        seen[n] = 1
        queue.push(n)
      }
    }
    return interact.every((it) => seen[cellOf(it.near[0], it.near[1])])
  }

  return { cols, rows, cellOf, canStand, findPath, cellsOf, allReachable }
}

/** Де на мапі димарі й вогні — залежить від рівнів і декору гравця. */
function effectsFor(levels, deco) {
  const h = SPOTS.house
  const w = SPOTS.workshop
  const l = SPOTS.lighthouse
  const smoke = [{ x: h.x + 21, y: h.y - 84 }]
  if (levels.workshop >= 2) smoke.push({ x: w.x + 15, y: w.y - 90 })
  const lights = []
  const lamp = LIGHTHOUSE_LAMP[levels.lighthouse]
  if (lamp) lights.push({ x: l.x + lamp[0], y: l.y + lamp[1], r: 16 + levels.lighthouse * 6, beam: levels.lighthouse >= 3 })
  if (levels.pier >= 2) for (const dx of [-15, 15]) lights.push({ x: PIER.x + dx, y: 357, r: 9 })
  const fires = []
  for (const d of deco) {
    const g = DECO_GEOM[d.k]
    if (g?.light) lights.push({ x: d.x, y: d.y + g.light.dy, r: g.light.r, uid: d.id, warm: g.fire })
    if (g?.fire) fires.push({ x: d.x, y: d.y - 5, uid: d.id })
  }
  return { smoke, lights, fires }
}

/** Вогонь у печі хатинки. */
function homeEffects() {
  return { smoke: [], lights: [{ x: 189, y: 102, r: 26, warm: true }], fires: [] }
}

/**
 * Сцени. outdoor — вода, прибій, хмари, бульбашки врожаю й пісочниця; у хаті — темне тло довкола кімнати.
 * spawn — де стає гравець, зайшовши в сцену з іншої.
 */
const SCENES = {
  island: { map: MAP, walk: atlas.walk, bg: 'ground', outdoor: true, spawn: { x: SPOTS.house.x, y: SPOTS.house.y + 12, dir: 'down' } },
  home: { map: HOME_MAP, walk: atlas.homeWalk, bg: 'home', outdoor: false, spawn: { ...HOME_START, dir: 'up' } },
}
for (const sc of Object.values(SCENES)) sc.geo = geometry(sc.walk, sc.map)

/** Суша острова, на якій можна будувати: з генератора, без мостків над водою. */
const land = walkGrid(atlas.walk, [])

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} assets результат loadAssets()
 * @param {{ onNear: (id: string|null) => void, onInteract: (id: string) => void, onBubble: () => void,
 *   onBuildTap: (p: { x: number, y: number, uid: string|null }) => void }} cb
 */
export function createWalk(canvas, assets, cb) {
  const ctx = canvas.getContext('2d')
  const frames = atlas.frames
  const player = { x: START.x, y: START.y, dir: 'down', moving: false, step: 0 }
  let scene = SCENES.island
  let geo = scene.geo
  let interact = INTERACT
  let world = null // останні levels/chestOpen/deco — щоб перебудувати сцену при переході
  let list = []
  let grid = null
  let fx = { smoke: [], lights: [], fires: [] }
  // Пісочниця: режим, привид предмета, що ставимо, і виділена прикраса.
  let mode = 'walk'
  let ghost = null // { kind, x, y, uid?, ok, reason? }
  let selected = null
  const free = { x: 0, y: 0 } // камера в режимі будівництва
  let bubbles = {} // id будівлі → емодзі
  let bubbleHits = []
  let path = []
  let goal = null
  let marker = null
  let near = null
  let scale = 4
  let cam = { x: 0, y: 0, w: VIEW, h: VIEW }
  const keys = new Set()
  let held = null // { x, y } — палець тримають на екрані
  let lastRepath = 0
  let raf = 0
  let last = performance.now()
  let t = 0

  /** Перебудувати поточну сцену з останнього стану гри. */
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
    if (!geo.canStand(grid, player.x, player.y)) {
      player.x = scene.spawn.x
      player.y = scene.spawn.y
    }
  }

  function setWorld(levels, chestOpen, deco = []) {
    world = { levels, chestOpen, deco }
    rebuild()
  }

  /** Перейти в іншу сцену («island» / «home»): гравець стає біля входу. */
  function setScene(id) {
    const next = SCENES[id]
    if (!next || next === scene) return
    scene = next
    geo = scene.geo
    player.x = scene.spawn.x
    player.y = scene.spawn.y
    player.dir = scene.spawn.dir
    path = []
    goal = null
    marker = null
    held = null
    keys.clear()
    near = null
    cb.onNear(null)
    rebuild()
  }

  function resize() {
    const r = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(r.width * dpr))
    canvas.height = Math.max(1, Math.round(r.height * dpr))
    scale = Math.max(2, Math.round(canvas.width / VIEW))
    cam.w = canvas.width / scale
    cam.h = canvas.height / scale
  }

  function toWorld(e) {
    const r = canvas.getBoundingClientRect()
    const dx = ((e.clientX - r.left) / r.width) * canvas.width
    const dy = ((e.clientY - r.top) / r.height) * canvas.height
    return { x: dx / scale + cam.x, y: dy / scale + cam.y, dx, dy }
  }

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
      const me = geo.cellOf(player.x, player.y)
      if (!test[me]) return { ok: false, reason: 'Тут стоїть мандрівник' }
      if (!geo.allReachable(test, me, interact)) return { ok: false, reason: 'Це перекриє прохід' }
    }
    return { ok: true }
  }

  /** Що з декору гравця під точкою (спершу предмети, потім підлога). */
  function decoAt(p) {
    const hits = list.filter((q) => {
      if (!q.uid) return false
      const f = frames[q.s]
      return p.x >= q.x - f.w / 2 && p.x <= q.x + f.w / 2 && p.y >= q.y - f.h && p.y <= q.y + 1
    })
    hits.sort((a, b) => (a.layer === 'floor') - (b.layer === 'floor') || b.y - a.y)
    return hits[0]?.uid ?? null
  }

  function walkTo(target, goalId = null) {
    path = geo.findPath(grid, player, target)
    goal = goalId
    marker = path.length ? { ...path.at(-1), t } : null
  }

  function tap(p) {
    const bubble = bubbleHits.find((b) => Math.hypot(b.x - p.dx, b.y - p.dy) < b.r * 1.3)
    if (bubble) {
      cb.onBubble()
      return
    }
    const hit = interact.find(({ box: [x, y, w, h] }) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h)
    if (hit) {
      // Уже поруч — відкриваємо одразу.
      if (Math.hypot(player.x - hit.near[0], player.y - hit.near[1]) <= hit.r + 4) {
        path = []
        cb.onInteract(hit.id)
        return
      }
      walkTo({ x: hit.near[0], y: hit.near[1] }, hit.id)
      return
    }
    walkTo(p)
  }

  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId)
    const p = toWorld(e)
    if (mode === 'build') {
      held = { ...p, camX: free.x, camY: free.y, moved: false }
      return
    }
    held = { ...p, at: performance.now(), moved: false }
    tap(p)
  }
  const onMove = (e) => {
    if (!held) return
    const p = toWorld(e)
    const far = Math.hypot(p.dx - held.dx, p.dy - held.dy) > 10 * (window.devicePixelRatio || 1)
    if (mode === 'build') {
      // Будівництво: палець тягне камеру.
      if (far) held.moved = true
      if (held.moved) {
        free.x = held.camX - (p.dx - held.dx) / scale
        free.y = held.camY - (p.dy - held.dy) / scale
      }
      return
    }
    if (far) held = { ...p, at: held.at, moved: true }
  }
  const onUp = () => {
    if (mode === 'build' && held && !held.moved) cb.onBuildTap({ x: held.x, y: held.y, uid: decoAt(held) })
    held = null
  }
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }
  const onKey = (e) => {
    const k = KEYMAP[e.code]
    if (e.type === 'keydown' && ['Space', 'Enter', 'KeyE'].includes(e.code) && near) {
      e.preventDefault()
      cb.onInteract(near)
      return
    }
    if (!k) return
    e.preventDefault()
    if (e.type === 'keydown') {
      keys.add(k)
      path = []
      goal = null
    } else keys.delete(k)
  }

  const clampCam = (v, max) => (max <= 0 ? max / 2 : Math.max(0, Math.min(max, v)))

  function update(dt) {
    if (mode === 'build') {
      // Стрілки рухають камеру; мандрівник чекає.
      const vx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0)
      const vy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0)
      free.x = clampCam(free.x + vx * 140 * dt, scene.map.w - cam.w)
      free.y = clampCam(free.y + vy * 140 * dt, scene.map.h - cam.h)
      player.moving = false
      player.step = 0
      cam.x = Math.round(free.x)
      cam.y = Math.round(free.y)
      return
    }
    // Палець тримають і ведуть — перераховуємо шлях раз на 150 мс.
    if (held?.moved && t - lastRepath > 0.15) {
      lastRepath = t
      walkTo(held)
    }

    let vx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0)
    let vy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0)
    player.moving = false
    if (vx || vy) {
      const len = Math.hypot(vx, vy)
      const step = (SPEED * dt) / len
      if (geo.canStand(grid, player.x + vx * step, player.y)) player.x += vx * step
      if (geo.canStand(grid, player.x, player.y + vy * step)) player.y += vy * step
      player.moving = true
    } else if (path.length) {
      const wp = path[0]
      const dx = wp.x - player.x
      const dy = wp.y - player.y
      const d = Math.hypot(dx, dy)
      const step = SPEED * dt
      if (d <= step) {
        player.x = wp.x
        player.y = wp.y
        path.shift()
      } else {
        player.x += (dx / d) * step
        player.y += (dy / d) * step
      }
      vx = dx
      vy = dy
      player.moving = true
      if (!path.length) {
        marker = null
        if (goal) {
          const g = goal
          goal = null
          const it = interact.find((i) => i.id === g)
          if (it && Math.hypot(player.x - it.near[0], player.y - it.near[1]) <= it.r + 6) cb.onInteract(g)
        }
      }
    }
    if (player.moving) {
      if (Math.abs(vx) > Math.abs(vy)) player.dir = vx > 0 ? 'right' : 'left'
      else if (vy) player.dir = vy > 0 ? 'down' : 'up'
      player.step += dt
    } else player.step = 0

    // Що поруч.
    let found = null
    let bestD = Infinity
    for (const it of interact) {
      const d = Math.hypot(player.x - it.near[0], player.y - it.near[1])
      if (d <= it.r && d < bestD) {
        found = it.id
        bestD = d
      }
    }
    if (found !== near) {
      near = found
      cb.onNear(near)
    }

    // Камера: гравець по центру, без виходу за мапу.
    cam.x = Math.round(clampCam(player.x - cam.w / 2, scene.map.w - cam.w))
    cam.y = Math.round(clampCam(player.y - 12 - cam.h / 2, scene.map.h - cam.h))
  }

  function sprite(name, x, y) {
    const f = frames[name]
    if (!f) return
    ctx.drawImage(assets.sprites, f.x, f.y, f.w, f.h, Math.round(x - f.w / 2), Math.round(y - f.h), f.w, f.h)
  }

  /** Прикрасу, яку зараз пересуваємо, на старому місці не малюємо. */
  const hidden = (p) => ghost?.uid && p.uid === ghost.uid

  /** Рамка «ніжок»: заливка й контур. */
  function footprint([x, y, w, h], fill, stroke) {
    ctx.fillStyle = fill
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1 / scale
    ctx.strokeRect(x, y, w, h)
  }

  function draw() {
    const W = canvas.width
    const H = canvas.height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(scale, 0, 0, scale, -cam.x * scale, -cam.y * scale)

    if (scene.outdoor) {
      // Вода, що повільно дрейфує.
      const pat = ctx.createPattern(assets.waterFrames[Math.floor(t / 0.35) % 4], 'repeat')
      const drift = Math.floor(t * 3) % 64
      ctx.save()
      ctx.translate(drift, 0)
      ctx.fillStyle = pat
      ctx.fillRect(cam.x - drift - 64, cam.y - 64, cam.w + 128, cam.h + 128)
      ctx.restore()
      ctx.drawImage(assets.ground, 0, 0)
      // Прибій: кадри складені стовпчиком у foam.png.
      const shore = Math.floor(t / 0.3) % Math.round(assets.foam.height / MAP.h)
      ctx.drawImage(assets.foam, 0, shore * MAP.h, MAP.w, MAP.h, 0, 0, MAP.w, MAP.h)
    } else {
      ctx.fillStyle = '#120c08'
      ctx.fillRect(cam.x - 8, cam.y - 8, cam.w + 16, cam.h + 16)
      ctx.drawImage(assets[scene.bg], 0, 0)
    }

    for (const p of list) if (p.layer === 'floor' && !hidden(p)) sprite(p.s, p.x, p.y)

    // Сітка будівництва — ледь помітна, щоб було видно, куди ляже предмет.
    if (mode === 'build') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
      for (let x = Math.floor(cam.x / CELL) * CELL; x < cam.x + cam.w; x += CELL) ctx.fillRect(x, cam.y, 1 / scale, cam.h)
      for (let y = Math.floor(cam.y / CELL) * CELL; y < cam.y + cam.h; y += CELL) ctx.fillRect(cam.x, y, cam.w, 1 / scale)
    }

    // Ціль переходу: пульсуюче кільце.
    if (marker) {
      const k = (t - marker.t) % 0.8
      ctx.strokeStyle = 'rgba(255, 240, 160, 0.9)'
      ctx.lineWidth = 1
      ctx.strokeRect(Math.round(marker.x) - 3 - k * 2, Math.round(marker.y) - 2 - k, 6 + k * 4, 4 + k * 2)
    }

    // Гравець + об'єкти, відсортовані за низом.
    const objs = list.filter((p) => p.layer !== 'floor' && !hidden(p))
    objs.push({ s: 'hero', x: player.x, y: player.y })
    objs.sort((a, b) => a.y - b.y)
    for (const p of objs) {
      if (p.s !== 'hero') {
        sprite(p.s, p.x, p.y)
        continue
      }
      const px = Math.round(player.x)
      const py = Math.round(player.y)
      ctx.fillStyle = 'rgba(11, 32, 16, 0.3)'
      ctx.fillRect(px - 5, py - 1, 10, 2)
      ctx.fillRect(px - 4, py - 2, 8, 4)
      const seq = [1, 0, 2, 0]
      const fi = player.moving ? seq[Math.floor(player.step * 9) % 4] : 0
      const bob = player.moving && fi !== 0 ? -1 : 0
      sprite(`hero_${player.dir}_${fi}`, px, py + bob)
    }

    // Дим із комина: піксельні клуби, що ростуть і тануть.
    for (const s of fx.smoke)
      for (let k = 0; k < 6; k++) {
        const ph = (t * 0.32 + k / 6) % 1
        const size = Math.round(2 + ph * 4)
        ctx.fillStyle = `rgba(238, 238, 232, ${0.75 * (1 - ph)})`
        ctx.fillRect(Math.round(s.x + Math.sin(ph * 5 + k) * 2 + ph * 10 - size / 2), Math.round(s.y - 2 - ph * 34), size, size)
      }

    // Полум'я вогнищ: піксельні язики, що мерехтять.
    for (const f of fx.fires) {
      if (ghost?.uid === f.uid) continue
      for (let k = 0; k < 7; k++) {
        const ph = (t * 1.6 + k / 7) % 1
        const x = Math.round(f.x + Math.sin(k * 2.3 + t * 7) * (2.5 - ph * 2))
        const y = Math.round(f.y - ph * 10)
        const size = ph < 0.3 ? 2 : 1
        ctx.fillStyle = ph < 0.25 ? '#fff2a8' : ph < 0.55 ? '#ffb53a' : ph < 0.8 ? '#ff6a2a' : 'rgba(120, 110, 100, 0.5)'
        ctx.fillRect(x, y, size, size)
      }
    }

    // Вогні: маяк, ліхтарі на причалі й декор гравця.
    for (const l of fx.lights) {
      if (ghost?.uid && l.uid === ghost.uid) continue
      const pulse = l.warm ? 0.8 + Math.sin(t * 11 + l.x) * 0.12 + Math.sin(t * 17) * 0.08 : 0.75 + Math.sin(t * 3 + l.x) * 0.25
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r)
      const rgb = l.warm ? '255, 170, 80' : '255, 230, 140'
      g.addColorStop(0, `rgba(${rgb}, ${0.45 * pulse})`)
      g.addColorStop(1, `rgba(${rgb}, 0)`)
      ctx.fillStyle = g
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2)
      if (l.beam) {
        // Промінь, що обертається.
        const a = t * 1.2
        ctx.save()
        ctx.translate(l.x, l.y)
        ctx.rotate(a)
        const bg = ctx.createLinearGradient(0, 0, 90, 0)
        bg.addColorStop(0, 'rgba(255, 240, 170, 0.35)')
        bg.addColorStop(1, 'rgba(255, 240, 170, 0)')
        ctx.fillStyle = bg
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(90, -10)
        ctx.lineTo(90, 10)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }

    // Будівництво: виділена прикраса й привид нового місця.
    if (mode === 'build') {
      const blink = 0.55 + Math.sin(t * 6) * 0.25
      const sel = selected && !ghost && list.find((p) => p.uid === selected)
      if (sel) footprint(decoFootprint(sel.kind, sel.x, sel.y), `rgba(255, 220, 90, ${0.25 * blink})`, `rgba(255, 230, 120, ${blink})`)
      if (ghost) {
        const fp = decoFootprint(ghost.kind, ghost.x, ghost.y)
        const stroke = ghost.ok ? 'rgba(170, 255, 170, 0.95)' : 'rgba(255, 110, 100, 1)'
        footprint(fp, ghost.ok ? 'rgba(110, 230, 120, 0.35)' : 'rgba(255, 80, 70, 0.45)', stroke)
        // Невдале місце — привид блідий, а червона рамка лягає поверх нього.
        ctx.globalAlpha = ghost.ok ? 0.6 + blink * 0.3 : 0.35
        sprite(DECO_GEOM[ghost.kind].sprite, ghost.x, ghost.y)
        ctx.globalAlpha = 1
        if (!ghost.ok) footprint(fp, `rgba(255, 80, 70, ${0.3 * blink})`, stroke)
      }
    }

    // Тіні хмар — лише надворі.
    for (let k = 0; scene.outdoor && k < 3; k++) {
      const cx = ((t * 6 + k * 230) % (MAP.w + 240)) - 120
      const cy = 80 + k * 130
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70)
      g.addColorStop(0, 'rgba(10, 30, 50, 0.1)')
      g.addColorStop(1, 'rgba(10, 30, 50, 0)')
      ctx.fillStyle = g
      ctx.fillRect(cx - 70, cy - 70, 140, 140)
    }

    // Бульбашки врожаю — у пікселях екрана, щоб емодзі були чіткі.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    bubbleHits = []
    const dpr = window.devicePixelRatio || 1
    const r = 13 * dpr
    for (const [id, emoji] of Object.entries(scene.outdoor ? bubbles : {})) {
      // Над верхівкою спрайта будівлі (висота залежить від рівня).
      const p = list.find((q) => q.s === id || q.s.startsWith(`${id}_`))
      if (!p) continue
      const top = p.y - frames[p.s].h
      const sx = (p.x - cam.x) * scale
      const sy = (top - cam.y) * scale + Math.sin(t * 3 + p.x) * 3 * dpr - r
      if (sx < -r || sy < -r || sx > W + r || sy > H + r) continue
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.arc(sx, sy + 3 * dpr, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff4dc'
      ctx.strokeStyle = '#3b2a1c'
      ctx.lineWidth = 2 * dpr
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = `${15 * dpr}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emoji, sx, sy + dpr)
      bubbleHits.push({ x: sx, y: sy, r })
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    t += dt
    if (grid) {
      update(dt)
      draw()
    }
    raf = requestAnimationFrame(frame)
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  raf = requestAnimationFrame(frame)

  return {
    setWorld,
    setScene,
    canPlace,
    /** 'walk' — гуляємо, 'build' — пісочниця: палець рухає камеру, тап — вибір місця. */
    setMode(m) {
      if (m === mode) return
      mode = m
      held = null
      keys.clear()
      path = []
      goal = null
      marker = null
      if (m === 'build') {
        free.x = cam.x
        free.y = cam.y
        near = null
        cb.onNear(null)
      } else {
        ghost = null
        selected = null
      }
    },
    /** Привид предмета (або null). Повертає його разом із тим, чи можна тут ставити. */
    setGhost(g) {
      ghost = g ? { ...g, ...canPlace(g.kind, g.x, g.y, g.uid ?? null) } : null
      return ghost
    },
    setSelected(uid) {
      selected = uid
    },
    setBubbles(b) {
      bubbles = b
    },
    /** Підійти до точки взаємодії (кнопка під мапою). */
    goTo(id) {
      const it = interact.find((i) => i.id === id)
      if (it) walkTo({ x: it.near[0], y: it.near[1] }, id)
    },
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    },
  }
}
