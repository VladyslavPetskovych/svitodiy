/**
 * Генератор текстур і спрайтів для прогулянки рідним островом.
 *   node scripts/gen-island-art.mjs [--preview <dir>]
 *
 * Пише public/game/walk/{ground,foam,water,sprites}.png і src/game/walk/atlas.json.
 * Усе детерміноване (фіксований seed) — повторний запуск дає ті самі файли.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { BEDS, BOARDWALK, CELL, DECOR, INTERACT, LAND, MAP, PATH, PIER, PLAZA, TRAILS, placements, walkGrid as mergeWalk } from '../src/game/walk/layout.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PUBLIC = join(ROOT, 'public/game/walk')
const OUT_ATLAS = join(ROOT, 'src/game/walk/atlas.json')

/* ───────── PNG ───────── */

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(img) {
  const { w, h, d } = img
  const stride = w * 4 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) Buffer.from(d.buffer, y * w * 4, w * 4).copy(raw, y * stride + 1)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ───────── Полотно ───────── */

const rgbCache = new Map()
function rgb(hex) {
  let c = rgbCache.get(hex)
  if (!c) {
    const n = parseInt(hex.slice(1), 16)
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    rgbCache.set(hex, c)
  }
  return c
}

class Img {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.d = new Uint8ClampedArray(w * h * 4)
  }
  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0
    return this.d[(y * this.w + x) * 4 + 3]
  }
  /** Піксель із накладанням (a < 1 — напівпрозорий поверх наявного). */
  set(x, y, hex, a = 1) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return
    const [r, g, b] = rgb(hex)
    const i = (y * this.w + x) * 4
    const d = this.d
    if (a >= 1) {
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
      d[i + 3] = 255
      return
    }
    const da = d[i + 3] / 255
    const oa = a + da * (1 - a)
    d[i] = (r * a + d[i] * da * (1 - a)) / oa
    d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa
    d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa
    d[i + 3] = oa * 255
  }
  /** Затемнити/освітлити лише непрозорі пікселі. */
  tint(x, y, hex, a) {
    if (this.alpha(x, y)) this.set(x, y, hex, a)
  }
  rect(x, y, w, h, hex, a = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, hex, a)
  }
  hline(x0, x1, y, hex, a = 1) {
    for (let x = x0; x <= x1; x++) this.set(x, y, hex, a)
  }
  vline(x, y0, y1, hex, a = 1) {
    for (let y = y0; y <= y1; y++) this.set(x, y, hex, a)
  }
  ellipse(cx, cy, rx, ry, hex, a = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy <= 1) this.set(x, y, hex, a)
      }
  }
  /** Рядки символів → пікселі за палітрою; «.» — прозорий. */
  rows(lines, x, y, pal, flip = false) {
    lines.forEach((line, j) => {
      const n = line.length
      for (let i = 0; i < n; i++) {
        const ch = line[flip ? n - 1 - i : i]
        if (ch !== '.' && pal[ch]) this.set(x + i, y + j, pal[ch])
      }
    })
    return this
  }
  blit(src, x, y, flip = false) {
    for (let j = 0; j < src.h; j++)
      for (let i = 0; i < src.w; i++) {
        const si = (j * src.w + (flip ? src.w - 1 - i : i)) * 4
        const a = src.d[si + 3]
        if (!a) continue
        const hex = '#' + [src.d[si], src.d[si + 1], src.d[si + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')
        this.set(x + i, y + j, hex, a / 255)
      }
  }
  /** Темний контур навколо непрозорого (зовнішній, 1 px). */
  outline(hex, a = 1) {
    const mark = []
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y)) continue
        if (this.alpha(x - 1, y) > 128 || this.alpha(x + 1, y) > 128 || this.alpha(x, y - 1) > 128 || this.alpha(x, y + 1) > 128) mark.push([x, y])
      }
    for (const [x, y] of mark) this.set(x, y, hex, a)
    return this
  }
}

/* ───────── Шум ───────── */

function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 982451653)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
function vnoise(x, y, seed, period = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = smooth(x - xi)
  const fy = smooth(y - yi)
  const w = (v) => (period ? ((v % period) + period) % period : v)
  const a = hash(w(xi), w(yi), seed)
  const b = hash(w(xi + 1), w(yi), seed)
  const c = hash(w(xi), w(yi + 1), seed)
  const d = hash(w(xi + 1), w(yi + 1), seed)
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy)
}
function fbm(x, y, seed, oct = 4, period = 0) {
  let v = 0
  let amp = 0.5
  let f = 1
  let norm = 0
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise(x * f, y * f, seed + i * 17, period ? period * f : 0)
    norm += amp
    amp *= 0.5
    f *= 2
  }
  return v / norm
}
/** Комірчастий шум: відстані до двох найближчих центрів + id комірки (для бруківки й каміння). */
function worley(x, y, size, seed) {
  const cx = Math.floor(x / size)
  const cy = Math.floor(y / size)
  let d1 = Infinity
  let d2 = Infinity
  let id = 0
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i
      const gy = cy + j
      const px = (gx + 0.15 + 0.7 * hash(gx, gy, seed)) * size
      const py = (gy + 0.15 + 0.7 * hash(gx, gy, seed + 1)) * size
      const dd = Math.hypot(x - px, y - py)
      if (dd < d1) {
        d2 = d1
        d1 = dd
        id = hash(gx, gy, seed + 2)
      } else if (dd < d2) d2 = dd
    }
  return { d1, d2, id }
}
const pick = (arr, t) => arr[Math.min(arr.length - 1, Math.floor(t * arr.length))]

/* ───────── Палітра ───────── */

const C = {
  K: '#2b1d16',
  grass: ['#3f8a2c', '#4f9c34', '#5fae3e', '#6fbd47'],
  grassDark: '#2f6b22',
  grassEdge: '#37782a',
  grassLight: '#8fd05a',
  sand: ['#e2c587', '#ead193', '#f1dca4'],
  sandWet: '#cfb178',
  sandSpeck: '#c4a26a',
  dirt: '#7a5232',
  dirtDark: '#5a3a22',
  stone: ['#9c9488', '#aaa196', '#b8b0a3'],
  stoneHi: '#cfc8bb',
  stoneLo: '#6f675c',
  grout: '#5e574f',
  water: '#3b7fd0',
  waterDark: '#3270c0',
  waterHi: '#6fb2ef',
  waterFoam: '#cfeaff',
  shallow: '#7fd0e6',
  woodLo: '#5b3a22',
  wood: '#8b5d3b',
  woodHi: '#b07a4c',
  woodPale: '#c79a62',
  red: '#b5452d',
  redLo: '#8e3322',
  redHi: '#d0623f',
  light: '#ffd35a',
  lightHi: '#fff2a8',
}

/* ───────── Рельєф ───────── */

function field(blobs, x, y, seed, amp) {
  let best = -Infinity
  for (const b of blobs) {
    const dx = (x - b.x) / b.rx
    const dy = (y - b.y) / b.ry
    best = Math.max(best, 1 - Math.sqrt(dx * dx + dy * dy))
  }
  return best + (fbm(x / 36, y / 36, seed) - 0.5) * amp
}

function distToLine(points, x, y) {
  let best = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[i + 1]
    const vx = bx - ax
    const vy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)))
    best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t))
  }
  return best
}

/** Відстань (px) від кожного пікселя до найближчого, де mask = 1. Два проходи фаски. */
function distanceTo(mask, w, h) {
  const d = new Float32Array(w * h)
  const D = Math.SQRT2
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? 0 : 1e9
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let v = d[i]
      if (!v) continue
      if (x > 0) v = Math.min(v, d[i - 1] + 1)
      if (y > 0) {
        v = Math.min(v, d[i - w] + 1)
        if (x > 0) v = Math.min(v, d[i - w - 1] + D)
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + D)
      }
      d[i] = v
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      let v = d[i]
      if (!v) continue
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1)
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 1)
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + D)
        if (x > 0) v = Math.min(v, d[i + w - 1] + D)
      }
      d[i] = v
    }
  return d
}

const WATER = 0
const SAND = 1
const GRASS = 2
const ROCK = 3
const CLIFF_H = 12

/** Класифікація пікселів, обрив, бруківка, стежки й поля відстаней. */
function terrain() {
  const { w, h } = MAP
  const N = w * h
  const cls = new Uint8Array(N)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const l = field(LAND.shore, x, y, 11, 0.16)
      if (l < 0) cls[i] = WATER
      else if (field(LAND.rocks, x, y, 23, 0.3) > 0) cls[i] = ROCK
      else if (field(LAND.plateau, x, y, 31, 0.14) > 0 && l > 0.07) cls[i] = GRASS
      else cls[i] = SAND
    }
  // Обрив під краєм плато (вид 3/4): смуга під травою, якщо під нею не вода.
  const cliff = new Uint8Array(N)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (cls[i] === GRASS || cls[i] === WATER) continue
      for (let j = 1; j <= CLIFF_H && y - j >= 0; j++) {
        const above = cls[(y - j) * w + x]
        if (above === GRASS) {
          cliff[i] = j
          break
        }
        if (above === WATER) break
      }
    }
  const path = new Float32Array(N)
  const trail = new Float32Array(N)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const wobble = (fbm(x / 9, y / 9, 41) - 0.5) * 4
      const road = distToLine(PATH.points, x, y) - (PATH.w / 2 + wobble)
      const plaza = Math.hypot(x - PLAZA.x, (y - PLAZA.y) * 1.25) - PLAZA.r - wobble
      path[i] = Math.min(road, plaza)
      let tr = Infinity
      for (const t of TRAILS) tr = Math.min(tr, distToLine(t.points, x, y) - t.w / 2 - (fbm(x / 6, y / 6, 43) - 0.5) * 3)
      trail[i] = tr
    }
  const isWater = cls.map((c) => (c === WATER ? 1 : 0))
  const isLand = cls.map((c) => (c === WATER ? 0 : 1))
  const notGrass = cls.map((c) => (c !== GRASS ? 1 : 0))
  const isCliff = cliff.map((c) => (c ? 1 : 0))
  return {
    cls,
    cliff,
    path,
    trail,
    dWater: distanceTo(isWater, w, h), // для суші: як далеко вода
    dLand: distanceTo(isLand, w, h), // для води: як далеко берег
    dEdge: distanceTo(notGrass, w, h), // для трави: як далеко край плато
    dCliff: distanceTo(isCliff, w, h),
  }
}

/* ───────── Палітри землі (рампи від тіні до світла) ───────── */

const GRASS_PAL = ['#1f4a2a', '#28602e', '#337633', '#418c37', '#52a13c', '#66b443', '#7fc74d', '#9ad85a']
const DRY_PAL = ['#3a5a26', '#4c7029', '#60862e', '#779b35', '#90af3f', '#a9c24e', '#c2d466']
const SAND_PAL = ['#c7a06a', '#d4b079', '#dfc088', '#e8cd97', '#f0daa8', '#f7e7bf', '#fcf2d6']
const WET_PAL = ['#8f7450', '#a3855c', '#b5966a', '#c4a679']
const DIRT_PAL = ['#4a2f1d', '#5e3d25', '#734d2f', '#89603b', '#9f7449', '#b5895c']
const CLIFF_PAL = ['#3a2f28', '#54463b', '#6c5b4c', '#86725f', '#9f8a74', '#b8a289', '#d0bba0']
const STONE_PALS = [
  ['#5b5650', '#77716a', '#948e85', '#b0aa9f', '#cbc5b9', '#e2ddd1'],
  ['#5e5249', '#7c6d60', '#998877', '#b4a28f', '#cdbca6', '#e2d3bd'],
  ['#4f565b', '#6b7378', '#889095', '#a6adb0', '#c3c9cb', '#dde2e2'],
]
const SLAB_PAL = ['#3a3631', '#4e4943', '#635d55', '#7a736a', '#918a7f', '#aaa296', '#c3bbae']

