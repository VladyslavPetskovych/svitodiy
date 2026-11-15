import { CELL } from './layout.js'

/**
 * Дерев'яний конвеєр (server/src/game/belts.js): чиста логіка й піксельне малювання без рушія.
 *
 * Стрічка — клітинки 8×8 з напрямком: 0 → праворуч, 1 ↓, 2 ←, 3 ↑. Лінія — від жолоба джерела
 * (рибальська хата, шахта) за стрілками до скрині. Сервер шле розклад кожної лінії: bt — коли востаннє
 * зійшла річ, fl — що вже в дорозі [[коли, id]], queue — що зійде далі, space — скільки ще влізе в скриню.
 * Звідси рахуємо, де просто зараз кожна річ, — так само, як рахує сервер, тож риба доїжджає до скрині
 * саме тоді, коли там її й зарахують.
 *
 * Вигляд — як ряд «Conveyor belts (wooden)» еталонного аркуша: темна дощата стрічка з поперечними
 * планками, що біжать, помаранчеві борти з залізними скобами й жовта стрілка.
 */

export const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

/** Напрямок від клітинки a до сусідньої b (або -1). */
export const dirOf = (a, b) => DIRS.findIndex(([dx, dy]) => b[0] - a[0] === dx && b[1] - a[1] === dy)

/**
 * Напрямки для маршруту: кожна клітинка дивиться на наступну, остання — туди ж, куди передостання,
 * або в задану клітинку after (скриня, у яку заїжджає стрічка).
 * @param {[number, number][]} cells
 * @param {[number, number] | null} after
 * @returns {[number, number, number][]}
 */
export function withDirs(cells, after = null) {
  return cells.map(([x, y], i) => {
    const next = cells[i + 1] ?? after
    let d = next ? dirOf([x, y], next) : -1
    if (d < 0) d = i > 0 ? dirOf(cells[i - 1], [x, y]) : 0
    return [x, y, Math.max(0, d)]
  })
}

/** Скільки мс їде річ від жолоба до скрині. */
export const travelMs = (line, speed) => (line.path.length / speed) * 1000

/**
 * Речі на лінії на мить T (серверний час): { id, s, t } — s — скільки клітинок проїхала від жолоба.
 * arrived — скільки вже доїхало до скрині з тих, що сервер ще не зарахував (для лічильника скрині).
 */
export function lineAt(line, T, { gapMs, speed }) {
  const travel = travelMs(line, speed)
  const moving = []
  let arrived = 0
  let left = 0
  if (!line.sink) return { moving, arrived, left: line.queue.length }
  const put = (t, id) => {
    if (T - t >= travel) arrived++
    else if (T >= t) moving.push({ id, s: ((T - t) / 1000) * speed, t })
  }
  for (const [t, id] of line.fl) put(t, id)
  // Що зійде з жолоба після останнього розрахунку на сервері — той самий розклад, що й там.
  const n = Math.min(line.queue.length, line.space)
  let k = 0
  for (let t = line.bt + gapMs; k < n && t <= T; t += gapMs, k++) put(t, line.queue[k])
  left = line.queue.length - k
  return { moving, arrived, left }
}

/** Точка (px мапи) на лінії, проїхавши s клітинок від центру жолоба; dir — напрямок у цій точці. */
export function pointAt(line, dirAt, s) {
  const i = Math.max(0, Math.min(line.path.length - 1, Math.floor(s)))
  const [x, y] = line.path[i]
  const d = dirAt(x, y) ?? 0
  const f = Math.min(1, s - i)
  return { x: x * CELL + CELL / 2 + DIRS[d][0] * f * CELL, y: y * CELL + CELL / 2 + DIRS[d][1] * f * CELL, d }
}

/* ───── Малювання (канва в пікселях арту) ───── */

const C = {
  out: '#2b1a0e',
  rail: '#b8682c',
  railHi: '#e3954a',
  belt: '#3d2c20',
  slat: '#2a1e15',
  slatHi: '#54402e',
  arrow: '#f0c04c',
  arrowLo: '#a8792a',
  iron: '#cfc8b8',
  ironLo: '#6a625a',
}

/**
 * Одна клітинка стрічки. open — сторони, де стрічка з'єднана (0…3), d — куди їде, phase — зсув планок (0…1).
 * @param {CanvasRenderingContext2D} g
 */
