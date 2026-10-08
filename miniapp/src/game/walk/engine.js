import atlas from './atlas.json'
import { CELL, INTERACT, MAP, PIER, SPOTS, START, placements, walkGrid } from './layout.js'

/**
 * Прогулянка островом: canvas, камера, гравець, пошук шляху й ефекти.
 * Без React — екран IslandWalk лише створює рушій і передає йому стан гри.
 */

const SPEED = 62 // px арту за секунду
const VIEW = 200 // скільки px арту хочемо бачити по ширині
const ASSETS = ['ground', 'foam', 'water', 'sprites']

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

const cols = atlas.walk[0].length
const rows = atlas.walk.length
const cellOf = (x, y) => Math.floor(y / CELL) * cols + Math.floor(x / CELL)
const centerOf = (c) => ({ x: (c % cols) * CELL + CELL / 2, y: Math.floor(c / cols) * CELL + CELL / 2 })

/** Ширина «ступні» гравця: точки, які мусять бути на прохідних клітинках. */
function canStand(grid, x, y) {
  for (const [dx, dy] of [[-3, -1], [3, -1], [-3, -4], [3, -4]]) {
    const px = x + dx
    const py = y + dy
    if (px < 0 || py < 0 || px >= MAP.w || py >= MAP.h || !grid[cellOf(px, py)]) return false
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

/** Де на мапі димарі й вогні — залежить від рівнів. */
function effectsFor(levels) {
  const h = SPOTS.house
  const w = SPOTS.workshop
  const l = SPOTS.lighthouse
  const smoke = [{ x: h.x + 21, y: h.y - 84 }]
  if (levels.workshop >= 2) smoke.push({ x: w.x + 15, y: w.y - 90 })
  const lights = []
  if (levels.lighthouse > 0) {
    const H = 26 + 14 * levels.lighthouse + 46
    lights.push({ x: l.x, y: l.y - H + 22, r: 16 + levels.lighthouse * 6, beam: levels.lighthouse >= 3 })
  }
  if (levels.pier >= 2) for (const dx of [-15, 15]) lights.push({ x: PIER.x + dx, y: 357, r: 9 })
  return { smoke, lights }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} assets результат loadAssets()
 * @param {{ onNear: (id: string|null) => void, onInteract: (id: string) => void, onBubble: () => void }} cb
 */
export function createWalk(canvas, assets, cb) {
  const ctx = canvas.getContext('2d')
  const frames = atlas.frames
  const player = { x: START.x, y: START.y, dir: 'down', moving: false, step: 0 }
  let list = []
  let grid = null
  let fx = { smoke: [], lights: [] }
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

  function setWorld(levels, chestOpen) {
    list = placements(levels, chestOpen)
    grid = walkGrid(atlas.walk, list)
    fx = effectsFor(levels)
    if (!canStand(grid, player.x, player.y)) {
      player.x = START.x
      player.y = START.y
    }
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

  function walkTo(target, goalId = null) {
    path = findPath(grid, player, target)
    goal = goalId
    marker = path.length ? { ...path.at(-1), t } : null
  }

  function tap(p) {
    const bubble = bubbleHits.find((b) => Math.hypot(b.x - p.dx, b.y - p.dy) < b.r * 1.3)
    if (bubble) {
      cb.onBubble()
      return
    }
    const hit = INTERACT.find(({ box: [x, y, w, h] }) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h)
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
    held = { ...p, at: performance.now(), moved: false }
    tap(p)
  }
  const onMove = (e) => {
    if (!held) return
    const p = toWorld(e)
    if (Math.hypot(p.dx - held.dx, p.dy - held.dy) > 12 * (window.devicePixelRatio || 1)) held = { ...p, at: held.at, moved: true }
  }
  const onUp = () => {
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

  function update(dt) {
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
      if (canStand(grid, player.x + vx * step, player.y)) player.x += vx * step
      if (canStand(grid, player.x, player.y + vy * step)) player.y += vy * step
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
          const it = INTERACT.find((i) => i.id === g)
          if (Math.hypot(player.x - it.near[0], player.y - it.near[1]) <= it.r + 6) cb.onInteract(g)
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
    for (const it of INTERACT) {
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
    const clamp = (v, max) => (max <= 0 ? max / 2 : Math.max(0, Math.min(max, v)))
    cam.x = Math.round(clamp(player.x - cam.w / 2, MAP.w - cam.w))
    cam.y = Math.round(clamp(player.y - 12 - cam.h / 2, MAP.h - cam.h))
  }

  function sprite(name, x, y) {
    const f = frames[name]
    if (!f) return
    ctx.drawImage(assets.sprites, f.x, f.y, f.w, f.h, Math.round(x - f.w / 2), Math.round(y - f.h), f.w, f.h)
  }

  function draw() {
    const W = canvas.width
    const H = canvas.height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(scale, 0, 0, scale, -cam.x * scale, -cam.y * scale)

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

    for (const p of list) if (p.layer === 'floor') sprite(p.s, p.x, p.y)

    // Ціль переходу: пульсуюче кільце.
    if (marker) {
      const k = (t - marker.t) % 0.8
      ctx.strokeStyle = 'rgba(255, 240, 160, 0.9)'
      ctx.lineWidth = 1
      ctx.strokeRect(Math.round(marker.x) - 3 - k * 2, Math.round(marker.y) - 2 - k, 6 + k * 4, 4 + k * 2)
    }

    // Гравець + об'єкти, відсортовані за низом.
    const objs = list.filter((p) => p.layer !== 'floor')
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

    // Вогні: маяк і ліхтарі на причалі.
    for (const l of fx.lights) {
      const pulse = 0.75 + Math.sin(t * 3 + l.x) * 0.25
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r)
      g.addColorStop(0, `rgba(255, 230, 140, ${0.45 * pulse})`)
      g.addColorStop(1, 'rgba(255, 230, 140, 0)')
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

    // Тіні хмар.
    for (let k = 0; k < 3; k++) {
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
    for (const [id, emoji] of Object.entries(bubbles)) {
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
    setBubbles(b) {
      bubbles = b
    },
    /** Підійти до точки взаємодії (кнопка під мапою). */
    goTo(id) {
      const it = INTERACT.find((i) => i.id === id)
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