/** Упорядкований дизеринг Байєра 4×4 — плавні переходи без «шуму». */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)]
/**
 * Тон 0…1 → колір рампи. Більшість площі — суцільні відтінки,
 * дизеринг лише вузькою смугою на межі між ними (як малюють піксель-художники).
 */
function ramp(pal, v, x, y, dither = bayer) {
  const f = Math.max(0, Math.min(0.9999, v)) * (pal.length - 1)
  const i = Math.floor(f)
  const fr = Math.max(0, Math.min(1, (f - i - 0.5) / 0.32 + 0.5))
  return pal[Math.min(pal.length - 1, i + (fr > dither(x, y) ? 1 : 0))]
}
/** Зернистий дизеринг для природних поверхонь (трава, пісок) — без «шахівниці». */
const grain = (x, y) => hash(x, y, 999)
const clamp01 = (v) => Math.max(0, Math.min(1, v))

/** Брукований камінь із фаскою: світлий верх-ліво, тінь низ-право, мох у швах. */
function cobble(x, y, size, seed) {
  const gap = (px, py) => {
    const wv = worley(px, py, size, seed)
    return wv.d2 - wv.d1 < 1.25
  }
  const wv = worley(x, y, size, seed)
  if (wv.d2 - wv.d1 < 1.25) return { grout: true, id: wv.id }
  const pal = STONE_PALS[Math.floor(wv.id * 3) % 3]
  let tone = 0.48 + (wv.id - 0.5) * 0.25 + (hash(x, y, 3) - 0.5) * 0.12
  if (gap(x - 1, y - 1)) tone = 0.88
  else if (gap(x - 2, y - 2)) tone += 0.14
  if (gap(x + 1, y + 1)) tone = 0.12
  else if (gap(x + 2, y + 2)) tone -= 0.12
  return { col: ramp(pal, tone, x, y), id: wv.id }
}

