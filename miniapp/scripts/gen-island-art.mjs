/**
 * Генератор текстур і спрайтів для прогулянки рідним островом.
 *   node scripts/gen-island-art.mjs [--preview <dir>]
 *
 * Пише public/game/walk/{ground,foam,water,home,sprites}.png і src/game/walk/atlas.json.
 * Усе детерміноване (фіксований seed) — повторний запуск дає ті самі файли.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'
import { FLOOR, HOME_MAP, homePlacements } from '../src/game/walk/home.js'
import { farmArt } from './farm-art.mjs'
import { homeArt } from './home-art.mjs'
import { decorArt } from './decor-art.mjs'
import { BEDS, BOARDWALK, CELL, DECOR, INTERACT, LAND, MAP, PATH, PIER, PLAZA, TRAILS, placements, walkGrid as mergeWalk } from '../src/game/walk/layout.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PUBLIC = join(ROOT, 'public/game/walk')
const OUT_ATLAS = join(ROOT, 'src/game/walk/atlas.json')
/** Окремий аркуш для хатинки зсередини: усі спрайти home_* (меблі, речі на стінах, лежанка). */
const OUT_HOME_ATLAS = join(ROOT, 'src/game/walk/home-atlas.json')
const isInterior = (name) => name.startsWith('home_')
/** Нові речі для пісочниці хати — третій аркуш (home-decor.png, спрайти hd_*). */
const isDecor = (name) => name.startsWith('hd_')
const OUT_DECOR_ATLAS = join(ROOT, 'src/game/walk/home-decor.json')
/** Намальовані вручну/AI спрайти будівель: <назва кадру>.png замінює згенерований кадр з тією ж назвою. */
const HANDMADE = join(ROOT, 'public/game/buildings')

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

/** Читання PNG (8 біт, RGB/RGBA, без черезрядковості — як пише Pillow) у Img. */
function decodePng(buf) {
  let off = 8
  let w = 0
  let h = 0
  let ct = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      ct = data[9]
      if (data[8] !== 8 || data[12] !== 0 || (ct !== 6 && ct !== 2)) throw new Error('PNG: лише 8-бітні RGB/RGBA без interlace')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const bpp = ct === 6 ? 4 : 3
  const stride = w * bpp
  const px = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x
      const a = x >= bpp ? px[i - bpp] : 0
      const b = y ? px[i - stride] : 0
      const c = x >= bpp && y ? px[i - stride - bpp] : 0
      let v = line[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const p0 = a + b - c
        const pa = Math.abs(p0 - a)
        const pb = Math.abs(p0 - b)
        const pc = Math.abs(p0 - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[i] = v & 255
    }
  }
  return { w, h, bpp, px }
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

/** Класифікація пікселів, бруківка, стежки й поля відстаней. Острів рівний — без обривів і сходів. */
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
  return {
    cls,
    path,
    trail,
    dWater: distanceTo(isWater, w, h), // для суші: як далеко вода
    dLand: distanceTo(isLand, w, h), // для води: як далеко берег
    dEdge: distanceTo(notGrass, w, h), // для трави: як далеко край плато
  }
}

/* ───────── Палітри землі (рампи від тіні до світла) ───────── */

const GRASS_PAL = ['#1f4a2a', '#28602e', '#337633', '#418c37', '#52a13c', '#66b443', '#7fc74d', '#9ad85a']
const DRY_PAL = ['#3a5a26', '#4c7029', '#60862e', '#779b35', '#90af3f', '#a9c24e', '#c2d466']
const SAND_PAL = ['#c7a06a', '#d4b079', '#dfc088', '#e8cd97', '#f0daa8', '#f7e7bf', '#fcf2d6']
const WET_PAL = ['#8f7450', '#a3855c', '#b5966a', '#c4a679']
const DIRT_PAL = ['#4a2f1d', '#5e3d25', '#734d2f', '#89603b', '#9f7449', '#b5895c']
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
  const { cls, path, trail, dWater, dLand, dEdge } = t
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

      /* Бруківка й кладка на піску. */
      if (path[i] < 0 && c !== ROCK) {
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

      // Край трави: м'який перехід у пісок з усіх боків — острів рівний.
      const de = dEdge[i]
      if (de <= 1.5) img.set(x, y, ramp(SAND_PAL, 0.5, x, y), 0.45)
      else if (de < 3 && bayer(x, y) < 0.3) img.set(x, y, SAND_PAL[3], 0.6)
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

  // Кам'яні плити по піску до причалу.
  const pts = PATH.points
  const [ax, ay] = pts.at(-2)
  const [bx, by] = pts.at(-1)
  for (let s = 0; s <= 1; s += 0.02) {
    const x = ax + (bx - ax) * s
    const y = ay + (by - ay) * s
    const i = idx(Math.round(x), Math.round(y))
    if (cls[i] !== SAND || dEdge[i] < 3 || y > PIER.y0 - 2) continue
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
  const beach = (x, y) => cls[idx(x, y)] === SAND && dWater[idx(x, y)] > 3 && dWater[idx(x, y)] < 16 && path[idx(x, y)] > 3
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

/** Сітка прохідності: клітинка CELL×CELL прохідна, якщо майже вся — суша (крім квітників). */
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
          if (t.cls[i] !== WATER && !inBed(x, y)) ok++
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

/* ───────── Хатинка зсередини ───────── */

const WHITE = ['#d9ccb2', '#e6dbc4', '#efe6d3', '#f6f0e2']
const RED = ['#7e1f1a', '#b8322a', '#d9493a']


function homeWalkGrid() {
  const cols = HOME_MAP.w / CELL
  const rows = HOME_MAP.h / CELL
  const out = []
  for (let cy = 0; cy < rows; cy++) {
    let line = ''
    for (let cx = 0; cx < cols; cx++) {
      const x = cx * CELL
      const y = cy * CELL
      line += x >= FLOOR.x0 && x + CELL <= FLOOR.x1 && y + CELL / 2 >= FLOOR.y0 && y + CELL <= FLOOR.y1 ? '1' : '0'
    }
    out.push(line)
  }
  return out
}

/** Вишитий ромбик: червоне з чорним на білому. */
function embroidery(img, x0, y0, w, h, base = '#f3eee2') {
  img.rect(x0, y0, w, h, base)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.abs(((x + 2) % 6) - 3) + Math.abs((y % 6) - 3)
      if (d === 2) img.set(x0 + x, y0 + y, RED[1])
      else if (d === 0) img.set(x0 + x, y0 + y, '#2b1d16')
    }
}


function homeStove() {
  const img = new Img(54, 64)
  shadow(img, 27, 61, 26, 3)
  // Комин до стелі.
  img.rect(32, 0, 14, 18, WHITE[2])
  img.vline(45, 0, 17, WHITE[0])
  img.hline(32, 45, 0, '#7a6a55')
  // Тіло печі: побілена глина, тінь праворуч.
  for (let y = 14; y < 58; y++)
    for (let x = 2; x < 52; x++) {
      if ((y < 17 && (x < 4 || x > 49)) || (y < 15 && (x < 5 || x > 48))) continue
      img.set(x, y, x > 46 ? WHITE[0] : x < 6 ? WHITE[3] : hash(x, y, 130) < 0.05 ? WHITE[1] : WHITE[2])
    }
  img.hline(4, 49, 15, '#2f6fd0')
  img.hline(3, 50, 16, '#2f6fd0')
  // Чело з жаром.
  for (let y = 32; y < 52; y++)
    for (let x = 8; x < 28; x++) {
      const dx = (x - 17.5) / 10
      const dy = (y - 41) / 9
      if (y < 41 && dx * dx + dy * dy > 1) continue
      img.set(x, y, y > 46 ? (hash(x, y, 131) < 0.5 ? '#ff8a2a' : '#ffd35a') : y > 43 ? '#7a2a14' : '#2a1a12')
    }
  img.hline(8, 27, 52, '#8f887c')
  // Петриківський розпис: квіти й листя.
  const flower = (x, y, col) => {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) img.set(x + dx, y + dy, col)
    img.set(x, y, '#ffd23c')
  }
  flower(36, 28, RED[1])
  flower(43, 34, '#2f6fd0')
  flower(37, 42, RED[1])
  flower(44, 46, '#ffd23c')
  for (const [x, y] of [[39, 31], [40, 32], [40, 38], [41, 39], [34, 36], [35, 37], [41, 44]]) img.set(x, y, '#3f7d27')
  // Припічок і низ.
  img.rect(2, 52, 50, 4, WHITE[1])
  img.hline(2, 51, 52, WHITE[3])
  img.rect(2, 56, 50, 3, '#6f675c')
  return img.outline(C.K)
}


function homeStool() {
  const img = new Img(10, 12)
  shadow(img, 5, 10, 5, 1.5)
  img.ellipse(5, 4, 4.5, 2.5, C.woodPale)
  img.hline(2, 7, 3, '#ddb67e')
  for (const x of [2, 7]) img.vline(x, 6, 10, C.woodLo)
  return img.outline(C.K)
}