export function drawBeltCell(g, cx, cy, d, open, phase, showArrow = true) {
  const X = cx * CELL
  const Y = cy * CELL
  const px = (x, y, c) => {
    g.fillStyle = c
    g.fillRect(X + x, Y + y, 1, 1)
  }
  g.fillStyle = C.belt
  g.fillRect(X, Y, CELL, CELL)
  // Поперечні планки: через 2 px, біжать у бік руху (p — координата вздовж руху).
  const [dx, dy] = DIRS[d]
  const off = Math.floor(phase * 4) % 4
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const p = dx > 0 ? x : dx < 0 ? CELL - 1 - x : dy > 0 ? y : CELL - 1 - y
      const k = (((p - off) % 4) + 4) % 4
      if (k < 2) px(x, y, k === 0 ? C.slat : C.slatHi)
    }
  // Борти там, де стрічка не з'єднана: темний край, помаранчева дошка, скоба.
  const rail = (side) => {
    for (let i = 0; i < CELL; i++) {
      const [ox, oy, ix, iy] =
        side === 0 ? [CELL - 1, i, CELL - 2, i] : side === 1 ? [i, CELL - 1, i, CELL - 2] : side === 2 ? [0, i, 1, i] : [i, 0, i, 1]
      px(ox, oy, C.out)
      px(ix, iy, i % 4 === 1 ? C.railHi : C.rail)
    }
    // Залізна скоба посередині борту.
    const m = 3
    if (side === 0 || side === 2) {
      const x0 = side === 0 ? CELL - 2 : 1
      px(x0, m, C.iron)
      px(x0, m + 1, C.ironLo)
    } else {
      const y0 = side === 1 ? CELL - 2 : 1
      px(m, y0, C.iron)
      px(m + 1, y0, C.ironLo)
    }
  }
  for (let s = 0; s < 4; s++) if (!open.has(s)) rail(s)
  // Кути між двома відкритими сторонами — стовпчики, щоб поворот не «розтікався».
  const corner = [
    [0, 1, CELL - 1, CELL - 1],
    [1, 2, 0, CELL - 1],
    [2, 3, 0, 0],
    [3, 0, CELL - 1, 0],
  ]
  for (const [a, b, x, y] of corner) if (open.has(a) && open.has(b)) px(x, y, C.out)
  // Жовта стрілка-шеврон по центру: вістря попереду, тінь позаду.
  if (showArrow) {
    const at = (u, v) => [Math.floor(3.5 + u * dx - v * dy), Math.floor(3.5 + u * dy + v * dx)]
    for (const [u, v] of [[1, 0], [0, -1], [0, 1]]) {
      const [x, y] = at(u, v)
      const [lx, ly] = at(u - 1, v)
      px(lx, ly, C.arrowLo)
      px(x, y, C.arrow)
    }
  }
}

/** Світліше / темніше [r, g, b]. */
const shade = ([r, g, b], k) =>
  k > 0 ? `rgb(${r + (255 - r) * k | 0},${g + (255 - g) * k | 0},${b + (255 - b) * k | 0})` : `rgb(${r * (1 + k) | 0},${g * (1 + k) | 0},${b * (1 + k) | 0})`

/**
 * Річ на стрічці зверху — як ряд «Belt items» аркуша: риба — тільцем уздовж руху, хвостом назад;
 * камінь і решта — грудочкою. tint — [r, g, b] основний колір речі (з її спрайта).
 * x, y — центр у px мапи, d — напрямок руху.
 */
export function drawBeltItem(g, x, y, d, fish, tint) {
  const cx = Math.round(x)
  const cy = Math.round(y)
  const [dx, dy] = DIRS[d]
  // u — уздовж руху (голова попереду), v — поперек.
  const px = (u, v, c) => {
    g.fillStyle = c
    g.fillRect(cx + u * dx - v * dy, cy + u * dy + v * dx, 1, 1)
  }
  if (fish) {
    const back = shade(tint, -0.35)
    const body = shade(tint, 0.15)
    const belly = shade(tint, 0.5)
    for (let u = -1; u <= 2; u++) {
      px(u, -1, back)
      px(u, 0, body)
      px(u, 1, u < 2 ? belly : back)
    }
    px(3, 0, back) // морда
    px(2, 0, '#1b1410') // око
    px(-2, 0, back) // хвіст
    px(-3, -1, back)
    px(-3, 1, back)
    return
  }
  const hi = shade(tint, 0.35)
  const lo = shade(tint, -0.4)
  const mid = shade(tint, 0)
  const blob = [
    [-1, -1, hi],
    [0, -1, hi],
    [1, -1, mid],
    [-2, 0, mid],
    [-1, 0, hi],
    [0, 0, mid],
    [1, 0, mid],
    [2, 0, lo],
    [-1, 1, mid],
    [0, 1, lo],
    [1, 1, lo],
  ]
  // Грудочка завжди «згори-зліва» освітлена — не крутимо її за рухом.
  for (const [u, v, c] of blob) {
    g.fillStyle = c
    g.fillRect(cx + u, cy + v, 1, 1)
  }
}

/** Основний колір спрайта речі (середній з непрозорих пікселів) — один раз на картинку. */
const tints = new Map()
export function itemTint(url, fallback = [150, 150, 150]) {
  if (!url) return fallback
  const got = tints.get(url)
  if (got) return got.rgb ?? fallback
  const rec = { rgb: null }
  tints.set(url, rec)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    try {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const { data } = g.getImageData(0, 0, c.width, c.height)
      let r = 0
      let gg = 0
      let b = 0
      let n = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue
        const lum = data[i] + data[i + 1] + data[i + 2]
        if (lum < 120) continue // контур не рахуємо
        r += data[i]
        gg += data[i + 1]
        b += data[i + 2]
        n++
      }
      if (n) rec.rgb = [r / n, gg / n, b / n]
    } catch {
      /* картинка з іншого домену — лишаємо запасний колір */
    }
  }
  img.src = url
  return fallback
}