function groundImage(t) {
  const { w, h } = MAP
  const img = new Img(w, h)
  const { cls, cliff, path, trail, dWater, dLand, dEdge, dCliff } = t
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? WATER : cls[y * w + x])
  const idx = (x, y) => y * w + x

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = idx(x, y)
      const c = cls[i]
      const n = hash(x, y, 5)

      /* Вода: бірюзова мілина з піщаним дном, обрив у глибину, темніша далечінь. */
      if (c === WATER) {
        const dl = dLand[i]
        if (dl < 20) {
          const k = 1 - dl / 20
          img.set(x, y, '#5fd3cf', 0.6 * k ** 1.4)
          if (dl < 7) img.set(x, y, '#ecd9a4', 0.38 * (1 - dl / 7))
          // Водорості на дні мілини.
          if (dl > 6 && fbm(x / 7, y / 7, 88) > 0.64 && n < 0.5) img.set(x, y, '#1f7a64', 0.35)
        }
        if (dl > 17 && dl < 22 && bayer(x, y) < 0.5) img.set(x, y, '#1e5aa0', 0.22)
        if (dl > 26) img.set(x, y, '#0f3570', Math.min(0.42, (dl - 26) / 110))
        continue
      }

      /* Обрив: шари каменю, тінь під козирком трави, темна основа. */
      if (cliff[i] && path[i] > 0) {
        const j = cliff[i]
        if (j === 1) {
          img.set(x, y, hash(x, 7, 9) < 0.55 ? GRASS_PAL[2] : GRASS_PAL[1])
          continue
        }
        if (j === 2 && hash(x, 8, 9) < 0.4) {
          img.set(x, y, GRASS_PAL[1])
          continue
        }
        // Широкі горизонтальні брили, світлий верх кожної, тріщини між ними.
        const sx = x * 0.42
        const sy = y * 1.25 + fbm(x / 14, 0, 71) * 5
        const wv = worley(sx, sy, 6, 77)
        if (wv.d2 - wv.d1 < 0.7) {
          img.set(x, y, CLIFF_PAL[0])
          continue
        }
        let tone = 0.6 + (wv.id - 0.5) * 0.3 - (j / CLIFF_H) * 0.18 + (fbm(x / 3, y / 2, 72) - 0.5) * 0.12
        const up = worley(sx, sy - 1.25, 6, 77)
        const up2 = worley(sx, sy - 2.5, 6, 77)
        if (up.d2 - up.d1 < 0.7) tone = 0.97
        else if (up2.d2 - up2.d1 < 0.7) tone += 0.16
        const dn = worley(sx, sy + 1.25, 6, 77)
        if (dn.d2 - dn.d1 < 0.7) tone -= 0.3
        if (j === 3) tone -= 0.22 // тінь під козирком трави
        img.set(x, y, ramp(CLIFF_PAL, tone, x, y))
        if (tone > 0.9 && hash(x, y, 33) < 0.3) img.set(x, y, '#7d9a3e') // мох на виступах
        if (j === CLIFF_H) img.set(x, y, CLIFF_PAL[0])
        continue
      }

      /* Бруківка, сходи, кладка на піску. */
      if (path[i] < 0 && c !== ROCK) {
        if (cliff[i]) {
          // Сходи: кожна сходинка — 3 ряди (верх, лице, тінь), по боках — темні щоки.
          const j = cliff[i] - 1
          const row = j % 3
          const blk = (x + (Math.floor(j / 3) % 2) * 4) % 9
          let tone = row === 0 ? 0.85 : row === 1 ? 0.55 : 0.2
          if (row === 1 && blk === 0) tone = 0.25
          if (path[i] > -2.5) tone = 0.1
          img.set(x, y, ramp(STONE_PALS[0], tone + (n - 0.5) * 0.08, x, y))
          continue
        }
        if (c === SAND) {
          // Утоптаний пісок; плити-сходинки домальовуються окремо.
          img.set(x, y, ramp(SAND_PAL, 0.38 + (fbm(x / 6, y / 6, 3) - 0.5) * 0.3, x, y))
          continue
        }
        // Біля краю каміння рідшає, між ним — утоптана земля.
        const cb = cobble(x, y, 6.5, 91)
        const edge = path[i] > -3.5 && hash(Math.floor(cb.id * 1e6), 1, 5) < 0.45
        if (cb.grout || edge) {
          const moss = fbm(x / 4, y / 4, 66) > 0.6
          img.set(x, y, moss && !edge ? (n < 0.5 ? '#4f6b35' : '#5d7a3a') : ramp(DIRT_PAL, 0.32 + n * 0.2, x, y))
        } else img.set(x, y, cb.col)
        continue
      }

      /* Скелястий мис: плоскі плити з фаскою, тріщини з мохом, лишайник. */
      if (c === ROCK) {
        const sx = x * 0.85
        const sy = y * 1.1
        const wv = worley(sx, sy, 10, 61)
        const e = wv.d2 - wv.d1
        if (e < 1.3) {
          img.set(x, y, fbm(x / 5, y / 5, 62) > 0.55 ? (n < 0.5 ? '#3f5f2a' : '#567a34') : '#2a2622')
          continue
        }
        let tone = 0.55 + (wv.id - 0.5) * 0.3 + (fbm(x / 4, y / 4, 64) - 0.5) * 0.15
        const up = worley(sx - 1, sy - 1.2, 10, 61)
        if (up.d2 - up.d1 < 1.3) tone = 0.95
        const dn = worley(sx + 1, sy + 1.6, 10, 61)
        if (dn.d2 - dn.d1 < 1.3) tone = 0.15
        if (dWater[i] < 4) tone -= 0.25 * (1 - dWater[i] / 4) // мокрі біля води
        img.set(x, y, ramp(SLAB_PAL, tone, x, y))
        if (n < 0.012) img.set(x, y, '#b9b84e') // лишайник
        else if (n > 0.993) img.set(x, y, '#d08b3c')
        continue
      }

      /* Пісок: брижі від вітру, мокра смуга з відблисками неба. */
      if (c === SAND) {
        const dw = dWater[i]
        let tone = 0.55 + (fbm(x / 11, y / 11, 3) - 0.5) * 0.4
        const rip = Math.sin(x * 0.2 + y * 0.62 + fbm(x / 20, y / 20, 8) * 8)
        const ripK = clamp01((dw - 7) / 5) * clamp01((dEdge[i] - 4) / 6)
        if (rip > 0.8) tone += 0.25 * ripK
        else if (rip < -0.82) tone -= 0.22 * ripK
        if (dw < 7) {
          const wet = 1 - dw / 7
          img.set(x, y, ramp(WET_PAL, 0.25 + (1 - wet) * 0.75 + (n - 0.5) * 0.15, x, y))
          if (dw < 3 && n < 0.05) img.set(x, y, '#e6f1ef') // відблиск неба в мокрому піску
        } else img.set(x, y, ramp(SAND_PAL, tone, x, y, grain))
        if (dw >= 7 && n < 0.02) img.set(x, y, SAND_PAL[0])
        // Лінія припливу: смужка водоростей і трісок.
        if (dw > 8 && dw < 10.5 && fbm(x / 5, y / 5, 92) > 0.55 && n < 0.3) img.set(x, y, n < 0.15 ? '#4f6a2c' : '#7a5c33')
        continue
      }

      /* Трава: великі плями соковитої й підсохлої трави, дизеринг, стежки. */
      const lush = fbm(x / 42, y / 42, 7)
      const detail = fbm(x / 8, y / 8, 17)
      const dry = clamp01((fbm(x / 60, y / 60, 29) - 0.55) * 12)
      let tone = 0.22 + lush * 0.55 + (detail - 0.5) * 0.4 + (n - 0.5) * 0.06
      // Легке світло зверху-зліва на все плато.
      tone += (0.5 - (x / w + y / h) / 2) * 0.15
      const pal = dry > grain(x + 7, y) ? DRY_PAL : GRASS_PAL
      let col = ramp(pal, tone, x, y, grain)
      const tr = trail[i]
      if (tr < 0) {
        // Стежка: утоптана земля з камінцями.
        col = ramp(DIRT_PAL, 0.45 + (fbm(x / 5, y / 5, 44) - 0.5) * 0.5 + (tr < -2.5 ? 0.1 : 0), x, y)
        if (n < 0.04) col = '#a39c90'
      } else if (tr < 2.5 && bayer(x, y) > tr / 2.5) col = ramp(DRY_PAL, 0.45 + n * 0.3, x, y)
      if (path[i] >= 0 && path[i] < 2.5 && bayer(x, y) > path[i] / 2.5) col = ramp(DIRT_PAL, 0.4 + n * 0.25, x, y)
      img.set(x, y, col)
      // Мікротекстура: крихітні листочки — темна цятка з освітленим кінчиком.
      if (tr >= 2.5 && path[i] > 2.5) {
        if (n < 0.07) img.set(x, y, '#0e3018', 0.28)
        else if (n > 0.95) img.set(x, y, '#d8f59a', 0.25)
      }

      // Край плато: світлий обідок над обривом, м'який перехід у пісок на півночі.
      const de = dEdge[i]
      if (de <= 1.5) {
        if (at(x, y + 1) !== GRASS && at(x, y + 1) !== WATER && cliff[idx(x, Math.min(h - 1, y + 1))]) img.set(x, y, GRASS_PAL[6])
        else if (at(x, y - 1) === SAND) img.set(x, y, ramp(SAND_PAL, 0.5, x, y), 0.5)
        else img.set(x, y, GRASS_PAL[2])
      } else if (de < 3 && at(x, y - 3) === SAND && bayer(x, y) < 0.4) img.set(x, y, SAND_PAL[3])
    }

  /* ───── Деталі поверх ───── */

  const okGrass = (x, y, gap = 2) =>
    x > 1 && y > 3 && x < w - 2 && y < h - 2 && cls[idx(x, y)] === GRASS && dEdge[idx(x, y)] > gap && path[idx(x, y)] > 1.5 && trail[idx(x, y)] > 1.5

  // Кущики трави: справжні пучки травинок, що розходяться віялом, з тінню біля основи.
  const TUFTS = [
    ['..t....', 't.m..t.', 'm.m.tm.', '.mmmm..', '..ss...'],
    ['...t...', '.t.m.t.', '.m.m.m.', '..mmm..', '..sss..'],
    ['t...t..', 'm.t.m..', '.mmm...', '.ss....'],
    ['..t.t..', '.tm.mt.', '.m.m.m.', '..mmm..', '...ss..'],
  ]
  for (let k = 0; k < 1500; k++) {
    const x = Math.floor(hash(k, 1, 201) * w)
    const y = Math.floor(hash(k, 2, 201) * h)
    if (!okGrass(x, y, 3) || hash(k, 3, 201) > fbm(x / 42, y / 42, 7) + 0.2) continue
    const dry = fbm(x / 60, y / 60, 29) > 0.6
    const tip = dry ? '#dce58a' : '#bdef7c'
    const rows = TUFTS[Math.floor(hash(k, 4, 201) * TUFTS.length)]
    const flip = hash(k, 5, 201) < 0.5
    rows.forEach((line, j) => {
      for (let q = 0; q < line.length; q++) {
        const ch = line[flip ? line.length - 1 - q : q]
        if (ch === '.') continue
        const px = x + q - 3
        const py = y - rows.length + j + 1
        // Стебла — затемнення того, що під ними, тож пучок видно і на світлій, і на темній траві.
        if (ch === 's') img.set(px, py, '#0b2a14', 0.3)
        else if (ch === 'm') img.set(px, py, '#123d1c', 0.42)
        else img.set(px, py, tip)
      }
    })
  }

  // Конюшина: світлі трилисники плямами.
  for (let k = 0; k < 380; k++) {
    const x = Math.floor(hash(k, 1, 211) * w)
    const y = Math.floor(hash(k, 2, 211) * h)
    if (!okGrass(x, y) || fbm(x / 16, y / 16, 212) < 0.56) continue
    img.set(x, y, '#8fd35e')
    img.set(x + 1, y, '#7cc24f')
    img.set(x, y - 1, '#8fd35e')
    img.set(x + 1, y + 1, GRASS_PAL[2])
    if (hash(k, 3, 211) < 0.15) img.set(x, y - 2, '#f3f3f3')
  }

  // Квіткові галявини: купки, а не поодинокі цятки.
  const FLOWERS = {
    daisy: (x, y) => {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) img.set(x + dx, y + dy, '#fbfbf4')
      img.set(x, y, '#f5c21b')
      img.set(x, y + 2, GRASS_PAL[1])
    },
    buttercup: (x, y) => {
      img.set(x, y, '#ffd83a')
      img.set(x + 1, y, '#f2b51b')
      img.set(x, y - 1, '#fff1a0')
      img.set(x, y + 1, GRASS_PAL[1])
    },
    poppy: (x, y) => {
      img.set(x, y, '#e2382c')
      img.set(x + 1, y, '#e2382c')
      img.set(x, y - 1, '#ff6a52')
      img.set(x + 1, y - 1, '#e2382c')
      img.set(x + 1, y, '#2b1d16')
      img.set(x, y + 1, GRASS_PAL[1])
    },
    cornflower: (x, y) => {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) img.set(x + dx, y + dy, '#4d7ee8')
      img.set(x, y, '#9cc0ff')
      img.set(x, y + 1, GRASS_PAL[1])
    },
    lavender: (x, y) => {
      img.set(x, y - 2, '#b98ce8')
      img.set(x, y - 1, '#9466d0')
      img.set(x, y, '#7b4fb8')
      img.set(x, y + 1, GRASS_PAL[2])
      img.set(x, y + 2, GRASS_PAL[1])
    },
  }
  const kinds = Object.keys(FLOWERS)
  for (let m = 0; m < 22; m++) {
    const cx = hash(m, 1, 301) * w
    const cy = hash(m, 2, 301) * h
    const main = kinds[Math.floor(hash(m, 3, 301) * kinds.length)]
    const count = 8 + Math.floor(hash(m, 4, 301) * 16)
    for (let k = 0; k < count; k++) {
      const a = hash(m, 10 + k, 301) * Math.PI * 2
      const r = Math.sqrt(hash(m, 50 + k, 301)) * 13
      const x = Math.round(cx + Math.cos(a) * r)
      const y = Math.round(cy + Math.sin(a) * r * 0.7)
      if (!okGrass(x, y, 4)) continue
      const kind = hash(m, 90 + k, 301) < 0.75 ? main : kinds[Math.floor(hash(m, 120 + k, 301) * kinds.length)]
      FLOWERS[kind](x, y)
    }
  }

  // Квітники біля дверей: земля в дерев'яній рамці, квіти рядком.
  for (const b of BEDS) {
    img.rect(b.x - 1, b.y - 1, b.w + 2, b.h + 2, '#5b3a22')
    img.hline(b.x - 1, b.x + b.w, b.y - 1, '#8b5d3b')
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) img.set(b.x + x, b.y + y, ramp(DIRT_PAL, 0.25 + hash(x, y, 7) * 0.3, b.x + x, b.y + y))
    for (let x = 2; x < b.w - 1; x += 3) {
      const kind = ['poppy', 'daisy', 'cornflower', 'buttercup'][(x / 3 + b.x) % 4 | 0]
      img.set(b.x + x, b.y + 4, GRASS_PAL[3])
      img.set(b.x + x - 1, b.y + 4, GRASS_PAL[4])
      FLOWERS[kind](b.x + x, b.y + 2)
    }
  }

  // Під деревами: тінь крони на траві, опале листя, яблука й гриби.
  for (const d of DECOR) {
    if (d.s !== 'oak' && d.s !== 'birch') continue
    const R = d.s === 'oak' ? 24 : 15
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        const px = d.x + x
        const py = d.y - 4 + y * 0.5
        const r = Math.hypot(x, y) / R
        if (r > 1 || !okGrass(px, Math.round(py), 0)) continue
        // Суцільна тінь крони з нерівним краєм.
        if (r < 0.82 + (hash(px, Math.round(py), 402) - 0.5) * 0.2) img.set(px, Math.round(py), '#0f3a1e', 0.26)
      }
    for (let k = 0; k < 10; k++) {
      const x = Math.round(d.x + (hash(k, d.x, 401) - 0.5) * R * 1.8)
      const y = Math.round(d.y - 2 + (hash(k, d.y, 401) - 0.5) * R * 0.7)
      if (!okGrass(x, y, 1)) continue
      if (d.s === 'oak' && k < 3) {
        img.set(x, y, '#d64a3a')
        img.set(x, y - 1, '#ff8a6a')
      } else if (d.s === 'birch') img.set(x, y, '#e9c94a')
      else img.set(x, y, '#c58a3a')
    }
    if (d.s === 'oak')
      for (let k = 0; k < 2; k++) {
        const x = Math.round(d.x + (k ? 14 : -16) + hash(k, d.x, 411) * 4)
        const y = Math.round(d.y + 4 + hash(k, d.y, 411) * 3)
        if (!okGrass(x, y, 1)) continue
        img.set(x, y, '#efe6d2')
        img.set(x, y - 1, '#efe6d2')
        img.hline(x - 1, x + 1, y - 2, '#c8372d')
        img.hline(x - 1, x + 1, y - 3, '#e2533f')
        img.set(x, y - 3, '#ffffff')
      }
  }

  // Камінчики в траві.
  for (let k = 0; k < 90; k++) {
    const x = Math.floor(hash(k, 1, 221) * w)
    const y = Math.floor(hash(k, 2, 221) * h)
    if (!okGrass(x, y, 3)) continue
    img.set(x, y, '#9a948a')
    img.set(x + 1, y, '#7a746b')
    img.set(x, y - 1, '#c8c2b6')
    img.set(x + 1, y + 1, '#2f5a2a')
  }

  // Ліани й коріння, що звисають з обриву; тінь на піску під ним.
  for (let x = 0; x < w; x++)
    for (let y = 1; y < h; y++) {
      const i = idx(x, y)
      if (cliff[i] !== 2 || path[i] < 0) continue
      if (hash(x, 1, 501) < 0.1) {
        const len = 3 + Math.floor(hash(x, 2, 501) * (CLIFF_H - 4))
        for (let s = 0; s < len; s++) {
          img.set(x, y + s, s % 3 === 2 ? '#5fab42' : '#2f6b2c')
          if (s % 3 === 1) img.set(x + (s % 2 ? 1 : -1), y + s, '#66b443')
        }
      } else if (hash(x, 3, 501) < 0.06) {
        const len = 2 + Math.floor(hash(x, 4, 501) * 3)
        for (let s = 0; s < len; s++) img.set(x + (s > 1 ? 1 : 0), y + s, '#6b4426')
      }
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = idx(x, y)
      if (cls[i] === WATER || cliff[i] || cls[i] === GRASS) continue
      const dc = dCliff[i]
      if (dc < 4 && cliff[idx(x, Math.max(0, y - Math.ceil(dc)))]) img.set(x, y, '#2a1a10', 0.32 * (1 - dc / 4))
    }

  // Кам'яні плити від сходів до причалу.
  const pts = PATH.points
  const [ax, ay] = pts.at(-2)
  const [bx, by] = pts.at(-1)
  for (let s = 0; s <= 1; s += 0.02) {
    const x = ax + (bx - ax) * s
    const y = ay + (by - ay) * s
    const i = idx(Math.round(x), Math.round(y))
    if (cls[i] !== SAND || dCliff[i] < 3 || y > PIER.y0 - 2) continue
    const k = Math.round(s * 50)
    if (k % 5) continue
    const ox = Math.round(x + ((k / 5) % 2 ? 4 : -4) + (hash(k, 1, 601) - 0.5) * 2)
    const oy = Math.round(y)
    img.ellipse(ox + 1, oy + 2, 6, 3, '#6b5130', 0.35)
    for (let yy = -3; yy <= 3; yy++)
      for (let xx = -6; xx <= 6; xx++) {
        const r = (xx / 6) ** 2 + (yy / 3.2) ** 2
        if (r > 1) continue
        const light = -(xx / 6) * 0.4 - (yy / 3.2) * 0.7
        img.set(ox + xx, oy + yy, ramp(STONE_PALS[k % 3], 0.5 + light * 0.45 + (r > 0.75 ? -0.15 : 0), ox + xx, oy + yy))
      }
  }

  // Морські дрібнички: мушлі, зірки, корч.
  const beach = (x, y) => cls[idx(x, y)] === SAND && dWater[idx(x, y)] > 3 && dWater[idx(x, y)] < 16 && dCliff[idx(x, y)] > 5 && path[idx(x, y)] > 3
  for (let k = 0; k < 70; k++) {
    const x = Math.floor(hash(k, 1, 701) * w)
    const y = Math.floor(hash(k, 2, 701) * h)
    if (!beach(x, y)) continue
    const kind = hash(k, 3, 701)
    if (kind < 0.12) {
      // Морська зірка.
      for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [-1, 2], [1, 2], [0, -1], [-1, 0], [1, 0], [0, 1], [0, 0]]) img.set(x + dx, y + dy, '#e8743a')
      img.set(x, y, '#ffb070')
    } else if (kind < 0.2) {
      // Корч.
      img.hline(x - 5, x + 4, y, '#8a6a4a')
      img.hline(x - 4, x + 3, y - 1, '#b0916c')
      img.set(x + 2, y - 2, '#8a6a4a')
      img.hline(x - 5, x + 4, y + 1, '#6b5130', 0.4)
    } else if (kind < 0.6) {
      img.set(x, y, '#fbeee0')
      img.set(x + 1, y, '#f2a7a0')
      img.set(x, y - 1, '#fff8f0')
    } else {
      img.set(x, y, '#8d877d')
      img.set(x, y - 1, '#bdb6aa')
    }
  }

  // Калюжка-заплава серед каміння маяка.
  const pool = { x: 58, y: 282 }
  if (cls[idx(pool.x, pool.y)] === ROCK) {
    img.ellipse(pool.x, pool.y, 7, 4, '#2a2622')
    img.ellipse(pool.x, pool.y, 6, 3, '#2f7fbf')
    img.ellipse(pool.x - 1, pool.y - 1, 4, 1.6, '#5fb3e6')
    img.set(pool.x - 3, pool.y - 1, '#d8f2ff')
    img.set(pool.x + 2, pool.y + 1, '#e8743a')
  }

  // Каміння під водою на мілині.
  for (let k = 0; k < 400; k++) {
    const x = Math.floor(hash(k, 1, 801) * w)
    const y = Math.floor(hash(k, 2, 801) * h)
    const i = idx(x, y)
    if (cls[i] !== WATER || dLand[i] < 5 || dLand[i] > 14 || hash(k, 3, 801) > 0.35) continue
    const r = 2 + hash(k, 4, 801) * 3
    img.ellipse(x, y, r, r * 0.7, '#1d5878', 0.45)
    img.ellipse(x - 0.6, y - 0.6, r * 0.6, r * 0.4, '#7fc2d6', 0.3)
  }
  return img
}