function homeShelf() {
  const img = new Img(30, 36)
  img.rect(1, 0, 28, 35, C.woodLo)
  img.rect(3, 2, 24, 31, '#3b2a1f')
  for (const y of [11, 22, 33]) {
    img.rect(1, y, 28, 2, C.wood)
    img.hline(1, 28, y, C.woodPale)
  }
  // Книжки, глечики, банки.
  const books = ['#c8372d', '#2f6fd0', '#3f7d27', '#e9c56a', '#7b4fb8']
  for (let i = 0; i < 6; i++) img.rect(4 + i * 3, 4 + (i % 2), 2, 7 - (i % 2), books[i % 5])
  img.rect(22, 5, 4, 6, '#b8621b')
  img.hline(22, 25, 5, '#e8892d')
  for (const [x, col] of [[4, '#9fd3f5'], [10, '#e8892d'], [16, '#74bb44']]) {
    img.rect(x, 15, 5, 7, col)
    img.hline(x, x + 4, 15, '#f6f0e2')
  }
  img.ellipse(24, 19, 3, 3, '#c98a3a')
  for (let i = 0; i < 4; i++) img.rect(4 + i * 6, 26, 4, 7, i % 2 ? '#c8372d' : '#e9c56a')
  return img.outline(C.K)
}

function homeRug() {
  const img = new Img(68, 38)
  img.rect(0, 0, 68, 38, '#8e2a1f')
  img.rect(2, 2, 64, 34, '#f0e6cf')
  embroidery(img, 4, 4, 60, 6)
  embroidery(img, 4, 28, 60, 6)
  // Серединка — великий ромб.
  for (let y = 11; y < 27; y++)
    for (let x = 6; x < 62; x++) {
      const d = Math.abs(x - 34) / 2 + Math.abs(y - 19)
      if (d < 3) img.set(x, y, '#2b1d16')
      else if (d < 6) img.set(x, y, RED[1])
      else if (d < 7) img.set(x, y, '#ffd23c')
    }
  for (let x = 0; x < 68; x += 2) {
    img.set(x, 0, '#f0e6cf')
    img.set(x, 37, '#f0e6cf')
  }
  return img
}

function homeRushnyk() {
  const img = new Img(36, 16)
  img.rect(2, 0, 32, 2, C.woodLo)
  img.hline(2, 33, 0, C.wood)
  // Рушник перекинутий через жердинку: кінці звисають по боках.
  for (const x0 of [3, 25]) {
    embroidery(img, x0, 2, 8, 12)
    for (let x = x0; x < x0 + 8; x += 2) img.set(x, 14, RED[1])
  }
  img.rect(11, 2, 14, 4, '#f3eee2')
  for (let x = 12; x < 24; x += 3) img.set(x, 4, RED[1])
  return img.outline(C.K, 0.7)
}

function homePlant() {
  const img = new Img(16, 22)
  shadow(img, 8, 20, 6, 1.5)
  img.rect(4, 13, 8, 7, '#b8621b')
  img.hline(3, 12, 13, '#e8892d')
  img.vline(11, 14, 19, '#7a3e1e')
  canopy(img, [[8, 7, 6], [4, 9, 3.5], [12, 9, 3.5]], LEAF, 141)
  return img.outline('#1e3a12')
}

function homeArmchair() {
  const img = new Img(26, 28)
  shadow(img, 13, 25, 12, 2.5)
  img.rect(3, 0, 20, 14, RED[0])
  img.rect(5, 2, 16, 11, RED[1])
  for (const x of [8, 13, 18]) img.set(x, 6, RED[0])
  img.rect(1, 10, 6, 12, C.wood)
  img.rect(19, 10, 6, 12, C.wood)
  img.hline(1, 6, 10, C.woodPale)
  img.hline(19, 24, 10, C.woodPale)
  img.rect(6, 14, 14, 8, RED[2])
  img.hline(6, 19, 14, '#f07a68')
  for (const x of [2, 22]) img.rect(x, 22, 2, 4, C.woodLo)
  return img.outline(C.K)
}


function homeCat() {
  const img = new Img(16, 11)
  shadow(img, 8, 10, 7, 1.2)
  img.ellipse(8, 6, 6.5, 3.5, '#e8892d')
  img.ellipse(7, 5, 4, 2, '#f2a654')
  for (const x of [5, 8, 11]) img.vline(x, 3, 5, '#b8621b')
  img.ellipse(13, 5, 3, 2.5, '#e8892d')
  img.set(12, 2, '#e8892d')
  img.set(15, 2, '#e8892d')
  img.set(13, 5, '#2b1d16')
  img.set(15, 5, '#2b1d16')
  img.hline(2, 6, 9, '#b8621b')
  return img.outline(C.K)
}

/** Зробити піксель прозорим (вирізати форму з уже намальованого). */
function erase(img, x, y) {
  if (x >= 0 && y >= 0 && x < img.w && y < img.h) img.d[(y * img.w + x) * 4 + 3] = 0
}

/** Мисник на стіні: розписні тарілки на рейці, внизу — глечики, кухоль і мед. */
function homeMysnyk() {
  const img = new Img(30, 34)
  img.rect(0, 0, 30, 34, C.woodLo)
  img.rect(2, 3, 26, 28, '#3b2a1f')
  // Різьблений карниз і зубчастий низ.
  img.hline(0, 29, 0, C.wood)
  for (let x = 1; x < 29; x += 3) img.set(x, 1, C.woodPale)
  for (let x = 0; x < 30; x++) if (x % 4 >= 2) erase(img, x, 33)
  // Тарілки: біла полива, кольорове коло, жовте серце й пелюстки.
  const plate = (cx, cy, ring) => {
    img.ellipse(cx, cy, 4.2, 4.2, '#f3eee2')
    for (let a = 0; a < 12; a++) img.set(cx - 0.5 + Math.cos((a / 12) * Math.PI * 2) * 3, cy - 0.5 + Math.sin((a / 12) * Math.PI * 2) * 3, ring)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) img.set(cx - 0.5 + dx, cy - 0.5 + dy, ring === RED[1] ? '#2f6fd0' : RED[1])
    img.set(cx - 0.5, cy - 0.5, '#ffd23c')
    img.set(cx - 2.5, cy - 3.5, '#ffffff')
  }
  plate(7, 8, '#2f6fd0')
  plate(15, 8, RED[1])
  plate(23, 8, '#2f6fd0')
  img.hline(2, 27, 12, C.wood) // рейка, що тримає тарілки
  img.hline(2, 27, 13, C.woodLo)
  // Середня полиця.
  img.rect(0, 18, 30, 2, C.wood)
  img.hline(0, 29, 18, C.woodPale)
  // Глечик (глина з поливою), кухоль, банка меду, малий глечик.
  img.ellipse(6.5, 26, 3.5, 4, '#b8621b')
  img.rect(5, 20, 3, 3, '#b8621b')
  img.hline(4, 8, 20, '#e8892d')
  img.set(5, 25, '#e8892d')
  img.set(5, 26, '#e8892d')
  img.rect(12, 24, 4, 6, '#2f6fd0')
  img.hline(12, 15, 24, '#9fd3f5')
  img.vline(16, 25, 27, '#2f6fd0')
  img.rect(19, 23, 4, 7, '#e9b23a')
  img.hline(19, 22, 23, '#f6f0e2')
  img.set(20, 26, '#ffd35a')
  img.ellipse(26, 27, 2, 2.6, '#7a3e1e')
  img.hline(25, 26, 24, '#b8621b')
  img.rect(0, 30, 30, 2, C.wood)
  img.hline(0, 29, 30, C.woodPale)
  return img.outline(C.K)
}

/** Пучки сушених трав на мотузці під сволоком: м'ята, чебрець, звіробій (гілочки з листям, не суцільні). */
function homeHerbs() {
  const img = new Img(28, 21)
  img.hline(0, 27, 1, '#c79a62')
  img.set(0, 0, '#8b5d3b')
  img.set(27, 0, '#8b5d3b')
  const bundle = (cx, seed, pal, bloom) => {
    // Гілочки розходяться від перев'язки донизу, кожна трохи інакша.
    const tips = [-4, -2, 0, 2, 4]
    tips.forEach((dx, k) => {
      const len = 12 + Math.floor(hash(k, seed, 7) * 5)
      for (let i = 0; i <= len; i++) {
        const t = i / len
        const x = Math.round(cx + dx * t * t + (dx ? 0 : Math.sin(i * 0.7) * 0.6))
        const y = 4 + i
        img.set(x, y, '#5e5a30')
        // Листочки по черзі з боків стебла; ближче до низу — квіточки.
        if (i > 2 && i % 2 === k % 2) img.set(x + (i % 4 < 2 ? -1 : 1), y, pick(pal, hash(x, y, seed)))
        if (i > 3 && hash(x, y, seed + 1) < 0.35) img.set(x + (i % 4 < 2 ? 1 : -1), y, pick(pal, hash(y, x, seed)))
        if (bloom && i > len - 4 && hash(x, y, seed + 2) < 0.5) img.set(x, y + 1, bloom)
      }
    })
    img.rect(cx - 1, 2, 3, 2, RED[1]) // перев'язка
    img.set(cx + 1, 2, RED[2])
  }
  bundle(5, 11, ['#4d6a2c', '#6a8a45', '#86a35e'], null)
  bundle(14, 23, ['#6a7a3a', '#7d8f5a', '#94a26a'], '#a77fd0')
  bundle(23, 37, ['#5a6a30', '#7a8a40', '#98a55a'], '#ffd23c')
  return img.outline(C.K, 0.75)
}

