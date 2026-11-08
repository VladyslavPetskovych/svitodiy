import { CELL } from './layout.js'

/**
 * Сітка прохідності сцени: клітинки, «ступня» мандрівника, пошук шляху й перевірка проходів.
 * Координати — пікселі арту (x — праворуч, y — вниз по мапі); у 3D це осі X і Z.
 * @param {string[]} walk рядки '0'/'1' з генератора
 * @param {{ w: number, h: number }} map
 */
export function geometry(walk, map) {
  const cols = walk[0].length
  const rows = walk.length
  const cellOf = (x, y) => Math.floor(y / CELL) * cols + Math.floor(x / CELL)
  const centerOf = (c) => ({ x: (c % cols) * CELL + CELL / 2, y: Math.floor(c / cols) * CELL + CELL / 2 })

  /**
   * «Ступня» мандрівника — прямокутник 6×3 px над якорем (x ±3, y −4…−1).
   * Він менший за клітинку, тож досить перевірити чотири кути. Цим самим
   * прямокутником зіштовхується фізика (physics.js), тож шлях і рух не сперечаються.
   */
  function canStand(grid, x, y) {
    for (const [dx, dy] of FOOT) {
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

/** Кути «ступні» відносно якоря мандрівника. */
const FOOT = [
  [-3, -1],
  [3, -1],
  [-3, -4],
  [3, -4],
]