/** Прибій: 4 кадри — накат на пісок, хвиля, що біжить до берега, каустика на мілині й блиск. */
function shoreImage(t) {
  const { w, h } = MAP
  const FR = 4
  const img = new Img(w, h * FR)
  const TAU = Math.PI * 2
  for (let f = 0; f < FR; f++) {
    const ph = (f / FR) * TAU
    const oy = f * h
    const swash = 1.6 + 1.6 * Math.sin(ph)
    const wave = 14 - 10 * (f / FR)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const n = fbm(x / 6, y / 6, 51 + f, 2)
        if (t.cls[i] !== WATER) {
          // Мереживо піни, що забігає на мокрий пісок.
          const dw = t.dWater[i]
          if (dw <= 2.2 && dw < swash - 0.6 + (n - 0.5) * 2 && t.cls[i] === SAND) img.set(x, y + oy, '#f4fbff', 0.55)
          continue
        }
        const dl = t.dLand[i]
        if (dl > 24) continue
        if (dl < swash + (n - 0.5) * 2) img.set(x, y + oy, '#f6fcff', 0.95)
        else if (dl < swash + 1.4 + (n - 0.5) * 2) img.set(x, y + oy, '#bfe9f7', 0.8)
        // Хвиля, що котиться до берега.
        if (Math.abs(dl - wave - (n - 0.5) * 3) < 0.75 && n > 0.4) img.set(x, y + oy, '#eaf8ff', 0.7 * (dl / 14))
        // Каустика: світла сітка, що повільно колихається по колу (кадри замикаються).
        if (dl < 17) {
          const cx = x + 2.5 * Math.cos(ph + y * 0.06)
          const cy = y * 1.3 + 2.5 * Math.sin(ph + x * 0.06)
          const wv = worley(cx, cy, 8, 303)
          if (wv.d2 - wv.d1 < 0.85) img.set(x, y + oy, '#dcfcff', 0.32 * (1 - dl / 17))
        }
      }
    // Сонячні зблиски на воді.
    for (let k = 0; k < 160; k++) {
      const x = Math.floor(hash(k, 1, 901) * w)
      const y = Math.floor(hash(k, 2, 901) * h)
      if (t.cls[y * w + x] !== WATER || t.dLand[y * w + x] < 4) continue
      const s = Math.sin(ph + hash(k, 3, 901) * TAU)
      if (s < 0.5) continue
      img.set(x, y + oy, '#ffffff', 0.9)
      if (s > 0.9) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) img.set(x + dx, y + dy + oy, '#ffffff', 0.5)
    }
  }
  return img
}

/** Сітка прохідності: клітинка CELL×CELL прохідна, якщо майже вся — суша без обриву (або сходи). */
function walkGrid(t) {
  const { w, h } = MAP
  const cols = Math.ceil(w / CELL)
  const rows = Math.ceil(h / CELL)
  const inBed = (x, y) => BEDS.some((b) => x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h)
  const out = []
  for (let cy = 0; cy < rows; cy++) {
    let line = ''
    for (let cx = 0; cx < cols; cx++) {
      let ok = 0
      for (let y = cy * CELL; y < (cy + 1) * CELL; y++)
        for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
          const i = y * w + x
          if (x >= w || y >= h) continue
          if (t.cls[i] !== WATER && (!t.cliff[i] || t.path[i] < 0) && !inBed(x, y)) ok++
        }
      line += ok >= CELL * CELL * 0.7 ? '1' : '0'
    }
    out.push(line)
  }
  return out
}

/* ───────── Вода: безшовна плитка 64×64, 4 кадри ───────── */

function waterImage() {
  const S = 64
  const FR = 4
  const img = new Img(S, S * FR)
  const TAU = Math.PI * 2
  for (let f = 0; f < FR; f++) {
    const yy = f * S
    // Основа: ледь помітні діагональні смуги темнішої води з дизерингом.
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const n = fbm(x / 16, y / 16, 3, 3, 4)
        const band = Math.sin(TAU * ((x + 2 * y) / S) + n * 4)
        img.set(x, yy + y, band + (hash(x, y, 2) - 0.5) * 0.6 > 0.72 ? C.waterDark : C.water)
      }
    // Брижі: короткі горизонтальні риски, що з'являються, ковзають і гаснуть.
    for (let k = 0; k < 26; k++) {
      const x0 = Math.floor(hash(k, 0, 71) * S)
      const y0 = Math.floor(hash(k, 1, 71) * S)
      const len = 3 + Math.floor(hash(k, 2, 71) * 4)
      const s = Math.sin(TAU * (f / FR + hash(k, 3, 71)))
      if (s < 0) continue
      const shift = Math.round(s * 2)
      for (let i = 0; i < len; i++) img.set((x0 + i + shift) % S, yy + y0, s > 0.7 && i > 0 && i < len - 1 ? '#a9d8ff' : C.waterHi)
      if (s > 0.7) for (let i = 1; i < len - 1; i++) img.set((x0 + i + shift + 1) % S, yy + ((y0 + 1) % S), C.waterDark)
    }
  }
  return img
}

/* ───────── Спрайти ───────── */

/** Тінь під об'єктом. */
function shadow(img, cx, cy, rx, ry, a = 0.28) {
  img.ellipse(cx, cy, rx, ry, '#0b2010', a)
}

/** Мандрівник у брилі й вишиванці: 16×22, напрямки down/up/side, кадри ходьби. */
const HERO_PAL = {
  K: C.K,
  Y: '#e9c56a',
  y: '#c49a45',
  T: '#c8372d',
  h: '#7a4524',
  H: '#4f2a14',
  s: '#f5c9a0',
  S: '#d9a077',
  e: C.K,
  W: '#f3eee2',
  w: '#cbc2b0',
  R: '#c8372d',
  r: '#8e2a1f',
  P: '#3f5fa8',
  p: '#2c4580',
  B: '#6a4528',
  b: '#3a2414',
}
const HERO_HAT = [
  '................',
  '.....KKKKKK.....',
  '....KYYYYYYK....',
  '...KYYyYYyYYK...',
  '.KKKTTTTTTTTKKK.',
  'KYYYYYYYYYYYYYYK',
  '.KKyyyyyyyyyyKK.',
]
const HERO = {
  down: [
    ...HERO_HAT,
    '...KhsssssshK...',
    '...KsessssesK...',
    '...KSssssssSK...',
    '....KKsSSsKK....',
    '..KWWWWRRWWWWK..',
    '.KwWWWWRRWWWWwK.',
    '.KwWRWWRRWWRWwK.',
    '.KsWWWWRRWWWWsK.',
    '.KSrrrrrrrrrrSK.',
    '..KPPPPPPPPPPK..',
    '...KPPpKKpPPK...',
    '...KPPPKKPPPK...',
    '...KBBBKKBBBK...',
    '...KbbbKKbbbK...',
    '....KKK..KKK....',
  ],
  up: [
    ...HERO_HAT,
    '...KhhhhhhhhK...',
    '...KhhhhhhhhK...',
    '...KHhhHHhhHK...',
    '....KKSSSSKK....',
    '..KWWWWWWWWWWK..',
    '.KwWWWWWWWWWWwK.',
    '.KwWRWWWWWWRWwK.',
    '.KsWWWWWWWWWWsK.',
    '.KSrrrrrrrrrrSK.',
    '..KPPPPPPPPPPK..',
    '...KPPpKKpPPK...',
    '...KPPPKKPPPK...',
    '...KBBBKKBBBK...',
    '...KbbbKKbbbK...',
    '....KKK..KKK....',
  ],
  side: [
    ...HERO_HAT,
    '...KsssshhhhK...',
    '...KsesshhhhK...',
    '...KSssshhhHK...',
    '....KKsShhKK....',
    '....KWWWWWWK....',
    '....KwRWWWwK....',
    '....KwRWWWwK....',
    '....KWsWWWwK....',
    '....KrSrrrrK....',
    '....KPPPPPPK....',
    '....KPPPPPpK....',
    '....KPPKKPpK....',
    '....KBBKKBBK....',
    '...KbbbKKbbK....',
    '....KKK..KK.....',
  ],
}
const SIDE_STRIDE = [
  '....KPPPPPPK....',
  '...KPPPKKPPpK...',
  '..KPPK..KPpK....',
  '..KBBK..KBBK....',
  '.KbbbK.KbbbK....',
  '..KKK...KKK.....',
]

/** Кадр ходьби спереду/ззаду: одна нога піднята на 1 px. */
function liftLeg(rows, left) {
  const out = rows.map((r) => r.split(''))
  const [x0, x1] = left ? [3, 7] : [8, 12]
  for (let y = 18; y < out.length; y++)
    for (let x = x0; x <= x1; x++) out[y - 1][x] = y - 1 >= 18 || out[y][x] !== '.' ? out[y][x] : out[y - 1][x]
  for (let x = x0; x <= x1; x++) out[out.length - 1][x] = '.'
  return out.map((r) => r.join(''))
}

function heroFrames() {
  const make = (rows, flip = false) => new Img(16, 22).rows(rows, 0, 0, HERO_PAL, flip)
  const sideStride = [...HERO.side.slice(0, 16), ...SIDE_STRIDE]
  const f = {}
  for (const dir of ['down', 'up']) {
    f[`hero_${dir}_0`] = make(HERO[dir])
    f[`hero_${dir}_1`] = make(liftLeg(HERO[dir], true))
    f[`hero_${dir}_2`] = make(liftLeg(HERO[dir], false))
  }
  f.hero_left_0 = make(HERO.side)
  f.hero_left_1 = make(sideStride)
  f.hero_left_2 = make(HERO.side)
  f.hero_right_0 = make(HERO.side, true)
  f.hero_right_1 = make(sideStride, true)
  f.hero_right_2 = make(HERO.side, true)
  return f
}

/** Крона з кількох кіл: освітлення зверху-зліва, текстура листя, темний контур. */
function canopy(img, circles, pal, seed) {
  const inside = (x, y) => {
    let best = null
    for (const c of circles) {
      const d = Math.hypot(x - c[0], y - c[1]) / c[2]
      if (d <= 1 && (!best || d < best.d)) best = { d, c }
    }
    return best
  }
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const hit = inside(x + 0.5, y + 0.5)
      if (!hit) continue
      const [cx, cy, r] = hit.c
      const lx = (x - cx) / r
      const ly = (y - cy) / r
      const light = -(lx * 0.6 + ly * 0.8) + (fbm(x / 3, y / 3, seed, 2) - 0.5) * 0.9
      const k = light > 0.55 ? 0 : light > 0.15 ? 1 : light > -0.3 ? 2 : light > -0.7 ? 3 : 4
      img.set(x, y, pal[k])
      // Окремі листочки: світліші цятки на освітленому боці.
      if (k <= 2 && hash(x, y, seed) < 0.06) img.set(x, y, pal[Math.max(0, k - 1)])
    }
}