/** Вудки на кілочках і низка в'яленої тарані — нагадування про причал. */
function homeRods() {
  const img = new Img(26, 38)
  const line = (x0, y0, x1, y1, col, tip) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let i = 0; i <= n; i++) img.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, tip && i > n * 0.8 ? tip : col)
  }
  // Дві вудки поруч, сперті на кілочки: коркові руків'я внизу, котушка на темній.
  line(2, 37, 9, 1, C.wood, C.woodPale)
  line(6, 37, 13, 2, '#5b3a22', '#8b5d3b')
  line(2, 37, 3, 31, '#d9b07a')
  line(6, 37, 7, 31, '#d9b07a')
  img.ellipse(8.5, 29.5, 1.8, 1.8, '#8f887c')
  img.set(8, 29, '#cfc8bb')
  img.rect(2, 11, 12, 2, C.woodLo) // поперечка-кілочки
  img.hline(2, 13, 11, C.wood)
  // Волосінь з поплавцем звисає з кінчика світлої вудки.
  for (let y = 2; y < 9; y++) img.set(10, y, '#e6dbc4')
  img.set(10, 9, RED[1])
  img.set(10, 10, '#f3eee2')
  // Низка тарані на мотузці з окремого кілочка.
  img.rect(19, 2, 3, 2, C.woodLo)
  img.vline(20, 4, 33, '#c79a62')
  const fish = (y, right) => {
    // Рибка головою вгору: срібляста спина, золотаве черевце, хвіст-ластівка внизу.
    const x0 = right ? 21 : 16
    img.rect(x0, y, 4, 7, '#9c9488')
    erase(img, x0, y) // скошена голова
    img.vline(right ? x0 + 3 : x0, y + 2, y + 5, '#d9b45a')
    img.vline(right ? x0 : x0 + 3, y + 1, y + 6, '#6f675c')
    img.set(right ? x0 + 1 : x0 + 2, y + 1, '#2b1d16')
    img.set(x0, y + 7, '#6f675c')
    img.set(x0 + 3, y + 7, '#6f675c')
    img.hline(x0 + 1, x0 + 2, y + 7, '#8f887c')
  }
  fish(6, false)
  fish(14, true)
  fish(22, false)
  return img.outline(C.K, 0.8)
}

/** Діжка з водою й корячком біля печі. */
function homeWaterBarrel() {
  const img = new Img(16, 20)
  shadow(img, 8, 18, 7, 1.6)
  for (let y = 5; y < 18; y++)
    for (let x = 2; x < 14; x++) {
      const bulge = y > 7 && y < 15 ? 0 : 1 // діжка пузата посередині
      if (x < 2 + bulge || x > 13 - bulge) continue
      img.set(x, y, x > 11 ? C.woodLo : x % 3 === 0 ? C.wood : x < 5 ? C.woodHi : '#9a6a42')
    }
  for (const y of [7, 15]) {
    img.hline(2, 13, y, '#6f675c')
    img.set(4, y, '#aaa196')
  }
  img.ellipse(8, 5, 6, 2.2, C.woodLo)
  img.ellipse(8, 5, 4.8, 1.5, '#3270c0')
  img.set(6, 5, '#6fb2ef')
  img.set(7, 4, '#6fb2ef')
  // Корячок: черпачок на краю, руків'я назовні.
  img.ellipse(11, 5, 1.6, 1.2, C.woodPale)
  for (let i = 0; i < 4; i++) img.set(12 + i, 4 - i, C.woodPale)
  return img.outline(C.K)
}

/** Рогач, кочерга й віник, сперті на піч. */
function homeOvenTools() {
  const img = new Img(14, 30)
  shadow(img, 7, 28, 6, 1.4)
  // Рогач: держак і залізна «рогатка» вгорі.
  img.vline(3, 7, 28, C.wood)
  img.vline(4, 9, 27, C.woodLo)
  for (const [x, y] of [[0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 6], [4, 5], [5, 4], [6, 3], [6, 2], [6, 1]]) img.set(x, y, '#6f675c')
  img.set(0, 1, '#aaa196')
  img.set(6, 1, '#aaa196')
  // Кочерга.
  img.vline(8, 4, 28, '#5e574f')
  img.set(9, 4, '#5e574f')
  img.set(9, 5, '#6f675c')
  // Віник: держак, червона перев'язка, віяло соломи.
  img.vline(11, 10, 18, '#c79a62')
  img.hline(10, 12, 18, RED[1])
  for (let y = 19; y < 29; y++) {
    const half = Math.min(2, Math.floor((y - 18) / 3))
    for (let x = 11 - half; x <= 11 + half + (y > 24 ? 1 : 0); x++) img.set(x, y, (x + y) % 2 ? '#d9b45a' : '#b08a3a')
  }
  return img.outline(C.K)
}

/** Лава з двома вишитими подушками. */
function homeBench() {
  const img = new Img(38, 16)
  shadow(img, 19, 14, 18, 2)
  img.rect(0, 5, 38, 5, C.woodPale)
  img.hline(0, 37, 5, '#ddb67e')
  img.hline(0, 37, 9, C.wood)
  for (const x of [11, 25]) img.set(x, 7, C.woodLo)
  for (const x of [3, 33]) img.rect(x, 10, 2, 5, C.woodLo)
  img.hline(4, 33, 12, C.woodLo)
  for (const x0 of [3, 21]) {
    embroidery(img, x0, 1, 14, 5)
    img.hline(x0, x0 + 13, 1, '#f6f0e2')
    erase(img, x0, 1) // заокруглені кути подушки
    erase(img, x0 + 13, 1)
  }
  return img.outline(C.K)
}

/** Кошик яблук. */
function homeBasket() {
  const img = new Img(16, 15)
  shadow(img, 8, 13, 7, 1.5)
  // Дужка.
  for (let x = 3; x <= 12; x++) img.set(x, Math.round(5 - Math.sin(((x - 3) / 9) * Math.PI) * 4.5), '#8a6a2a')
  // Яблука над краєм.
  for (const [x, y, col, hi] of [[5, 6, '#c8372d', '#f07a68'], [10, 6, '#c8372d', '#f07a68'], [7.5, 4.8, '#74bb44', '#b6e27a']]) {
    img.ellipse(x, y, 2.4, 2.2, col)
    img.set(x - 1, y - 1, hi)
  }
  img.set(7, 2, C.woodLo)
  // Плетіння: шаховий візерунок лози.
  for (let y = 7; y < 13; y++)
    for (let x = 2 + (y > 11 ? 1 : 0); x < 14 - (y > 11 ? 1 : 0); x++) img.set(x, y, (Math.floor(x / 2) + y) % 2 ? '#d9b45a' : '#b08a3a')
  img.hline(1, 14, 7, '#8a6a2a')
  return img.outline(C.K)
}

/** Прядка з куделею вовни. */
function homeSpinningWheel() {
  const img = new Img(24, 28)
  shadow(img, 12, 26, 11, 2)
  // Колесо: обід, шість спиць, маточина.
  const cx = 9
  const cy = 11
  for (let y = 2; y < 21; y++)
    for (let x = 0; x < 19; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (Math.abs(d - 7.4) < 0.75) img.set(x, y, y < cy - 3 ? C.woodHi : C.wood)
    }
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2 + 0.3
    for (let r = 1.5; r < 7; r += 0.7) img.set(cx - 0.5 + Math.cos(ang) * r, cy - 0.5 + Math.sin(ang) * r, C.woodLo)
  }
  img.ellipse(cx, cy, 1.4, 1.4, C.woodPale)
  // Стійка колеса й похила основа на трьох ніжках.
  img.vline(cx, cy + 1, 21, C.woodLo)
  for (let x = 1; x < 23; x++) {
    const y = Math.round(22 - (x - 1) * 0.14)
    img.set(x, y, C.woodPale)
    img.set(x, y + 1, C.wood)
  }
  for (const x of [3, 12, 21]) img.vline(x, 23 - Math.round((x - 1) * 0.14), 25, C.woodLo)
  // Кужіль: жердина й біла вовна з тінню.
  img.vline(19, 6, 20, C.wood)
  img.ellipse(19.5, 6, 3, 4.2, '#f3eee2')
  img.set(21, 6, '#d9ccb2')
  img.set(21, 7, '#d9ccb2')
  img.set(20, 9, '#d9ccb2')
  for (let k = 0; k < 4; k++) img.set(17 - k * 2, 9 + k, '#e6dbc4') // нитка до колеса
  return img.outline(C.K)
}

