/**
 * Кабелі під землею: прокладання маршруту, ділянки для зняття, хвилі струму.
 * Чиста логіка без рушія — клітинки сітки 8×8 px (cx, cy), суша — з тієї ж маски, що й на сервері.
 */

const SIDES = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

/** Ціна кроку: нова клітинка коштує дріт, по своєму кабелю — майже даром; поворот трохи дорожчий, щоб не було зигзагів. */
const STEP_NEW = 10
const STEP_OWN = 1
const TURN = 4

/**
 * Найдешевший маршрут кабелю від клітинки до клітинки — лише сушею, по сторонах (не діагоналлю).
 * Уже прокладений кабель використовує охоче (за нього не платиш), повертає лише там, де треба.
 * @param {[number, number]} from
 * @param {[number, number]} to
 * @param {{ cols: number, rows: number, land: (x: number, y: number) => boolean, has: (x: number, y: number) => boolean }} grid
 * @returns {{ cells: [number, number][], fresh: [number, number][] } | null} null — туди не дотягнутись
 */
export function routeWire(from, to, { cols, rows, land, has }) {
  const [fx, fy] = from
  const [tx, ty] = to
  if (!land(fx, fy) || !land(tx, ty)) return null
  const N = cols * rows
  const idx = (x, y) => y * cols + x
  // Стан — клітинка й напрямок, яким у неї прийшли (4 — старт, ще без напрямку).
  const cost = new Float64Array(N * 5).fill(Infinity)
  const prev = new Int32Array(N * 5).fill(-1)
  const heap = new MinHeap()
  const start = idx(fx, fy) * 5 + 4
  cost[start] = 0
  heap.push(0, start)
  const goal = idx(tx, ty)
  let end = -1
  while (heap.size) {
    const [c, s] = heap.pop()
    if (c > cost[s]) continue
    const cell = Math.floor(s / 5)
    if (cell === goal) {
      end = s
      break
    }
    const dir = s % 5
    const x = cell % cols
    const y = Math.floor(cell / cols)
    for (let d = 0; d < 4; d++) {
      const nx = x + SIDES[d][0]
      const ny = y + SIDES[d][1]
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !land(nx, ny)) continue
      const step = (has(nx, ny) ? STEP_OWN : STEP_NEW) + (dir !== 4 && dir !== d ? TURN : 0)
      const ns = idx(nx, ny) * 5 + d
      if (c + step < cost[ns]) {
        cost[ns] = c + step
        prev[ns] = s
        heap.push(c + step, ns)
      }
    }
  }
  if (end < 0) return null
  const cells = []
  for (let s = end; s >= 0; s = prev[s]) {
    const cell = Math.floor(s / 5)
    cells.push([cell % cols, Math.floor(cell / cols)])
  }
  cells.reverse()
  return { cells, fresh: cells.filter(([x, y]) => !has(x, y)) }
}

/**
 * Ділянка кабелю під клітинкою — прямий відрізок до повороту, розгалуження чи кінця.
 * Поворот і розгалуження лишаються на місці: зняв відрізок — решта мережі ціла й не «висить» шматками.
 * Тапнули саме поворот чи розгалуження — знімаємо лише його.
 * @param {[number, number]} at
 * @param {(x: number, y: number) => boolean} has
 * @returns {[number, number][]}
 */
export function segmentAt([sx, sy], has) {
  if (!has(sx, sy)) return []
  const around = (x, y) => SIDES.filter(([dx, dy]) => has(x + dx, y + dy))
  /** Вісь, уздовж якої клітинка «прохідна» (0 — горизонталь, 1 — вертикаль), або null. */
  const straight = (x, y) => {
    const n = around(x, y)
    if (n.length !== 2 || n[0][0] + n[1][0] !== 0 || n[0][1] + n[1][1] !== 0) return null
    return n[0][0] ? 0 : 1
  }
  const n = around(sx, sy)
  let axis
  if (n.length === 0) return [[sx, sy]]
  if (n.length === 1) axis = n[0][0] ? 0 : 1
  else {
    axis = straight(sx, sy)
    if (axis === null) return [[sx, sy]] // поворот чи розгалуження
  }
  const out = [[sx, sy]]
  for (const sign of [1, -1]) {
    let x = sx + (axis === 0 ? sign : 0)
    let y = sy + (axis === 1 ? sign : 0)
    while (has(x, y)) {
      if (straight(x, y) === axis) out.push([x, y])
      else {
        if (around(x, y).length === 1) out.push([x, y]) // кінець кабелю — теж знімаємо
        break
      }
      x += axis === 0 ? sign : 0
      y += axis === 1 ? sign : 0
    }
  }
  return out
}

/**
 * Відстань кожної клітинки мережі від джерела струму (кроками по кабелю) — для хвиль світла,
 * що біжать від вітряка. sources — клітинки кабелю, до яких під'єднано генератор.
 * @param {[number, number][]} cells
 * @param {[number, number][]} sources
 * @returns {Map<string, number>}
 */
export function flowDistance(cells, sources) {
  const inNet = new Set(cells.map(([x, y]) => `${x},${y}`))
  const dist = new Map()
  let front = sources.filter(([x, y]) => inNet.has(`${x},${y}`))
  for (const [x, y] of front) dist.set(`${x},${y}`, 0)
  let d = 0
  while (front.length) {
    d++
    const next = []
    for (const [x, y] of front)
      for (const [dx, dy] of SIDES) {
        const k = `${x + dx},${y + dy}`
        if (!inNet.has(k) || dist.has(k)) continue
        dist.set(k, d)
        next.push([x + dx, y + dy])
      }
    front = next
  }
  return dist
}

/** Мінімальна купа пар [ціна, значення]. */
class MinHeap {
  constructor() {
    this.k = []
    this.v = []
  }
  get size() {
    return this.k.length
  }
  push(key, val) {
    const { k, v } = this
    let i = k.length
    k.push(key)
    v.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= k[i]) break
      ;[k[p], k[i]] = [k[i], k[p]]
      ;[v[p], v[i]] = [v[i], v[p]]
      i = p
    }
  }
  pop() {
    const { k, v } = this
    const top = [k[0], v[0]]
    const lk = k.pop()
    const lv = v.pop()
    if (k.length) {
      k[0] = lk
      v[0] = lv
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < k.length && k[l] < k[m]) m = l
        if (r < k.length && k[r] < k[m]) m = r
        if (m === i) break
        ;[k[m], k[i]] = [k[i], k[m]]
        ;[v[m], v[i]] = [v[i], v[m]]
        i = m
      }
    }
    return top
  }
}