const LEAF = ['#9ad861', '#74bb44', '#559b33', '#3f7d27', '#2c5c1c']

function oak() {
  const img = new Img(52, 62)
  shadow(img, 27, 57, 21, 5)
  // Стовбур і коріння.
  img.rect(22, 34, 9, 24, C.wood)
  img.vline(22, 34, 57, C.woodLo)
  img.vline(23, 36, 56, '#6b4426')
  img.vline(29, 34, 57, C.woodHi)
  img.rect(18, 55, 4, 3, C.wood)
  img.rect(31, 55, 4, 3, C.wood)
  img.set(25, 44, C.woodLo)
  img.set(26, 45, C.woodLo)
  img.set(27, 50, C.woodLo)
  canopy(img, [[26, 20, 17], [12, 27, 11], [40, 27, 11], [26, 33, 12], [17, 13, 10], [35, 13, 10]], LEAF, 3)
  // Яблучка.
  for (const [x, y] of [[14, 25], [34, 20], [24, 30], [40, 30], [20, 16]]) {
    img.set(x, y, '#d64a3a')
    img.set(x, y - 1, '#ff8a6a')
  }
  return img.outline('#1e3a12')
}

function birch() {
  const img = new Img(34, 54)
  shadow(img, 17, 50, 13, 4)
  img.rect(14, 26, 6, 25, '#efe9dc')
  img.vline(14, 26, 50, '#b8b2a6')
  img.vline(19, 26, 50, '#cfc6b3')
  for (const y of [30, 36, 41, 46]) img.hline(15, 16 + (y % 3), y, '#3b2a22')
  canopy(img, [[17, 18, 13], [8, 24, 8], [26, 24, 8], [17, 9, 9]], ['#c8e67a', '#9fd05a', '#79b543', '#5c9432', '#43722a'], 5)
  return img.outline('#22421a')
}

function bush(berries) {
  const img = new Img(24, 18)
  shadow(img, 12, 15, 11, 3)
  canopy(img, [[12, 9, 8], [6, 11, 5], [18, 11, 5]], LEAF, berries ? 8 : 9)
  if (berries) for (const [x, y] of [[8, 8], [14, 6], [17, 11], [11, 12], [5, 11]]) {
    img.set(x, y, '#c43a4e')
    img.set(x, y - 1, '#ff7f92')
  }
  return img.outline('#1e3a12')
}

function rock(big) {
  const [w, h] = big ? [22, 16] : [14, 11]
  const img = new Img(w, h)
  shadow(img, w / 2, h - 2, w / 2 - 1, 2.5, 0.3)
  const cx = w / 2
  const cy = h / 2 + 0.5
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / (w / 2 - 1)
      const dy = (y + 0.5 - cy) / (h / 2 - 1)
      const r = dx * dx + dy * dy * 1.2 + (hash(x, y, 4) - 0.5) * 0.08
      if (r > 1) continue
      const light = -(dx * 0.5 + dy * 0.85)
      img.set(x, y, light > 0.4 ? '#c9c2b6' : light > -0.1 ? '#a39c90' : light > -0.55 ? '#857e74' : '#655f57')
      if (hash(x, y, 12) < 0.05) img.set(x, y, '#6f8a3a')
    }
  if (big) {
    img.set(9, 6, '#655f57')
    img.set(10, 7, '#655f57')
    img.set(11, 7, '#655f57')
  }
  return img.outline(C.K, 0.85)
}

function stump() {
  const img = new Img(16, 14)
  shadow(img, 8, 12, 7, 2)
  img.rect(3, 5, 10, 7, C.wood)
  img.vline(3, 5, 11, C.woodLo)
  img.vline(12, 5, 11, C.woodHi)
  img.ellipse(8, 5, 5, 2.5, C.woodPale)
  img.ellipse(8, 5, 3, 1.4, '#a8804e')
  img.set(8, 5, C.woodLo)
  img.rect(1, 10, 3, 2, C.wood)
  img.rect(12, 10, 3, 2, C.wood)
  return img.outline(C.K, 0.9)
}

function flowers(col) {
  const img = new Img(12, 8)
  const pal = { G: '#3f7d27', g: '#74bb44', F: col, c: '#f7b733' }
  img.rows(['..F......F..', '.FcF....FcF.', '..F..F...F..', '..g.FcF..g..', '..G..F...G..', '.gG..g..gG..', '..G..G...G..', '.....G......'], 0, 0, pal)
  return img
}

function tuft() {
  const img = new Img(9, 6)
  img.rows(['..g...g..', '.gG.g.Gg.', '.GgGGgG..', 'GGGgGGgGG'.slice(0, 9), '.GGGGGGG.', '..GGGGG..'].slice(0, 6), 0, 0, { g: '#7fc34e', G: '#3f7d27' })
  return img
}

function shell() {
  const img = new Img(6, 5)
  img.rows(['..WW..', '.WpWW.', 'WpWpWW', 'WWpWW.', '.WWW..'], 0, 0, { W: '#fbeee0', p: '#f2a7a0' })
  return img
}

function crates() {
  const img = new Img(24, 22)
  shadow(img, 12, 20, 11, 2.5)
  const box = (x, y, s) => {
    img.rect(x, y, s, s, C.woodPale)
    img.rect(x, y, s, 2, '#d8b07a')
    img.hline(x, x + s - 1, y + s - 1, C.wood)
    img.vline(x, y, y + s - 1, C.wood)
    img.vline(x + s - 1, y, y + s - 1, C.wood)
    for (let i = 1; i < s - 1; i++) img.set(x + i, y + i, C.wood)
  }
  box(2, 9, 11)
  box(12, 10, 10)
  box(7, 1, 9)
  return img.outline(C.K)
}

function barrel() {
  const img = new Img(12, 16)
  shadow(img, 6, 14, 6, 2)
  for (let y = 3; y < 14; y++) {
    const bulge = y > 5 && y < 12 ? 1 : 0
    img.hline(2 - bulge, 9 + bulge, y, C.wood)
    img.set(2 - bulge, y, C.woodLo)
    img.set(9 + bulge, y, C.woodHi)
  }
  img.hline(1, 10, 5, '#5e574f')
  img.hline(1, 10, 11, '#5e574f')
  img.ellipse(6, 3, 4, 1.6, C.woodPale)
  img.set(6, 3, C.woodLo)
  return img.outline(C.K)
}

function clothesline() {
  const img = new Img(52, 34)
  for (const x of [3, 47]) {
    shadow(img, x + 1, 31, 4, 1.5)
    img.rect(x, 4, 3, 28, C.wood)
    img.vline(x, 4, 31, C.woodLo)
    img.hline(x - 1, x + 3, 4, C.woodLo)
  }
  // Мотузка з провисом.
  for (let x = 5; x <= 47; x++) img.set(x, 6 + Math.round(Math.sin(((x - 5) / 42) * Math.PI) * 4), '#e6dcc4')
  const cloth = (x, w, h, col, lo) => {
    const top = 6 + Math.round(Math.sin(((x + w / 2 - 5) / 42) * Math.PI) * 4)
    img.rect(x, top, w, h, col)
    img.vline(x + w - 1, top, top + h - 1, lo)
    img.hline(x, x + w - 1, top + h - 1, lo)
    img.set(x + 1, top, '#3b2a22')
    img.set(x + w - 2, top, '#3b2a22')
  }
  cloth(9, 7, 11, '#3f6fc8', '#2c4f96')
  cloth(18, 8, 9, '#f3eee2', '#cbc2b0')
  img.hline(19, 24, 9, '#c8372d')
  img.hline(19, 24, 11, '#c8372d')
  cloth(28, 6, 12, '#c8372d', '#8e2a1f')
  cloth(36, 7, 8, '#e9c56a', '#c49a45')
  return img.outline(C.K, 0.6)
}

function sign() {
  const img = new Img(14, 18)
  shadow(img, 7, 16, 5, 1.5)
  img.rect(6, 8, 2, 9, C.wood)
  img.rect(1, 1, 12, 8, C.woodPale)
  img.hline(1, 12, 8, C.wood)
  img.hline(1, 12, 1, '#d8b07a')
  // Молоток на табличці: тут можна будувати.
  img.rect(4, 3, 6, 2, '#7d8a94')
  img.rect(6, 5, 2, 3, C.woodLo)
  return img.outline(C.K)
}

function plotGrass() {
  const img = new Img(40, 30)
  img.ellipse(20, 22, 18, 7, '#6b4426', 0.55)
  img.blit(sign(), 13, 4)
  return img
}

function rubble() {
  const img = new Img(34, 30)
  img.blit(rock(true), 2, 14)
  img.blit(rock(false), 18, 18)
  img.blit(sign(), 12, 2)
  return img
}

function chest(open) {
  const img = new Img(18, 16)
  shadow(img, 9, 14, 8, 2)
  const pal = { K: C.K, b: C.wood, B: C.woodLo, L: C.woodPale, u: '#ffd23c', U: '#c49a12', y: '#fff2a8', Y: '#ffd35a' }
  img.rows(
    open
      ? ['..KKKKKKKKKKKK..', '.KBBBBBBBBBBBBK.', '.KyYyYyYyYyYyYK.', '.KYyYyYyYyYyYyK.', 'KKKKKKKKKKKKKKKK', 'KbbLbbbuubbbLbbK', 'KbbLbbbUUbbbLbbK', 'KbbLbbbbbbbbLbbK', 'KBBLBBBBBBBBLBBK', '.KKKKKKKKKKKKKK.']
      : ['..KKKKKKKKKKKK..', '.KbbLbbbbbbLbbK.', 'KbbbLbbbbbbLbbbK', 'KBBBLBBBBBBLBBBK', 'KKKKKKKuuKKKKKKK', 'KbbLbbbuubbbLbbK', 'KbbLbbbUUbbbLbbK', 'KbbLbbbbbbbbLbbK', 'KBBLBBBBBBBBLBBK', '.KKKKKKKKKKKKKK.'],
    1,
    3,
    pal
  )
  return img
}

/** Кам'яна кладка: ряди блоків зі зсувом, розчин, світлі верхи. */
function stoneWall(img, x0, y0, w, h, seed) {
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / 5)
    const off = row % 2 ? 4 : 0
    for (let x = 0; x < w; x++) {
      const bx = Math.floor((x + off) / 8)
      const inRow = y % 5
      const inBlk = (x + off) % 8
      const id = hash(bx, row, seed)
      let col = pick(['#9c9488', '#a8a094', '#b3ab9f', '#968d80'], id)
      if (inRow === 4 || inBlk === 7) col = '#6f675c'
      else if (inRow === 0) col = '#c4bcb0'
      else if (inBlk === 6) col = '#878075'
      img.set(x0 + x, y0 + y, col)
    }
  }
}

/** Черепиця: ряди лусочок, темна смуга під кожним рядом, світлі краї. */
function tileRoof(img, x0, y0, w, h, pal = [C.redHi, C.red, C.redLo, '#6e281a']) {
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / 4)
    const off = row % 2 ? 3 : 0
    for (let x = 0; x < w; x++) {
      const inRow = y % 4
      const inT = (x + off) % 6
      let col = pal[1]
      if (inRow === 3) col = pal[2]
      else if (inRow === 0 && inT > 0 && inT < 5) col = pal[0]
      if (inT === 0 && inRow > 0) col = pal[2]
      if (hash(x0 + x, y0 + y, 77) < 0.04) col = pal[2]
      img.set(x0 + x, y0 + y, col)
    }
  }
  // Вальма: ліве світле ребро, праве — тінь.
  img.vline(x0, y0, y0 + h - 1, pal[0])
  img.vline(x0 + w - 1, y0, y0 + h - 1, pal[3])
}