function homeSprites() {
  return {
    home_mysnyk: homeMysnyk(),
    home_herbs: homeHerbs(),
    home_rods: homeRods(),
    home_water_barrel: homeWaterBarrel(),
    home_oven_tools: homeOvenTools(),
    home_bench: homeBench(),
    home_basket: homeBasket(),
    home_spinning_wheel: homeSpinningWheel(),
    home_stove: homeStove(),
    home_stool: homeStool(),
    home_shelf: homeShelf(),
    home_rug: homeRug(),
    home_rushnyk: homeRushnyk(),
    home_plant: homePlant(),
    home_armchair: homeArmchair(),
    home_cat: homeCat(),
  }
}

/* ───────── Пес Рудько: окремий аркуш анімацій ───────── */

/**
 * Рудий сільський пес із білими грудьми й «шкарпетками», висячими темними вухами,
 * червоним нашийником і латунною біркою. Клітинка 24×20, лапи стоять на рядку 18,
 * якір — низ по центру (як у мандрівника). Кадри малюються тими самими примітивами,
 * тож пес однаковий у кожному кадрі, а рух задається параметрами пози.
 */
const DOG = {
  O: '#d07a36', // руда шерсть
  o: '#a85a26', // тінь шерсті / дальні лапи
  L: '#eda25a', // відблиск на спині
  W: '#f6f0e2', // біле
  w: '#d9ccb2', // тінь білого
  E: '#8a4a1e', // вуха
  R: C.red, // нашийник
  Y: '#ffd23c', // бірка
  T: '#e86a6a', // язик
}
const DOG_CELL = { w: 24, h: 20 }

/** Лапа 2 px: верх нерухомий, низ зміщується на dx (крок), лапка — іншим кольором. */
function dogLeg(img, x, top, bottom, dx, col, paw) {
  for (let y = top; y <= bottom; y++) {
    const off = y > (top + bottom) / 2 ? dx : 0
    img.set(x + off, y, col)
    img.set(x + 1 + off, y, col)
  }
  img.set(x + dx, bottom, paw)
  img.set(x + 1 + dx, bottom, paw)
}

/** Хвіст-бублик: точки від основи до кінчика, кінчик білий. */
function dogTail(img, pts) {
  pts.forEach(([x, y], i) => img.set(x, y, i === pts.length - 1 ? DOG.W : DOG.O))
}

/**
 * Профіль праворуч. legs/lift — [ближня задня, дальня задня, ближня передня, дальня передня];
 * bob — зсув тулуба (−1 угору); tail — −1/0/1 (мах хвостом).
 */
function dogSide({ legs = [0, 0, 0, 0], lift = [0, 0, 0, 0], bob = 0, tail = 0, tongue = false } = {}) {
  const img = new Img(DOG_CELL.w, DOG_CELL.h)
  const b = bob
  shadow(img, 12, 18.5, 9, 1.6)
  // Дальні лапи — темніші, під тулубом.
  dogLeg(img, 5, 14 + b, 18 - lift[1], legs[1], DOG.o, DOG.o)
  dogLeg(img, 13, 14 + b, 18 - lift[3], legs[3], DOG.o, DOG.o)
  // Хвіст за тулубом.
  const TAILS = {
    [-1]: [[5, 10], [4, 9], [3, 8], [3, 7], [4, 6]],
    0: [[5, 10], [4, 9], [4, 8], [4, 7], [5, 6]],
    1: [[5, 10], [5, 9], [5, 8], [6, 7], [7, 7]],
  }
  dogTail(img, TAILS[tail].map(([x, y]) => [x, y + b]))
  // Тулуб, біле черевце й груди, відблиск на спині.
  img.ellipse(11, 12 + b, 6.5, 3.4, DOG.O)
  img.ellipse(12, 14.3 + b, 4.5, 1.2, DOG.W)
  img.ellipse(16, 12.5 + b, 1.8, 2.4, DOG.W)
  img.hline(7, 13, 9 + b, DOG.L)
  // Ближні лапи — поверх тулуба, у білих «шкарпетках».
  dogLeg(img, 7, 14 + b, 18 - lift[0], legs[0], DOG.O, DOG.W)
  dogLeg(img, 15, 14 + b, 18 - lift[2], legs[2], DOG.O, DOG.W)
  // Голова: шерсть, відблиск, біла морда, ніс, око, вухо, нашийник із біркою.
  img.ellipse(18, 7.5 + b, 3.6, 3.4, DOG.O)
  img.hline(17, 19, 5 + b, DOG.L)
  img.rect(20, 8 + b, 3, 2, DOG.W)
  img.set(22, 8 + b, C.K)
  img.set(19, 6 + b, C.K)
  if (tongue) {
    img.set(21, 10 + b, DOG.T)
    img.set(22, 10 + b, DOG.T)
  }
  img.rect(15, 5 + b, 2, 5, DOG.E)
  img.rect(15, 9 + b, 2, 3, DOG.R)
  img.set(16, 12 + b, DOG.Y)
  return img.outline(C.K)
}

/** Анфас (до глядача). lift — [ліва, права] передні лапи; tail — кінчик хвоста визирає збоку. */
function dogFront({ lift = [0, 0], bob = 0, tail = 0, tongue = false } = {}) {
  const img = new Img(DOG_CELL.w, DOG_CELL.h)
  const b = bob
  shadow(img, 12, 18.5, 6.5, 1.5)
  // Задні лапи визирають з боків.
  dogLeg(img, 7, 15 + b, 18, 0, DOG.o, DOG.o)
  dogLeg(img, 15, 15 + b, 18, 0, DOG.o, DOG.o)
  if (tail) dogTail(img, tail > 0 ? [[16, 12 + b], [17, 11 + b], [18, 10 + b]] : [[7, 12 + b], [6, 11 + b], [5, 10 + b]])
  img.ellipse(12, 13.5 + b, 4.6, 3.2, DOG.O)
  img.ellipse(12, 13.8 + b, 2.2, 2.6, DOG.W)
  dogLeg(img, 9, 14 + b, 18 - lift[0], 0, DOG.O, DOG.W)
  dogLeg(img, 13, 14 + b, 18 - lift[1], 0, DOG.O, DOG.W)
  dogHead(img, 8 + b, tongue)
  img.hline(9, 14, 12 + b, DOG.R)
  img.set(12, 13 + b, DOG.Y)
  return img.outline(C.K)
}

/** Голова анфас із центром між пікселями 11 і 12 (симетрично). */
function dogHead(img, cy, tongue) {
  img.ellipse(12, cy, 4.2, 3.8, DOG.O)
  img.hline(10, 13, cy - 3, DOG.L)
  img.rect(7, cy - 2, 2, 5, DOG.E)
  img.rect(15, cy - 2, 2, 5, DOG.E)
  img.set(10, cy - 1, C.K)
  img.set(13, cy - 1, C.K)
  img.ellipse(12, cy + 2, 2.2, 1.5, DOG.W)
  img.set(11, cy + 1, C.K)
  img.set(12, cy + 1, C.K)
  if (tongue) {
    img.set(11, cy + 3, DOG.T)
    img.set(12, cy + 3, DOG.T)
  }
}

/** Зі спини: хвіст-бублик над спиною махає вліво-вправо. */
function dogBack({ lift = [0, 0], bob = 0, tail = 0 } = {}) {
  const img = new Img(DOG_CELL.w, DOG_CELL.h)
  const b = bob
  shadow(img, 12, 18.5, 6.5, 1.5)
  dogLeg(img, 9, 14 + b, 18 - lift[0], 0, DOG.O, DOG.W)
  dogLeg(img, 13, 14 + b, 18 - lift[1], 0, DOG.O, DOG.W)
  img.ellipse(12, 13.5 + b, 4.6, 3.2, DOG.O)
  img.hline(10, 13, 11 + b, DOG.L)
  img.ellipse(12, 8 + b, 4.2, 3.8, DOG.O)
  img.hline(10, 13, 5 + b, DOG.L)
  img.rect(7, 6 + b, 2, 5, DOG.E)
  img.rect(15, 6 + b, 2, 5, DOG.E)
  img.hline(9, 14, 11 + b, DOG.R)
  // Хвіст-бублик на крижах — найближче до глядача: тінь з одного боку, білий кінчик.
  const t = tail
  for (const [x, y, c] of [
    [11 + t, 16, DOG.o], [12 + t, 16, DOG.O],
    [11 + t, 15, DOG.o], [12 + t, 15, DOG.O], [13 + t, 15, DOG.O],
    [12 + t, 14, DOG.o], [13 + t, 14, DOG.O], [14 + t, 14, DOG.O],
    [13 + t, 13, DOG.o], [14 + t, 13, DOG.W], [15 + t, 13, DOG.W],
  ])
    img.set(x, y + b, c)
  return img.outline(C.K)
}