function windowAt(img, x, y, lit = true) {
  img.rect(x, y, 10, 10, C.woodLo)
  img.rect(x + 1, y + 1, 8, 8, lit ? C.light : '#3d5a78')
  img.rect(x + 1, y + 1, 3, 3, lit ? C.lightHi : '#6f93b8')
  img.vline(x + 5, y + 1, y + 8, C.woodLo)
  img.hline(x + 1, x + 8, y + 5, C.woodLo)
  img.hline(x - 1, x + 10, y + 10, C.woodPale)
}

function flowerBox(img, x, y) {
  img.rect(x, y, 12, 3, C.wood)
  img.hline(x, x + 11, y, C.woodPale)
  for (let i = 0; i < 12; i += 2) {
    img.set(x + i, y - 1, i % 4 ? '#3f7d27' : '#74bb44')
    if (i % 4 === 0) img.set(x + i + 1, y - 2, i % 8 ? '#ffd23c' : '#e86b9a')
  }
}

function lantern(img, x, y) {
  img.set(x + 1, y, C.K)
  img.rect(x, y + 1, 3, 4, C.K)
  img.set(x + 1, y + 2, C.light)
  img.set(x + 1, y + 3, C.lightHi)
}

function flag(img, x, y, col = '#2f6fd0', col2 = '#ffd23c') {
  img.vline(x, y, y + 14, C.woodLo)
  img.rect(x + 1, y, 8, 3, col)
  img.rect(x + 1, y + 3, 8, 3, col2)
  img.set(x + 9, y + 1, col)
  img.set(x + 9, y + 4, col2)
  img.set(x, y - 1, '#ffd23c')
}

function house(level) {
  const img = new Img(84, 84)
  shadow(img, 42, 79, 38, 5, 0.3)
  // Стіни.
  stoneWall(img, 12, 46, 60, 32, 2)
  img.rect(12, 46, 60, 2, '#000', 0.25)
  // Дерев'яні кутові стовпи.
  for (const x of [12, 69]) {
    img.rect(x, 46, 3, 32, C.wood)
    img.vline(x, 46, 77, C.woodLo)
  }
  // Двері з аркою.
  img.rect(35, 56, 14, 22, C.woodLo)
  img.rect(36, 58, 12, 20, C.wood)
  img.hline(37, 46, 57, C.wood)
  for (const x of [39, 42, 45]) img.vline(x, 58, 77, C.woodLo)
  img.set(46, 68, '#ffd23c')
  img.set(46, 67, '#fff2a8')
  // Поріг.
  img.rect(33, 78, 18, 2, C.stoneHi)
  img.hline(33, 50, 79, C.stoneLo)
  windowAt(img, 18, 56)
  if (level >= 2) windowAt(img, 56, 56)
  // Дах: черепиця з напуском.
  tileRoof(img, 4, 12, 76, 34)
  img.hline(4, 79, 12, '#6e281a')
  img.hline(6, 77, 11, C.redLo)
  img.rect(4, 44, 76, 2, '#6e281a')
  // Гребінь даху.
  img.hline(10, 73, 10, C.redHi)
  // Комин.
  stoneWall(img, 58, 0, 10, 16, 9)
  img.rect(57, 0, 12, 2, '#5e574f')
  img.rect(59, 0, 8, 1, '#2b1d16')
  if (level >= 2) {
    flowerBox(img, 17, 69)
    flowerBox(img, 55, 69)
    lantern(img, 51, 58)
  }
  if (level >= 3) {
    flag(img, 18, 0)
    // Віконце на даху й килимок.
    img.rect(36, 22, 12, 10, C.redLo)
    img.rect(37, 21, 10, 2, C.redHi)
    windowAt(img, 37, 24)
    img.rect(37, 80, 10, 3, '#c8372d')
    img.hline(37, 46, 81, '#ffd23c')
  }
  return img.outline(C.K)
}

function lighthouse(level) {
  const tower = 26 + level * 14
  const H = tower + 46
  const img = new Img(40, H)
  shadow(img, 20, H - 4, 18, 4, 0.32)
  // Кам'яна основа.
  stoneWall(img, 6, H - 12, 28, 9, 4)
  img.hline(6, 33, H - 12, C.stoneHi)
  // Башта: циліндр із тінню справа, червоно-білі смуги.
  const top = H - 12 - tower
  for (let y = top; y < H - 12; y++) {
    const t = (y - top) / tower
    const half = Math.round(7 + t * 3)
    const red = Math.floor((y - top) / 9) % 2 === 1
    for (let x = 20 - half; x < 20 + half; x++) {
      const u = (x - (20 - half)) / (2 * half)
      const pal = red ? ['#e0705a', '#c8452f', '#a13623', '#7a2618'] : ['#ffffff', '#f1ece0', '#d6cfbf', '#aaa293']
      img.set(x, y, pal[u < 0.2 ? 0 : u < 0.6 ? 1 : u < 0.85 ? 2 : 3])
    }
  }
  // Двері й віконця.
  img.rect(17, H - 22, 6, 10, C.woodLo)
  img.rect(18, H - 21, 4, 9, C.wood)
  for (let y = top + 10; y < H - 26; y += 18) {
    img.rect(18, y, 4, 5, C.K)
    img.rect(19, y + 1, 2, 3, C.light)
  }
  // Галерея з поруччям.
  const g = top - 4
  img.rect(7, g, 26, 4, '#3b2a22')
  img.hline(7, 32, g, '#5e574f')
  for (let x = 8; x <= 32; x += 3) img.vline(x, g - 4, g - 1, C.K)
  img.hline(7, 32, g - 4, C.K)
  // Ліхтарня: скло зі світлом.
  const l = g - 13
  img.rect(12, l, 16, 10, C.K)
  img.rect(13, l + 1, 14, 9, level >= 3 ? C.lightHi : C.light)
  img.rect(13, l + 1, 4, 9, level >= 3 ? '#ffffff' : C.lightHi)
  img.vline(17, l + 1, l + 9, C.K)
  img.vline(22, l + 1, l + 9, C.K)
  // Купол.
  img.ellipse(20, l - 1, 10, 6, C.red)
  img.ellipse(17, l - 3, 4, 2, C.redHi)
  img.rect(10, l, 20, 1, C.redLo)
  img.vline(20, l - 10, l - 6, C.K)
  img.set(20, l - 11, '#ffd23c')
  return img.outline(C.K)
}

function soilRows(img, x0, y0, w, rows) {
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * 7
    img.rect(x0, y, w, 5, '#6b4426')
    img.hline(x0, x0 + w - 1, y, '#8a5a35')
    img.hline(x0, x0 + w - 1, y + 4, '#4e3019')
    for (let x = x0; x < x0 + w; x++) if (hash(x, y, 13) < 0.12) img.set(x, y + 2, '#4e3019')
  }
}

function garden(level) {
  const img = new Img(68, 52)
  shadow(img, 34, 47, 32, 4, 0.2)
  img.rect(5, 18, 58, 30, '#5a3a22', 0.6)
  soilRows(img, 6, 20, 56, 4)
  const sprout = (x, y) => {
    img.set(x, y, '#74bb44')
    img.set(x - 1, y - 1, '#9ad861')
    img.set(x + 1, y - 1, '#74bb44')
  }
  const cabbage = (x, y) => {
    img.ellipse(x, y, 3.5, 3, '#9ad861')
    img.ellipse(x - 0.5, y - 0.5, 2, 1.6, '#c8e67a')
    img.set(x + 2, y + 1, '#559b33')
  }
  const pumpkin = (x, y) => {
    img.ellipse(x, y, 4, 3, '#e8892d')
    img.vline(x, y - 2, y + 2, '#b8621b')
    img.set(x - 2, y - 1, '#ffb05a')
    img.set(x, y - 3, '#3f7d27')
  }
  for (let x = 10; x < 60; x += 6) sprout(x, 23)
  for (let x = 12; x < 60; x += 6) sprout(x, 30)
  if (level >= 2) for (let x = 11; x < 60; x += 9) cabbage(x, 37)
  else for (let x = 10; x < 60; x += 6) sprout(x, 37)
  if (level >= 3) for (let x = 13; x < 60; x += 11) pumpkin(x, 44)
  else for (let x = 12; x < 60; x += 6) sprout(x, 44)
  if (level >= 2) {
    // Тин: кілки й жердини, прохід спереду.
    const posts = [2, 16, 30, 52, 65]
    for (const x of posts) {
      img.rect(x, 12, 2, 36, C.wood)
      img.vline(x, 12, 47, C.woodLo)
    }
    for (const y of [15, 21]) {
      img.hline(2, 66, y, C.woodPale)
      img.hline(2, 66, y + 1, C.wood)
    }
    for (const y of [36, 42]) {
      img.hline(2, 3, y, C.woodPale)
      img.hline(65, 66, y, C.woodPale)
    }
  }
  if (level >= 3) {
    // Опудало в брилі.
    img.rect(48, 0, 2, 20, C.woodLo)
    img.rect(42, 7, 14, 2, C.wood)
    img.rect(45, 6, 8, 9, '#c8372d')
    img.hline(45, 52, 10, '#ffd23c')
    img.rect(46, 1, 6, 5, '#e9c56a')
    img.rect(43, 1, 12, 2, '#c49a45')
    img.set(47, 3, C.K)
    img.set(50, 3, C.K)
  }
  return img.outline(C.K, 0.8)
}

/** Палі у воді й дощатий поміст — під майстернею. */
function deck() {
  const img = new Img(60, 46)
  for (const x of [6, 20, 38, 52]) {
    img.rect(x, 30, 3, 14, C.woodLo)
    img.vline(x + 2, 30, 43, C.wood)
    img.hline(x - 2, x + 4, 43, '#cfeaff', 0.7)
    img.hline(x - 1, x + 3, 44, '#cfeaff', 0.4)
  }
  img.blit(planks(56, 30, true), 2, 0)
  img.rect(2, 30, 56, 3, C.woodLo)
  return img.outline(C.K)
}

function workshop(level) {
  const img = new Img(64, 64)
  // Стіни з вертикальних дощок.
  for (let y = 34; y < 60; y++)
    for (let x = 10; x < 54; x++) {
      const b = (x - 10) % 5
      img.set(x, y, b === 4 ? C.woodLo : b === 0 ? C.woodHi : hash(x, y, 31) < 0.08 ? '#7a4f30' : C.wood)
    }
  img.rect(10, 34, 44, 2, '#000', 0.3)
  // Двері й вікно.
  img.rect(34, 42, 11, 18, C.woodLo)
  img.rect(35, 43, 9, 17, '#6b4426')
  img.hline(35, 43, 50, C.woodLo)
  img.set(42, 51, '#ffd23c')
  windowAt(img, 15, 42)
  // Дах із дранки.
  tileRoof(img, 4, 10, 56, 24, ['#a8804e', '#8a6038', '#664328', '#4a2f1c'])
  img.rect(4, 32, 56, 2, '#4a2f1c')
  img.hline(8, 55, 9, '#a8804e')
  if (level >= 2) {
    // Залізна труба й бочка.
    img.rect(44, 0, 6, 12, '#7d8a94')
    img.vline(44, 0, 11, '#a7b4bd')
    img.vline(49, 0, 11, '#56626b')
    img.rect(43, 0, 8, 2, '#56626b')
    img.blit(barrel(), 51, 48)
  }
  if (level >= 3) {
    flag(img, 8, 0, '#2f6fd0', '#ffd23c')
    // Шестерня-вивіска.
    img.ellipse(28, 39, 4, 4, '#7d8a94')
    img.ellipse(28, 39, 1.5, 1.5, '#3b2a22')
    for (const [dx, dy] of [[0, -5], [0, 5], [-5, 0], [5, 0]]) img.set(28 + dx, 39 + dy, '#7d8a94')
    lantern(img, 47, 40)
  }
  return img.outline(C.K)
}

function planks(w, h, vertical) {
  const img = new Img(w, h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const along = vertical ? y : x
      const across = vertical ? x : y
      const plank = Math.floor(along / 4)
      let col = hash(plank, Math.floor(across / 10), 17) < 0.5 ? C.wood : '#9a6a43'
      if (along % 4 === 3) col = C.woodLo
      else if (along % 4 === 0) col = C.woodHi
      else if (hash(x, y, 18) < 0.04) col = '#6b4426'
      img.set(x, y, col)
    }
  return img
}

function pier() {
  const len = PIER.y1 - PIER.y0 + 6
  const img = new Img(PIER.w + 8, len + 10)
  // Палі під мостками, з бурунами.
  for (let y = 10; y < len + 6; y += 24) {
    for (const x of [1, PIER.w + 4]) {
      img.rect(x, y, 3, 10, C.woodLo)
      img.hline(x - 1, x + 3, y + 9, '#cfeaff', 0.8)
    }
  }
  img.blit(planks(PIER.w, len, true), 4, 0)
  // Бокові балки й стовпчики.
  img.rect(3, 0, 2, len, C.woodLo)
  img.rect(PIER.w + 3, 0, 2, len, C.woodLo)
  for (let y = 4; y < len; y += 24) {
    img.rect(2, y, 4, 4, C.wood)
    img.hline(2, 5, y, C.woodPale)
    img.rect(PIER.w + 2, y, 4, 4, C.wood)
    img.hline(PIER.w + 2, PIER.w + 5, y, C.woodPale)
  }
  img.rect(4, len, PIER.w, 3, C.woodLo)
  return img
}

function boardwalk() {
  const w = BOARDWALK.x1 - BOARDWALK.x0 + 4
  const img = new Img(w, BOARDWALK.h + 6)
  for (const x of [6, w - 8]) {
    img.rect(x, 6, 3, BOARDWALK.h, C.woodLo)
    img.hline(x - 1, x + 3, BOARDWALK.h + 5, '#cfeaff', 0.8)
  }
  img.blit(planks(w, BOARDWALK.h, false), 0, 0)
  img.rect(0, BOARDWALK.h, w, 2, C.woodLo)
  return img
}

function postLantern() {
  const img = new Img(8, 18)
  img.rect(3, 6, 2, 12, C.woodLo)
  img.rect(1, 0, 6, 7, C.K)
  img.rect(2, 1, 4, 5, C.light)
  img.rect(2, 1, 2, 2, C.lightHi)
  return img
}

function boat() {
  const img = new Img(40, 20)
  // Човник згори: корпус, борти, лавки, весла.
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 40; x++) {
      const dx = (x + 0.5 - 20) / 19
      const dy = (y + 0.5 - 8) / 7.5
      const r = dx * dx * (dx > 0 ? 1.4 : 1) + dy * dy
      if (r > 1) continue
      img.set(x, y, r > 0.62 ? C.woodHi : y < 8 ? '#6b4426' : '#5a3a22')
    }
  for (const x of [12, 24]) img.rect(x, 3, 3, 10, C.woodPale)
  img.hline(4, 34, 16, '#cfeaff', 0.6)
  img.hline(8, 30, 17, '#cfeaff', 0.35)
  img.rect(6, 8, 30, 1, C.woodLo)
  img.vline(18, 0, 15, C.K, 0.15)
  return img.outline(C.K)
}

function sailboat() {
  const img = new Img(46, 60)
  // Корпус.
  for (let y = 42; y < 54; y++)
    for (let x = 2; x < 44; x++) {
      const dx = (x + 0.5 - 23) / 21
      const dy = (y + 0.5 - 48) / 6
      if (dx * dx * (dx < 0 ? 1.5 : 1) + dy * dy > 1) continue
      img.set(x, y, y < 46 ? C.woodHi : y < 50 ? C.wood : C.woodLo)
    }
  img.hline(6, 40, 45, '#c8372d')
  // Щогла й вітрила.
  img.vline(22, 2, 46, C.woodLo)
  for (let y = 4; y < 40; y++) {
    const w = Math.floor((y - 4) * 0.5)
    for (let x = 0; x < w; x++) img.set(23 + x, y, x > w - 3 ? '#cbc2b0' : '#f3eee2')
  }
  for (let y = 10; y < 38; y++) {
    const w = Math.floor((y - 10) * 0.4)
    for (let x = 0; x < w; x++) img.set(21 - x, y, x > w - 3 ? '#cbc2b0' : '#e6dcc4')
  }
  img.rect(23, 2, 7, 3, '#2f6fd0')
  img.rect(23, 4, 7, 2, '#ffd23c')
  img.hline(4, 42, 55, '#cfeaff', 0.7)
  img.hline(10, 36, 57, '#cfeaff', 0.4)
  return img.outline(C.K, 0.9)
}

/* ───────── Декор для пісочниці ───────── */

function decoWildflowers() {
  const img = new Img(10, 8)
  const pal = { G: '#3f7d27', g: '#74bb44', Y: '#ffd83a', W: '#fbfbf4', P: '#f28ab0', B: '#5b8ef0', c: '#f5c21b' }
  img.rows(['.W....P...', 'WcW..PcP..', '.W.Y..P.B.', '.g.g.Bg.B.', 'gG..gG.gB.', '.G.gG..G..', '.gGG.gGg..', '..G...G...'], 0, 0, pal)
  return img
}

function decoFlowerBed() {
  const img = new Img(18, 12)
  shadow(img, 9, 10, 9, 2, 0.25)
  img.rect(1, 4, 16, 7, C.woodLo)
  img.rect(2, 5, 14, 5, '#5e3d25')
  img.hline(1, 16, 4, C.woodPale)
  for (let x = 3; x < 15; x += 3) {
    const col = ['#e2382c', '#ffd83a', '#f28ab0', '#5b8ef0'][(x / 3) % 4 | 0]
    img.set(x, 6, '#3f7d27')
    img.set(x + 1, 7, '#74bb44')
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) img.set(x + dx, 3 + dy, col)
    img.set(x, 3, '#fff2a8')
    img.set(x, 5, '#3f7d27')
  }
  return img.outline(C.K, 0.8)
}

function decoSunflowers() {
  const img = new Img(14, 26)
  shadow(img, 7, 24, 6, 1.5)
  for (const [x, top] of [[4, 6], [10, 2]]) {
    img.vline(x, top + 4, 24, '#3f7d27')
    img.set(x + 1, top + 10, '#74bb44')
    img.set(x + 2, top + 9, '#74bb44')
    img.set(x - 1, top + 14, '#74bb44')
    img.set(x - 2, top + 13, '#74bb44')
    img.ellipse(x, top + 2, 3.5, 3.5, '#ffc61a')
    img.ellipse(x, top + 2, 1.6, 1.6, '#6b4426')
    img.set(x - 1, top, '#ffe680')
  }
  return img.outline(C.K, 0.7)
}

function decoSapling() {
  const img = new Img(18, 28)
  shadow(img, 9, 26, 7, 2)
  img.rect(8, 14, 2, 13, C.wood)
  img.vline(8, 14, 26, C.woodLo)
  canopy(img, [[9, 9, 7], [5, 12, 4], [13, 12, 4]], LEAF, 41)
  return img.outline('#1e3a12')
}

function decoPine() {
  const img = new Img(28, 46)
  shadow(img, 14, 43, 11, 3)
  img.rect(12, 34, 4, 10, C.wood)
  img.vline(12, 34, 43, C.woodLo)
  const PINE = ['#9ad861', '#5fa043', '#3f7f37', '#2d6230', '#1e4626']
  // Яруси хвої: трикутники, світліші зліва.
  for (const [top, half, hgt] of [[2, 6, 12], [10, 9, 13], [19, 12, 15]]) {
    for (let y = 0; y < hgt; y++) {
      const w = Math.round(1 + (half * y) / (hgt - 1))
      for (let x = -w; x <= w; x++) {
        const u = (x + w) / (2 * w + 1)
        const k = y === hgt - 1 ? 4 : u < 0.25 ? 1 : u < 0.6 ? 2 : u < 0.85 ? 3 : 4
        img.set(14 + x, top + y, PINE[k])
        if (k <= 2 && hash(x, y + top, 47) < 0.08) img.set(14 + x, top + y, PINE[0])
      }
    }
  }
  img.set(14, 1, '#ffd23c')
  return img.outline('#16301b')
}

function decoPumpkins() {
  const img = new Img(20, 13)
  shadow(img, 10, 11, 9, 2)
  img.hline(2, 17, 6, '#3f7d27')
  img.set(5, 5, '#74bb44')
  img.set(14, 5, '#74bb44')
  for (const [x, y, r] of [[5, 8, 4], [14, 8, 3.5], [10, 9, 3]]) {
    img.ellipse(x, y, r, r * 0.75, '#e8892d')
    img.vline(x, y - 2, y + 2, '#b8621b')
    img.set(x - 2, y - 1, '#ffb05a')
    img.set(x, y - 3, '#3f7d27')
  }
  return img.outline(C.K, 0.8)
}

function decoSteppingStone() {
  const img = new Img(10, 7)
  img.ellipse(5.5, 4.5, 4.5, 2.4, '#6b5130', 0.3)
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 9; x++) {
      const dx = (x + 0.5 - 4.5) / 4.5
      const dy = (y + 0.5 - 3) / 2.6
      const r = dx * dx + dy * dy
      if (r > 1) continue
      const light = -dx * 0.4 - dy * 0.7
      img.set(x, y, ramp(STONE_PALS[0], 0.5 + light * 0.45 + (r > 0.7 ? -0.15 : 0), x, y))
    }
  return img
}

function decoCobbleTile() {
  const img = new Img(16, 16)
  img.rect(0, 0, 16, 16, '#5a524a')
  const stones = [[0, 0, 8, 6], [8, 0, 8, 6], [0, 6, 5, 5], [5, 6, 6, 5], [11, 6, 5, 5], [0, 11, 8, 5], [8, 11, 8, 5]]
  stones.forEach(([x, y, w, h], k) => {
    const pal = STONE_PALS[k % 3]
    for (let j = 1; j < h; j++)
      for (let i = 1; i < w; i++) {
        if ((i === 1 || i === w - 1) && (j === 1 || j === h - 1)) continue
        let tone = 0.5 + (hash(k, 0, 51) - 0.5) * 0.2
        if (j === 1 || i === 1) tone = 0.85
        if (j === h - 1 || i === w - 1) tone = 0.2
        img.set(x + i - 0.5, y + j - 0.5, ramp(pal, tone, x + i, y + j))
      }
  })
  return img
}

function decoPlankFloor() {
  const img = planks(16, 16, true)
  img.hline(0, 15, 0, C.woodHi)
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) img.set(x, y, C.K)
  return img
}

function decoStoneLantern() {
  const img = new Img(12, 22)
  shadow(img, 6, 20, 5, 1.5)
  const S = (x, y, w, h, tone) => {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) img.set(x + i, y + j, ramp(STONE_PALS[0], tone + (i === 0 ? 0.25 : i === w - 1 ? -0.25 : 0), x + i, y + j))
  }
  S(3, 15, 6, 6, 0.5)
  S(4, 11, 4, 4, 0.55)
  S(2, 9, 8, 2, 0.6)
  img.rect(3, 4, 6, 5, '#3b3631')
  img.rect(4, 5, 4, 3, C.light)
  img.rect(4, 5, 2, 1, C.lightHi)
  S(1, 2, 10, 2, 0.65)
  S(4, 0, 4, 2, 0.6)
  return img.outline(C.K)
}

function decoWell() {
  const img = new Img(28, 32)
  shadow(img, 14, 29, 13, 3)
  // Кам'яне кільце з водою.
  stoneWall(img, 3, 18, 22, 11, 14)
  img.ellipse(14, 18, 11, 4, '#8f887c')
  img.ellipse(14, 18, 8.5, 2.6, '#1d3550')
  img.ellipse(13, 17.5, 4, 1, '#3b6f9a')
  // Дашок на стовпах, коловорот і відро.
  img.rect(4, 6, 2, 13, C.wood)
  img.rect(22, 6, 2, 13, C.wood)
  img.vline(4, 6, 18, C.woodLo)
  img.vline(22, 6, 18, C.woodLo)
  tileRoof(img, 1, 1, 26, 6)
  img.hline(1, 26, 7, '#6e281a')
  img.hline(6, 21, 10, C.woodPale)
  img.vline(14, 10, 14, '#c8b48c')
  img.rect(12, 14, 4, 3, C.wood)
  img.hline(12, 15, 14, C.woodPale)
  return img.outline(C.K)
}