/** Сидить анфас: лапи рівно, хвіст на землі метляє, часом висолоплює язика. */
function dogSit({ tail = 0, tongue = false } = {}) {
  const img = new Img(DOG_CELL.w, DOG_CELL.h)
  shadow(img, 12, 18.5, 7, 1.5)
  dogTail(img, tail ? [[16, 17], [17, 17], [18, 17], [19, 16]] : [[16, 17], [17, 17], [18, 17], [19, 17]])
  img.ellipse(12, 16, 5.2, 2.6, DOG.O) // стегна
  img.set(7, 18, DOG.W)
  img.set(16, 18, DOG.W)
  img.ellipse(12, 12.5, 3.6, 3.6, DOG.O)
  img.ellipse(12, 13, 2, 2.8, DOG.W)
  dogLeg(img, 9, 13, 18, 0, DOG.O, DOG.W)
  dogLeg(img, 13, 13, 18, 0, DOG.O, DOG.W)
  dogHead(img, 6.5, tongue)
  img.hline(9, 14, 10, DOG.R)
  img.set(12, 11, DOG.Y)
  return img.outline(C.K)
}

/** Спить калачиком: голова на лапах, хвіст обвитий довкола, дихає. */
function dogSleep(breath) {
  const img = new Img(DOG_CELL.w, DOG_CELL.h)
  shadow(img, 12, 18.5, 9, 1.6)
  // Тулуб калачиком (дихає), відблиск на спині, хвіст обвиває низ білим кінчиком.
  img.ellipse(10, 14.5 - breath * 0.4, 6.5, 3.6 + breath * 0.4, DOG.O)
  img.hline(5, 12, 11 - breath, DOG.L)
  img.hline(4, 12, 17, DOG.o)
  img.set(13, 17, DOG.W)
  img.set(14, 17, DOG.W)
  // Передні лапки під мордою.
  img.rect(15, 17, 5, 1, DOG.W)
  // Голова лежить на лапах: окремий контур-складка відділяє її від тулуба.
  img.ellipse(17.5, 14.5, 3.4, 2.7, DOG.O)
  for (let y = 12; y <= 16; y++) img.set(14, y, DOG.o)
  img.hline(16, 18, 12, DOG.L)
  img.rect(15, 13, 2, 3, DOG.E) // вухо
  img.hline(18, 19, 14, C.K) // заплющене око
  img.rect(20, 15, 2, 2, DOG.W)
  img.set(21, 15, C.K)
  return img.outline(C.K)
}

/** Кадри: рядок = анімація (fps — швидкість за замовчуванням), стовпчик = кадр. */
function dogAnims() {
  const walkSide = [
    { legs: [1, -1, -1, 1], tail: 0 },
    { lift: [0, 1, 1, 0], bob: -1, tail: 1 },
    { legs: [-1, 1, 1, -1], tail: 0 },
    { lift: [1, 0, 0, 1], bob: -1, tail: -1 },
  ]
  const walkFB = [{}, { lift: [1, 0], bob: -1 }, {}, { lift: [0, 1], bob: -1 }]
  const flip = (img) => {
    const out = new Img(img.w, img.h)
    out.blit(img, 0, 0, true)
    return out
  }
  const side = (poses) => poses.map((p) => dogSide(p))
  const rightIdle = side([{ tail: 0 }, { tail: 1 }, { tail: 0 }, { tail: -1 }])
  const rightWalk = side(walkSide)
  return [
    ['idle_down', 4, [0, 1, 0, -1].map((tail) => dogFront({ tail }))],
    ['idle_up', 4, [0, 1, 0, -1].map((tail) => dogBack({ tail }))],
    ['idle_right', 4, rightIdle],
    ['idle_left', 4, rightIdle.map(flip)],
    ['walk_down', 8, walkFB.map((p, i) => dogFront({ ...p, tail: i % 2 ? (i === 1 ? 1 : -1) : 0 }))],
    ['walk_up', 8, walkFB.map((p, i) => dogBack({ ...p, tail: i % 2 ? (i === 1 ? 1 : -1) : 0 }))],
    ['walk_right', 8, rightWalk],
    ['walk_left', 8, rightWalk.map(flip)],
    ['sit', 5, [{ tail: 0 }, { tail: 1, tongue: true }, { tail: 0, tongue: true }, { tail: 1 }].map(dogSit)],
    ['sleep', 1.5, [dogSleep(0), dogSleep(1)]],
    [
      'happy',
      9,
      [
        { bob: 1, tongue: true },
        { bob: -3, lift: [2, 2], tail: 1, tongue: true },
        { bob: -2, lift: [1, 1], tail: -1, tongue: true },
        { bob: 0, tail: 1, tongue: true },
      ].map(dogFront),
    ],
  ]
}

/* ───────── Пес Сірко: дрібніший піксель (48×40), справжнє світло й шерсть ───────── */

/**
 * Сірий пухнастий вівчар із білою проточиною, грудьми й «шкарпетками» та вишитим нашийником.
 * Намальований удвічі дрібнішим пікселем за решту світу й показується в масштабі SIRKO_SCALE:
 * у грі він трохи більший за Рудька, а деталі (шерсть, блиск очей, стібки) видно при наближенні.
 * Об'єми — затінені «кульки»: світло зверху-зліва, 5–6 тонів, впорядкований дизер, нерівний пухнастий край.
 */
const SIRKO = {
  fur: ['#2b2d33', '#3f4249', '#575b63', '#737780', '#91959d', '#b4b8be'],
  farFur: ['#24262b', '#33363c', '#454850', '#5a5e66'],
  saddle: ['#33363c', '#43464d', '#53565e', '#666a72'],
  white: ['#8f949b', '#b5b9bf', '#d5d8dc', '#eceeee', '#fbfaf6'],
  farWhite: ['#7d8289', '#9da2a8', '#bcc0c5'],
  ear: ['#1f2024', '#2e3035', '#41444b'],
  earIn: ['#9c5a62', '#c9848b'],
  nose: ['#121115', '#26242a', '#6a6872'],
  eye: '#1a1418',
  collar: ['#6e1a16', '#a82c25', '#d24538'],
  stitch: '#f3eee2',
  brass: ['#7a5a18', '#c2922a', '#ffd860'],
  tongue: ['#b8444f', '#e77a83'],
  mouth: '#3a3036',
}
const SIRKO_CELL = { w: 48, h: 40 }
const SIRKO_SCALE = 0.55
const SIRKO_LIGHT = [-0.55, -0.83]

/**
 * Затінена пухнаста «кулька»: тон — від нормалі псевдосфери до світла, дизер Баєра між тонами,
 * штрихи шерсті (вертикальні рисочки на тон темніші), край тремтить шумом (fluff, px).
 * clip — малювати лише там, де вже є непрозоре (плями на тулубі не вилазять за контур).
 */
function shadedBlob(img, cx, cy, rx, ry, ramp, { seed = 1, fluff = 0, clip = false, strands = true, bias = 0 } = {}) {
  const n = ramp.length
  const pad = Math.ceil(fluff) + 1
  for (let y = Math.floor(cy - ry - pad); y <= Math.ceil(cy + ry + pad); y++)
    for (let x = Math.floor(cx - rx - pad); x <= Math.ceil(cx + rx + pad); x++) {
      if (clip && !img.alpha(x, y)) continue
      const dx = (x + 0.5 - cx) / rx
      const dy = (y + 0.5 - cy) / ry
      const r = Math.hypot(dx, dy)
      const edge = 1 + (fluff ? ((vnoise(Math.atan2(dy, dx) * 2.2 + 10, seed, seed) - 0.5) * 2 * fluff) / Math.max(rx, ry) : 0)
      if (r > edge) continue
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r) ** 2))
      const lum = (dx * SIRKO_LIGHT[0] + dy * SIRKO_LIGHT[1]) * 0.5 + nz * 0.55 + bias
      let i = Math.floor(clamp01(lum) * (n - 1) + bayer(x, y) - 0.25)
      if (strands && hash(x, Math.floor(y / 3), seed) < 0.14) i -= 1 // пасма шерсті
      img.set(x, y, ramp[Math.max(0, Math.min(n - 1, i))])
    }
}

/** Лапа: звужена донизу, освітлена зліва, нижня частина — біла «шкарпетка», внизу — пальці. */
function shadedLeg(img, x, top, bottom, dx, w, ramp, sock) {
  const len = bottom - top
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / Math.max(1, len)
    const off = Math.round(dx * t)
    const width = Math.max(2, Math.round(w - t * 1.2))
    const isSock = t > 0.62
    const pal = isSock ? sock : ramp
    for (let i = 0; i < width; i++) {
      const k = pal.length - 1 - Math.floor((i / width) * pal.length * 0.9) - (y % 2 && i === width - 1 ? 1 : 0)
      img.set(x + off + i, y, pal[Math.max(0, Math.min(pal.length - 1, k))])
    }
  }
  // Пальці на лапі.
  const bx = x + Math.round(dx)
  img.set(bx + 1, bottom, sock[0])
  if (w > 3) img.set(bx + 2, bottom, sock[0])
}

/** Пухнастий хвіст-султан: ланцюжок затінених кульок, що тоншають до білого кінчика. */
function plume(img, pts, seed, whiteFrom = 0.72) {
  pts.forEach(([x, y], i) => {
    const k = i / (pts.length - 1)
    const r = 3.4 - k * 1.5
    shadedBlob(img, x, y, r, r, k >= whiteFrom ? SIRKO.white : SIRKO.fur, { seed: seed + i, fluff: 0.8 })
  })
}

/** Трикутник (вухо) з затіненням зліва-направо. */
function tri(img, [ax, ay], [bx, by], [cx, cy], ramp) {
  const x0 = Math.floor(Math.min(ax, bx, cx))
  const x1 = Math.ceil(Math.max(ax, bx, cx))
  const y0 = Math.floor(Math.min(ay, by, cy))
  const y1 = Math.ceil(Math.max(ay, by, cy))
  const side = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const d1 = side(px, py, ax, ay, bx, by)
      const d2 = side(px, py, bx, by, cx, cy)
      const d3 = side(px, py, cx, cy, ax, ay)
      if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue
      const t = (x - x0) / Math.max(1, x1 - x0)
      img.set(x, y, ramp[Math.min(ramp.length - 1, Math.floor((1 - t) * ramp.length * 0.99 + bayer(x, y) * 0.6))])
    }
}

/** Вишитий нашийник: червона стрічка зі стібками-хрестиками й латунна бірка. */
function collarBand(img, pts, tag) {
  pts.forEach(([x, y], i) => {
    img.set(x, y, SIRKO.collar[1 + (y % 2)] ?? SIRKO.collar[1])
    if (i % 3 === 1) img.set(x, y, SIRKO.stitch)
  })
  if (tag) {
    const [tx, ty] = tag
    img.set(tx, ty, SIRKO.brass[2])
    img.set(tx + 1, ty, SIRKO.brass[1])
    img.set(tx, ty + 1, SIRKO.brass[1])
    img.set(tx + 1, ty + 1, SIRKO.brass[0])
  }
}

/** Профіль праворуч (параметри пози — як у Рудька, але в пікселях Сірка). */
function sirkoSide({ legs = [0, 0, 0, 0], lift = [0, 0, 0, 0], bob = 0, tail = 0, tongue = false } = {}) {
  const img = new Img(SIRKO_CELL.w, SIRKO_CELL.h)
  const b = bob
  shadow(img, 24, 37.5, 17, 2.2)
  shadedLeg(img, 11, 27 + b, 36 - lift[1], legs[1], 4, SIRKO.farFur, SIRKO.farWhite)
  shadedLeg(img, 29, 27 + b, 36 - lift[3], legs[3], 4, SIRKO.farFur, SIRKO.farWhite)
  const TAIL = {
    [-1]: [[9, 22], [6, 19], [4, 15], [4, 11], [6, 8]],
    0: [[9, 22], [6, 18], [6, 14], [8, 10], [11, 9]],
    1: [[9, 22], [8, 18], [9, 14], [12, 11], [15, 10]],
  }
  plume(img, TAIL[tail].map(([x, y]) => [x, y + b]), 70)
  shadedBlob(img, 22, 24 + b, 13, 7.5, SIRKO.fur, { seed: 3, fluff: 1.4 })
  shadedBlob(img, 18, 20 + b, 9, 4, SIRKO.saddle, { seed: 5, fluff: 1, clip: true, bias: 0.15 })
  shadedBlob(img, 23, 29.5 + b, 9, 2.6, SIRKO.white, { seed: 6, clip: true, bias: 0.15 })
  shadedBlob(img, 31.5, 25 + b, 4.6, 6.4, SIRKO.white, { seed: 7, fluff: 1, bias: 0.1 })
  shadedLeg(img, 14, 27 + b, 36 - lift[0], legs[0], 4, SIRKO.fur, SIRKO.white)
  shadedLeg(img, 31, 27 + b, 36 - lift[2], legs[2], 4, SIRKO.fur, SIRKO.white)
  // Голова.
  tri(img, [30, 11 + b], [35, 9 + b], [31, 2 + b], SIRKO.ear)
  tri(img, [31.5, 9.5 + b], [33.5, 9 + b], [31.8, 5 + b], SIRKO.earIn)
  shadedBlob(img, 37, 15 + b, 7.5, 6.8, SIRKO.fur, { seed: 9, fluff: 0.9 })
  shadedBlob(img, 40, 13 + b, 1.6, 4, SIRKO.white, { seed: 10, clip: true, strands: false, bias: 0.2 })
  shadedBlob(img, 42.5, 18 + b, 4.3, 3.2, SIRKO.white, { seed: 11, strands: false, bias: 0.1 })
  img.rect(45, 15 + b, 3, 2, SIRKO.nose[0])
  img.set(45, 15 + b, SIRKO.nose[2])
  img.set(46, 15 + b, SIRKO.nose[1])
  img.hline(41, 45, 20 + b, SIRKO.mouth)
  if (tongue) {
    img.rect(43, 21 + b, 2, 2, SIRKO.tongue[1])
    img.set(44, 22 + b, SIRKO.tongue[0])
  }
  img.hline(36, 38, 10 + b, SIRKO.fur[5]) // світла брова
  img.rect(37, 12 + b, 2, 2, SIRKO.eye)
  img.set(37, 12 + b, '#ffffff')
  collarBand(img, [[29, 17 + b], [29, 18 + b], [29, 19 + b], [30, 20 + b], [30, 21 + b], [30, 22 + b], [31, 23 + b], [30, 17 + b], [30, 18 + b], [30, 19 + b], [31, 20 + b], [31, 21 + b], [31, 22 + b]], [31, 24 + b])
  return img.outline(C.K)
}

/** Голова анфас (центр між пікселями 23 і 24). */
function sirkoHead(img, cy, tongue) {
  tri(img, [16, cy - 4], [21, cy - 6], [15, cy - 13], SIRKO.ear)
  tri(img, [32, cy - 4], [27, cy - 6], [33, cy - 13], SIRKO.ear)
  tri(img, [17, cy - 5], [20, cy - 6], [16.5, cy - 10], SIRKO.earIn)
  tri(img, [31, cy - 5], [28, cy - 6], [31.5, cy - 10], SIRKO.earIn)
  shadedBlob(img, 24, cy, 8, 7.4, SIRKO.fur, { seed: 21, fluff: 1 })
  shadedBlob(img, 24, cy - 3, 1.8, 4.5, SIRKO.white, { seed: 22, clip: true, strands: false, bias: 0.2 })
  shadedBlob(img, 24, cy + 4.5, 4.6, 3.4, SIRKO.white, { seed: 23, strands: false, bias: 0.1 })
  for (const ex of [19, 27]) {
    img.rect(ex, cy - 1, 2, 2, SIRKO.eye)
    img.set(ex, cy - 1, '#ffffff')
    img.hline(ex - 1, ex + 2, cy - 3, SIRKO.fur[5])
  }
  img.rect(22, cy + 2, 4, 2, SIRKO.nose[0])
  img.set(22, cy + 2, SIRKO.nose[2])
  img.set(23, cy + 2, SIRKO.nose[1])
  img.hline(23, 24, cy + 5, SIRKO.mouth)
  if (tongue) {
    img.rect(23, cy + 6, 2, 2, SIRKO.tongue[1])
    img.set(24, cy + 7, SIRKO.tongue[0])
  }
}

function sirkoFront({ lift = [0, 0], bob = 0, tail = 0, tongue = false } = {}) {
  const img = new Img(SIRKO_CELL.w, SIRKO_CELL.h)
  const b = bob
  shadow(img, 24, 37.5, 12, 2)
  shadedLeg(img, 13, 30 + b, 36, 0, 4, SIRKO.farFur, SIRKO.farWhite)
  shadedLeg(img, 31, 30 + b, 36, 0, 4, SIRKO.farFur, SIRKO.farWhite)
  if (tail) plume(img, tail > 0 ? [[32, 27 + b], [35, 24 + b], [37, 21 + b], [38, 18 + b]] : [[16, 27 + b], [13, 24 + b], [11, 21 + b], [10, 18 + b]], 80)
  shadedBlob(img, 24, 27 + b, 9.5, 7, SIRKO.fur, { seed: 31, fluff: 1.4 })
  shadedBlob(img, 24, 27.5 + b, 5, 6.5, SIRKO.white, { seed: 32, fluff: 1, bias: 0.12 })
  shadedLeg(img, 18, 28 + b, 36 - lift[0], 0, 4, SIRKO.fur, SIRKO.white)
  shadedLeg(img, 26, 28 + b, 36 - lift[1], 0, 4, SIRKO.fur, SIRKO.white)
  sirkoHead(img, 15 + b, tongue)
  const band = []
  for (let x = 17; x <= 30; x++) band.push([x, 22 + b + (x > 18 && x < 29 ? 1 : 0)])
  collarBand(img, band, [23, 24 + b])
  return img.outline(C.K)
}