function decoFence() {
  const img = new Img(18, 16)
  shadow(img, 9, 14, 9, 1.5, 0.2)
  for (const x of [1, 8, 15]) {
    img.rect(x, 3, 2, 12, C.wood)
    img.vline(x, 3, 14, C.woodLo)
    img.hline(x, x + 1, 2, C.woodPale)
  }
  for (const y of [6, 10]) {
    img.hline(0, 17, y, C.woodPale)
    img.hline(0, 17, y + 1, C.wood)
  }
  return img.outline(C.K, 0.9)
}

function decoBench() {
  const img = new Img(26, 17)
  shadow(img, 13, 15, 12, 2)
  img.rect(2, 2, 22, 3, C.wood)
  img.hline(2, 23, 2, C.woodHi)
  img.rect(2, 6, 22, 2, C.wood)
  img.hline(2, 23, 6, C.woodHi)
  img.rect(1, 9, 24, 3, C.woodPale)
  img.hline(1, 24, 9, '#ddb67e')
  img.hline(1, 24, 11, C.wood)
  for (const x of [3, 21]) img.rect(x, 2, 2, 13, C.woodLo)
  return img.outline(C.K)
}

function decoHay() {
  const img = new Img(22, 18)
  shadow(img, 11, 16, 10, 2)
  for (let y = 3; y < 16; y++)
    for (let x = 1; x < 21; x++) {
      const dx = (x + 0.5 - 11) / 10
      const dy = (y + 0.5 - 10) / 7
      if (dx * dx + dy * dy * (y < 10 ? 1.4 : 0.6) > 1) continue
      const light = -dx * 0.5 - dy * 0.7
      img.set(x, y, light > 0.35 ? '#f6dc7a' : light > -0.1 ? '#e3bf4f' : light > -0.5 ? '#c49a35' : '#9a7424')
      if (hash(x, y, 61) < 0.12) img.set(x, y, '#fff0a8')
      if (hash(x, y, 62) < 0.08) img.set(x, y, '#9a7424')
    }
  img.hline(3, 18, 11, '#8e2a1f')
  return img.outline(C.K, 0.85)
}

function decoSignpost() {
  const img = new Img(18, 22)
  shadow(img, 9, 20, 4, 1.5)
  img.rect(8, 4, 2, 17, C.wood)
  img.vline(8, 4, 20, C.woodLo)
  // Дві дощечки-стрілки в різні боки.
  img.rows(['.LLLLLLLL..', 'LLLLLLLLLL.', '.LLLLLLLL..'], 6, 4, { L: C.woodPale })
  img.rows(['..LLLLLLLL.', '.LLLLLLLLLL', '..LLLLLLLL.'], 1, 10, { L: '#c08c58' })
  img.hline(8, 13, 5, C.wood)
  img.hline(4, 9, 11, C.wood)
  return img.outline(C.K)
}

function decoCampfire() {
  const img = new Img(18, 12)
  shadow(img, 9, 10, 8, 2)
  for (const [x, y] of [[2, 7], [5, 9], [9, 10], [13, 9], [16, 7], [14, 5], [4, 5]]) {
    img.ellipse(x, y, 2, 1.5, '#8f887c')
    img.set(x - 1, y - 1, '#c8c2b6')
  }
  // Поліна навхрест і жар; полум'я малює рушій.
  for (let i = 0; i < 9; i++) {
    img.set(5 + i, 4 + Math.floor(i / 3), C.wood)
    img.set(13 - i, 4 + Math.floor(i / 3), '#6b4426')
  }
  img.rect(7, 6, 5, 2, '#ff8a2a')
  img.set(9, 6, '#ffd35a')
  return img.outline(C.K, 0.8)
}

function decoSprites() {
  return {
    deco_wildflowers: decoWildflowers(),
    deco_flower_bed: decoFlowerBed(),
    deco_sunflowers: decoSunflowers(),
    deco_sapling: decoSapling(),
    deco_pine: decoPine(),
    deco_pumpkins: decoPumpkins(),
    deco_stepping_stone: decoSteppingStone(),
    deco_cobble_tile: decoCobbleTile(),
    deco_plank_floor: decoPlankFloor(),
    deco_stone_lantern: decoStoneLantern(),
    deco_well: decoWell(),
    deco_fence: decoFence(),
    deco_bench: decoBench(),
    deco_hay: decoHay(),
    deco_signpost: decoSignpost(),
    deco_campfire: decoCampfire(),
  }
}

/* ───────── Атлас ───────── */

function buildSprites() {
  const s = {
    ...heroFrames(),
    oak: oak(),
    birch: birch(),
    bush: bush(false),
    bush_berry: bush(true),
    rock: rock(false),
    rock_big: rock(true),
    stump: stump(),
    flowers: flowers('#ffe066'),
    flowers_w: flowers('#ffffff'),
    flowers_p: flowers('#f28ab0'),
    tuft: tuft(),
    shell: shell(),
    crates: crates(),
    barrel: barrel(),
    clothesline: clothesline(),
    sign: sign(),
    plot_grass: plotGrass(),
    rubble: rubble(),
    chest: chest(false),
    chest_open: chest(true),
    pier: pier(),
    boardwalk: boardwalk(),
    deck: deck(),
    post_lantern: postLantern(),
    boat: boat(),
    sailboat: sailboat(),
    ...decoSprites(),
  }
  for (let l = 1; l <= 3; l++) {
    s[`house_${l}`] = house(l)
    s[`lighthouse_${l}`] = lighthouse(l)
    s[`garden_${l}`] = garden(l)
    s[`workshop_${l}`] = workshop(l)
  }
  return s
}

/** Полиці: спрайти за висотою, 1 px проміжку, ширина атласу 512. */
function pack(sprites) {
  const W = 512
  const entries = Object.entries(sprites).sort((a, b) => b[1].h - a[1].h)
  let x = 0
  let y = 0
  let shelf = 0
  const frames = {}
  for (const [name, img] of entries) {
    if (x + img.w > W) {
      x = 0
      y += shelf + 1
      shelf = 0
    }
    frames[name] = { x, y, w: img.w, h: img.h }
    x += img.w + 1
    shelf = Math.max(shelf, img.h)
  }
  const atlas = new Img(W, y + shelf)
  for (const [name, img] of entries) atlas.blit(img, frames[name].x, frames[name].y)
  return { atlas, frames }
}

/* ───────── Прев'ю: уся мапа з об'єктами (для перевірки очима) ───────── */

function preview(ground, foam, water, sprites, levels, scale, debugWalk) {
  const img = new Img(MAP.w, MAP.h)
  for (let y = 0; y < MAP.h; y++)
    for (let x = 0; x < MAP.w; x++) {
      const i = ((y % 64) * 64 + (x % 64)) * 4
      img.set(x, y, '#' + [water.d[i], water.d[i + 1], water.d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''))
    }
  img.blit(ground, 0, 0)
  img.blit(foam, 0, 0)
  const list = placements(levels, false)
  list.push({ s: 'hero_down_0', x: 256, y: 200, layer: 'obj' })
  const sorted = [...list.filter((p) => p.layer === 'floor'), ...list.filter((p) => p.layer !== 'floor').sort((a, b) => a.y - b.y)]
  for (const p of sorted) {
    const sp = sprites[p.s]
    img.blit(sp, Math.round(p.x - sp.w / 2), Math.round(p.y - sp.h))
  }
  if (debugWalk) {
    const grid = mergeWalk(debugWalk, list)
    const cols = debugWalk[0].length
    grid.forEach((v, i) => {
      if (!v) img.rect((i % cols) * CELL, Math.floor(i / cols) * CELL, CELL, CELL, '#ff0000', 0.3)
    })
    for (const it of INTERACT) {
      img.ellipse(it.near[0], it.near[1], 2, 2, '#ffff00')
      const [x, y, w, h] = it.box
      img.hline(x, x + w, y, '#ff00ff')
      img.hline(x, x + w, y + h, '#ff00ff')
      img.vline(x, y, y + h, '#ff00ff')
      img.vline(x + w, y, y + h, '#ff00ff')
    }
  }
  const out = new Img(MAP.w * scale, MAP.h * scale)
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) {
      const si = (Math.floor(y / scale) * MAP.w + Math.floor(x / scale)) * 4
      const oi = (y * out.w + x) * 4
      for (let k = 0; k < 4; k++) out.d[oi + k] = img.d[si + k]
    }
  return out
}

/* ───────── Запуск ───────── */

const t = terrain()
const ground = groundImage(t)
const foam = shoreImage(t)
const water = waterImage()
const sprites = buildSprites()
const { atlas, frames } = pack(sprites)

mkdirSync(OUT_PUBLIC, { recursive: true })
writeFileSync(join(OUT_PUBLIC, 'ground.png'), encodePng(ground))
writeFileSync(join(OUT_PUBLIC, 'foam.png'), encodePng(foam))
writeFileSync(join(OUT_PUBLIC, 'water.png'), encodePng(water))
writeFileSync(join(OUT_PUBLIC, 'sprites.png'), encodePng(atlas))
writeFileSync(OUT_ATLAS, JSON.stringify({ size: { w: atlas.w, h: atlas.h }, frames, walk: walkGrid(t) }) + '\n')
console.log(`ground ${ground.w}×${ground.h}, sprites ${atlas.w}×${atlas.h} (${Object.keys(frames).length} кадрів)`)

const pi = process.argv.indexOf('--preview')
if (pi > 0) {
  const dir = process.argv[pi + 1]
  mkdirSync(dir, { recursive: true })
  const f0 = new Img(MAP.w, MAP.h)
  f0.d.set(foam.d.subarray(0, MAP.w * MAP.h * 4))
  for (const [name, levels] of [
    ['preview-max', { house: 3, pier: 3, garden: 3, workshop: 3, lighthouse: 3 }],
    ['preview-start', { house: 1, pier: 1, garden: 0, workshop: 0, lighthouse: 0 }],
  ])
    writeFileSync(join(dir, `${name}.png`), encodePng(preview(ground, f0, water, sprites, levels, 2)))
  writeFileSync(
    join(dir, 'preview-walk.png'),
    encodePng(preview(ground, f0, water, sprites, { house: 2, pier: 2, garden: 2, workshop: 2, lighthouse: 2 }, 2, walkGrid(t)))
  )
  const heroes = Object.keys(sprites).filter((k) => k.startsWith('hero_'))
  const sheet = new Img(heroes.length * 18, 24)
  heroes.forEach((k, i) => sheet.blit(sprites[k], i * 18 + 1, 1))
  const hz = new Img(sheet.w * 6, sheet.h * 6)
  for (let y = 0; y < hz.h; y++)
    for (let x = 0; x < hz.w; x++) {
      const si = (Math.floor(y / 6) * sheet.w + Math.floor(x / 6)) * 4
      const oi = (y * hz.w + x) * 4
      for (let k = 0; k < 4; k++) hz.d[oi + k] = sheet.d[si + k]
    }
  writeFileSync(join(dir, 'hero-x6.png'), encodePng(hz))
  const big = new Img(atlas.w * 3, atlas.h * 3)
  for (let y = 0; y < big.h; y++)
    for (let x = 0; x < big.w; x++) {
      const si = (Math.floor(y / 3) * atlas.w + Math.floor(x / 3)) * 4
      const oi = (y * big.w + x) * 4
      for (let k = 0; k < 4; k++) big.d[oi + k] = atlas.d[si + k]
    }
  writeFileSync(join(dir, 'atlas-x3.png'), encodePng(big))
  console.log(`прев'ю → ${dir}`)
}