function sirkoBack({ lift = [0, 0], bob = 0, tail = 0 } = {}) {
  const img = new Img(SIRKO_CELL.w, SIRKO_CELL.h)
  const b = bob
  shadow(img, 24, 37.5, 12, 2)
  shadedLeg(img, 18, 28 + b, 36 - lift[0], 0, 4, SIRKO.fur, SIRKO.white)
  shadedLeg(img, 26, 28 + b, 36 - lift[1], 0, 4, SIRKO.fur, SIRKO.white)
  shadedBlob(img, 24, 27 + b, 9.5, 7, SIRKO.fur, { seed: 41, fluff: 1.4 })
  shadedBlob(img, 24, 24 + b, 6.5, 4.5, SIRKO.saddle, { seed: 42, clip: true, bias: 0.15 })
  tri(img, [16, 11 + b], [21, 9 + b], [15, 2 + b], SIRKO.ear)
  tri(img, [32, 11 + b], [27, 9 + b], [33, 2 + b], SIRKO.ear)
  shadedBlob(img, 24, 15 + b, 8, 7.4, SIRKO.fur, { seed: 43, fluff: 1 })
  const band = []
  for (let x = 18; x <= 29; x++) band.push([x, 21 + b])
  collarBand(img, band)
  // Хвіст-бублик над крижами: біла спідня сторона видно на сірій спині.
  plume(img, [[24 + tail, 33 + b], [24 + tail * 2, 29 + b], [25 + tail * 3, 26 + b], [27 + tail * 4, 23 + b], [29 + tail * 5, 21 + b]], 90, 0.3)
  return img.outline(C.K)
}

function sirkoSit({ tail = 0, tongue = false } = {}) {
  const img = new Img(SIRKO_CELL.w, SIRKO_CELL.h)
  shadow(img, 24, 37.5, 14, 2)
  plume(img, tail ? [[32, 35], [36, 34], [40, 32], [43, 30]] : [[32, 35], [36, 35], [40, 35], [44, 34]], 100)
  shadedBlob(img, 24, 31.5, 10.5, 5.2, SIRKO.fur, { seed: 51, fluff: 1.4 }) // стегна
  shadedBlob(img, 14.5, 35.5, 3, 1.5, SIRKO.white, { seed: 52, strands: false })
  shadedBlob(img, 33.5, 35.5, 3, 1.5, SIRKO.white, { seed: 53, strands: false })
  shadedBlob(img, 24, 24.5, 7, 7, SIRKO.fur, { seed: 54, fluff: 1.2 })
  shadedBlob(img, 24, 25.5, 4.4, 6.2, SIRKO.white, { seed: 55, fluff: 1, bias: 0.12 })
  shadedLeg(img, 19, 25, 36, 0, 4, SIRKO.fur, SIRKO.white)
  shadedLeg(img, 25, 25, 36, 0, 4, SIRKO.fur, SIRKO.white)
  sirkoHead(img, 12, tongue)
  const band = []
  for (let x = 17; x <= 30; x++) band.push([x, 19 + (x > 18 && x < 29 ? 1 : 0)])
  collarBand(img, band, [23, 21])
  return img.outline(C.K)
}

function sirkoSleep(breath) {
  const img = new Img(SIRKO_CELL.w, SIRKO_CELL.h)
  shadow(img, 24, 37.5, 19, 2.2)
  shadedBlob(img, 20, 29.5 - breath * 0.6, 13.5, 6.8 + breath * 0.6, SIRKO.fur, { seed: 61, fluff: 1.5, bias: 0.08 })
  for (let y = 25; y <= 34; y++) img.tint(29, y, '#1f2024', 0.45) // складка між тулубом і головою
  plume(img, [[9, 35], [14, 36], [20, 36], [25, 36], [29, 35.5]], 110)
  shadedBlob(img, 35, 34, 5, 2, SIRKO.white, { seed: 63, strands: false }) // лапи під мордою
  tri(img, [30, 27], [34, 26], [30, 21], SIRKO.ear)
  shadedBlob(img, 35, 29.5, 6.2, 5, SIRKO.fur, { seed: 64, fluff: 0.8 })
  shadedBlob(img, 39.5, 31, 3.6, 2.6, SIRKO.white, { seed: 65, strands: false, bias: 0.1 })
  img.rect(42, 30, 2, 2, SIRKO.nose[0])
  img.set(42, 30, SIRKO.nose[2])
  img.hline(35, 37, 28, SIRKO.eye) // заплющене око
  return img.outline(C.K)
}

/** Ті самі 11 анімацій, що й у Рудька, — рушій вибирає їх за тими ж назвами. */
function sirkoAnims() {
  const walkSide = [
    { legs: [2, -2, -2, 2], tail: 0 },
    { lift: [0, 2, 2, 0], bob: -1, tail: 1 },
    { legs: [-2, 2, 2, -2], tail: 0 },
    { lift: [2, 0, 0, 2], bob: -1, tail: -1 },
  ]
  const walkFB = [{}, { lift: [2, 0], bob: -1 }, {}, { lift: [0, 2], bob: -1 }]
  const flip = (img) => {
    const out = new Img(img.w, img.h)
    out.blit(img, 0, 0, true)
    return out
  }
  const rightIdle = [{ tail: 0 }, { tail: 1 }, { tail: 0 }, { tail: -1 }].map(sirkoSide)
  const rightWalk = walkSide.map(sirkoSide)
  const wag = (i) => (i % 2 ? (i === 1 ? 1 : -1) : 0)
  return [
    ['idle_down', 4, [0, 1, 0, -1].map((tail) => sirkoFront({ tail }))],
    ['idle_up', 4, [0, 1, 0, -1].map((tail) => sirkoBack({ tail }))],
    ['idle_right', 4, rightIdle],
    ['idle_left', 4, rightIdle.map(flip)],
    ['walk_down', 8, walkFB.map((p, i) => sirkoFront({ ...p, tail: wag(i) }))],
    ['walk_up', 8, walkFB.map((p, i) => sirkoBack({ ...p, tail: wag(i) }))],
    ['walk_right', 8, rightWalk],
    ['walk_left', 8, rightWalk.map(flip)],
    ['sit', 4, [{ tail: 0 }, { tail: 1, tongue: true }, { tail: 0, tongue: true }, { tail: 1 }].map(sirkoSit)],
    ['sleep', 1.2, [sirkoSleep(0), sirkoSleep(1)]],
    [
      'happy',
      9,
      [
        { bob: 2, tongue: true },
        { bob: -6, lift: [4, 4], tail: 1, tongue: true },
        { bob: -4, lift: [2, 2], tail: -1, tongue: true },
        { bob: 0, tail: 1, tongue: true },
      ].map(sirkoFront),
    ],
  ]
}

/**
 * Аркуш анімацій (рядки — анімації, стовпчики — кадри) і його опис для рушія.
 * scale — у скільки разів менше показувати в світі (для псів, намальованих дрібнішим пікселем).
 */
function dogSheet(anims, cell, image, scale = 1) {
  const cols = Math.max(...anims.map(([, , f]) => f.length))
  const sheet = new Img(cols * cell.w, anims.length * cell.h)
  const meta = { image, cell, scale, size: { w: sheet.w, h: sheet.h }, anims: {} }
  anims.forEach(([name, fps, frames], row) => {
    frames.forEach((img, i) => sheet.blit(img, i * cell.w, row * cell.h))
    meta.anims[name] = { row, frames: frames.length, fps }
  })
  return { sheet, meta }
}

/* ───────── Атлас ───────── */

function buildSprites(farm, room) {
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
    chest: chest(false),
    chest_open: chest(true),
    pier: pier(),
    boardwalk: boardwalk(),
    deck: deck(),
    post_lantern: postLantern(),
    boat: boat(),
    sailboat: sailboat(),
    ...decoSprites(),
    ...homeSprites(),
    ...farm.sprites,
    ...room.sprites,
    ...decorArt({ Img }),
  }
  for (let l = 1; l <= 3; l++) {
    s[`house_${l}`] = house(l)
    s[`lighthouse_${l}`] = lighthouse(l)
    s[`garden_${l}`] = garden(l)
    s[`workshop_${l}`] = workshop(l)
  }
  return { ...s, ...handmade() }
}

/** Ручні спрайти з public/game/buildings замінюють згенеровані кадри з тими ж назвами. */
function handmade() {
  const out = {}
  if (!existsSync(HANDMADE)) return out
  for (const file of readdirSync(HANDMADE)) {
    if (!file.endsWith('.png')) continue
    const { w, h, bpp, px } = decodePng(readFileSync(join(HANDMADE, file)))
    const img = new Img(w, h)
    for (let i = 0; i < w * h; i++) {
      img.d[i * 4] = px[i * bpp]
      img.d[i * 4 + 1] = px[i * bpp + 1]
      img.d[i * 4 + 2] = px[i * bpp + 2]
      img.d[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255
    }
    out[file.slice(0, -4)] = img
  }
  return out
}

/** Полиці: спрайти за висотою, 1 px проміжку, ширина атласу W. */
function pack(sprites, W = 512) {
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
const farm = farmArt({ Img })
const room = homeArt({ Img, hash })
const sprites = buildSprites(farm, room)
const split = (keep) => Object.fromEntries(Object.entries(sprites).filter(([name]) => keep(name)))
const { atlas, frames } = pack(split((n) => !isInterior(n) && !isDecor(n)))
const interior = pack(split(isInterior), 256)
const decorSheet = pack(split(isDecor), 256)

mkdirSync(OUT_PUBLIC, { recursive: true })
writeFileSync(join(OUT_PUBLIC, 'ground.png'), encodePng(ground))
writeFileSync(join(OUT_PUBLIC, 'foam.png'), encodePng(foam))
writeFileSync(join(OUT_PUBLIC, 'water.png'), encodePng(water))
const home = room.image
const walls = room.walls
writeFileSync(join(OUT_PUBLIC, 'home.png'), encodePng(home))
writeFileSync(join(OUT_PUBLIC, 'sprites.png'), encodePng(atlas))
writeFileSync(join(OUT_PUBLIC, 'home-sprites.png'), encodePng(interior.atlas))
writeFileSync(join(OUT_PUBLIC, 'home-decor.png'), encodePng(decorSheet.atlas))
writeFileSync(OUT_DECOR_ATLAS, JSON.stringify({ size: { w: decorSheet.atlas.w, h: decorSheet.atlas.h }, frames: decorSheet.frames }) + '\n')
console.log(`нові речі для хати: ${decorSheet.atlas.w}×${decorSheet.atlas.h} (${Object.keys(decorSheet.frames).length})`)
// Стіни хати — окремий аркуш: рушій ставить їх вертикально довкола підлоги.
writeFileSync(join(OUT_PUBLIC, 'home-walls.png'), encodePng(walls.image))
const wallsMeta = { size: { w: walls.image.w, h: walls.image.h }, ...walls.rects }
writeFileSync(OUT_HOME_ATLAS, JSON.stringify({ size: { w: interior.atlas.w, h: interior.atlas.h }, frames: interior.frames, walls: wallsMeta }) + '\n')
writeFileSync(OUT_ATLAS, JSON.stringify({ size: { w: atlas.w, h: atlas.h }, frames, walk: walkGrid(t), homeWalk: homeWalkGrid() }) + '\n')
console.log(`ground ${ground.w}×${ground.h}, sprites ${atlas.w}×${atlas.h} (${Object.keys(frames).length} кадрів), хатинка ${interior.atlas.w}×${interior.atlas.h} (${Object.keys(interior.frames).length})`)
// Іконки врожаю й насіння для рюкзака (public/game/items/<id>.png).
const OUT_ITEMS = join(ROOT, 'public/game/items')
for (const [id, img] of Object.entries(farm.items)) writeFileSync(join(OUT_ITEMS, `${id}.png`), encodePng(img))
console.log(`город: ${Object.keys(farm.items).length} іконок, культури ${JSON.stringify(farm.meta)}`)
for (const [name, anims, cell, scale] of [
  ['dog', dogAnims(), DOG_CELL, 1],
  ['sirko', sirkoAnims(), SIRKO_CELL, SIRKO_SCALE],
]) {
  const d = dogSheet(anims, cell, `/game/walk/${name}.png`, scale)
  writeFileSync(join(OUT_PUBLIC, `${name}.png`), encodePng(d.sheet))
  writeFileSync(join(ROOT, `src/game/walk/${name}.json`), JSON.stringify(d.meta, null, 2) + '\n')
  console.log(`${name} ${d.sheet.w}×${d.sheet.h} (${Object.keys(d.meta.anims).length} анімацій, ×${scale})`)
}

// Версія арту: Netlify дозволяє кешувати /game/* тиждень, а координати кадрів їдуть у JS-бандлі.
// Без ?v=<хеш> телефон зі старим sprites.png вирізав би спрайти з чужих місць. Хеш міняється
// лише разом із самими картинками, тож довгий кеш і далі працює.
{
  const h = createHash('sha1')
  const pngs = ['ground', 'foam', 'water', 'home', 'sprites', 'home-sprites', 'home-decor', 'home-walls', 'dog', 'sirko'].map((n) => join(OUT_PUBLIC, `${n}.png`))
  for (const id of Object.keys(farm.items).sort()) pngs.push(join(OUT_ITEMS, `${id}.png`))
  for (const f of pngs) h.update(readFileSync(f))
  const v = h.digest('hex').slice(0, 10)
  writeFileSync(join(ROOT, 'src/game/walk/version.json'), JSON.stringify({ v }) + '\n')
  console.log(`версія арту ${v}`)
}

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
  // Хатинка зсередини на рівнях 1–3 (поруч) з мандрівником біля дверей.
  const rooms = new Img(HOME_MAP.w * 3 + 8, HOME_MAP.h)
  for (const lvl of [1, 2, 3]) {
    const room = new Img(HOME_MAP.w, HOME_MAP.h)
    room.blit(home, 0, 0)
    room.blit(walls.back, FLOOR.x0, 0) // задня стіна «розгорнута» вгору, як у старому 2D
    const inside = homePlacements(lvl).filter((q) => q.layer !== 'wall' || q.wall === 'back')
    inside.push({ s: 'hero_up_0', x: 120, y: 170, layer: 'obj' })
    for (const q of [...inside.filter((q) => q.layer === 'floor'), ...inside.filter((q) => q.layer !== 'floor').sort((a, b) => a.y - b.y)]) {
      const sp = sprites[q.s]
      room.blit(sp, Math.round(q.x - sp.w / 2), Math.round(q.y - sp.h))
    }
    rooms.blit(room, (lvl - 1) * (HOME_MAP.w + 4), 0)
  }
  const rz = new Img(rooms.w * 2, rooms.h * 2)
  for (let y = 0; y < rz.h; y++)
    for (let x = 0; x < rz.w; x++) {
      const si = (Math.floor(y / 2) * rooms.w + Math.floor(x / 2)) * 4
      const oi = (y * rz.w + x) * 4
      for (let k = 0; k < 4; k++) rz.d[oi + k] = rooms.d[si + k]
    }
  writeFileSync(join(dir, 'preview-home.png'), encodePng(rz))
  const big = new Img(atlas.w * 3, atlas.h * 3)
  for (let y = 0; y < big.h; y++)
    for (let x = 0; x < big.w; x++) {
      const si = (Math.floor(y / 3) * atlas.w + Math.floor(x / 3)) * 4
      const oi = (y * big.w + x) * 4
      for (let k = 0; k < 4; k++) big.d[oi + k] = atlas.d[si + k]
    }
  writeFileSync(join(dir, 'atlas-x3.png'), encodePng(big))
  const ia = interior.atlas
  const ibig = new Img(ia.w * 4, ia.h * 4)
  ibig.rect(0, 0, ibig.w, ibig.h, '#3b2a1f')
  for (let y = 0; y < ibig.h; y++)
    for (let x = 0; x < ibig.w; x++) {
      const si = (Math.floor(y / 4) * ia.w + Math.floor(x / 4)) * 4
      if (ia.d[si + 3]) ibig.set(x, y, '#' + [ia.d[si], ia.d[si + 1], ia.d[si + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''))
    }
  writeFileSync(join(dir, 'home-sprites-x4.png'), encodePng(ibig))
  const da = decorSheet.atlas
  const dbig = new Img(da.w * 4, da.h * 4)
  dbig.rect(0, 0, dbig.w, dbig.h, '#3b2a1f')
  for (let y = 0; y < dbig.h; y++)
    for (let x = 0; x < dbig.w; x++) {
      const si = (Math.floor(y / 4) * da.w + Math.floor(x / 4)) * 4
      if (da.d[si + 3]) dbig.set(x, y, '#' + [da.d[si], da.d[si + 1], da.d[si + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''))
    }
  writeFileSync(join(dir, 'home-decor-x4.png'), encodePng(dbig))
  // Город: усі стадії культур і грядки, ×4.
  {
    const names = Object.keys(farm.sprites)
    const cellW = 22
    const cellH = 38
    const perRow = 8
    const sheet = new Img(perRow * cellW, Math.ceil(names.length / perRow) * cellH)
    sheet.rect(0, 0, sheet.w, sheet.h, '#5aa13c')
    names.forEach((n, i) => {
      const sp = farm.sprites[n]
      sheet.blit(sp, (i % perRow) * cellW + Math.floor((cellW - sp.w) / 2), Math.floor(i / perRow) * cellH + cellH - sp.h - 2)
    })
    const items = Object.values(farm.items)
    const strip = new Img(items.length * 24, 24)
    strip.rect(0, 0, strip.w, strip.h, '#e8dcc0')
    items.forEach((it, i) => strip.blit(it, i * 24 + 1, 1))
    for (const [file, img, z] of [['farm-x4.png', sheet, 6], ['farm-items-x4.png', strip, 6]]) {
      const big = new Img(img.w * z, img.h * z)
      for (let y = 0; y < big.h; y++)
        for (let x = 0; x < big.w; x++) {
          const si = (Math.floor(y / z) * img.w + Math.floor(x / z)) * 4
          const oi = (y * big.w + x) * 4
          for (let k = 0; k < 4; k++) big.d[oi + k] = img.d[si + k]
        }
      writeFileSync(join(dir, file), encodePng(big))
    }
  }
  console.log(`прев'ю → ${dir}`)
}
