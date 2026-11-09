/**
 * Підлоги хатинки: шість візерунків × чотири кольори — аркуш home-floors.png (див. src/game/walk/floors.js).
 * Той самий піксель, що й увесь острів: 3–4 тони на матеріал, світло зверху зліва, рівні шви.
 * Кожну підлогу малюємо в координатах кімнати (FLOOR), а потім поверх — спільне світло:
 * тінь від стін, сонячні плями з вікон, тепло від печі й килимок біля дверей.
 */

import { DOOR, FLOOR, HOME_MAP, WINDOWS } from '../src/game/walk/home.js'
import { FLOOR_CELL, FLOOR_COLOR_COUNT, FLOOR_PATTERNS, FLOOR_SHEET } from '../src/game/walk/floors.js'

const { x0: FX0, x1: FX1, y0: FY0, y1: FY1 } = FLOOR

/* ───────── Кольори ───────── */

const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
/** Світліше (f > 0) чи темніше (f < 0) у частках. */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return hexOf(...c.map((v) => (f >= 0 ? v + (255 - v) * f : v * (1 + f))))
}
/** Тони дошки з базового кольору: верхня кромка, тіло, прожилка, сучок. */
const plank = (b, f = 0) => ({ h: shade(b, 0.14 + f), b: shade(b, f), g: shade(b, -0.12 + f), k: shade(b, -0.28 + f) })

/** Дошки: три відтінки на колір + шов. Перший — точно ті, що були в хаті. */
const BOARDS = [
  {
    planks: [
      { h: '#bb8a5e', b: '#9e6d46', g: '#86593a', k: '#6e4a2e' },
      { h: '#b07f55', b: '#93643f', g: '#7c5233', k: '#654229' },
      { h: '#c4945f', b: '#a7764c', g: '#8f633f', k: '#74502f' },
    ],
    seam: '#4e321d',
  },
  { planks: [plank('#d2aa72'), plank('#d2aa72', -0.06), plank('#d2aa72', 0.06)], seam: '#8a6a42' },
  { planks: [plank('#5f3e28'), plank('#5f3e28', -0.08), plank('#5f3e28', 0.08)], seam: '#26170d' },
  { planks: [plank('#4f7fb5'), plank('#4f7fb5', -0.05), plank('#4f7fb5', 0.05)], seam: '#22354f', nails: '#1d2c40' },
]
const HERRING = ['#b0804f', '#e0c896', '#6a4429', '#9a4a32'].map((b) => ({
  tones: [plank(b), plank(b, -0.07), plank(b, 0.07)],
  seam: shade(b, -0.5),
}))
/** Кахлі: дві плитки, шов. */
const CHECKER = [
  { a: '#ece6d8', b: '#2f2a28', grout: '#6f675c' },
  { a: '#efe1c2', b: '#c0623e', grout: '#7a5a44' },
  { a: '#e8e4d0', b: '#4f8a5a', grout: '#5a6650' },
  { a: '#eef1f4', b: '#3d6aa8', grout: '#5c6878' },
]
const HEX = [
  { tones: ['#c06a42', '#b05e38', '#cc7850'], grout: '#ead8bc' },
  { tones: ['#d8c093', '#ccb284', '#e2cca2'], grout: '#8f7a58' },
  { tones: ['#5d8fc6', '#eef1f4', '#4a7ab0'], grout: '#dfe3e6' },
  { tones: ['#8faa7c', '#82a070', '#9cb68a'], grout: '#e6e2cf' },
]
const FLAG = [
  { tones: ['#9a958c', '#8a857c', '#aaa59a', '#918a7e'], grout: '#4f4a43' },
  { tones: ['#c9a979', '#bb9a6a', '#d6b888', '#c2a070'], grout: '#6e5638' },
  { tones: ['#5e6b78', '#55616d', '#6a7784', '#626a70'], grout: '#2c333a' },
  { tones: ['#8f8c84', '#848178', '#9c988e', '#8a877e'], grout: '#46523a', moss: ['#5d7a3a', '#74944a'] },
]
const CLAY = ['#c49a5e', '#e6dcc6', '#a65a3c', '#8f8a80'].map((b) => ({ tones: [b, shade(b, -0.06), shade(b, 0.07)], mark: shade(b, -0.14) }))

/* ───────── Візерунки ───────── */

/** Дошки по 8 px різної довжини, стики вразбіг, прожилки, сучки й цвяхи на кінцях. */
function boards(img, hash, pal) {
  const LENS = [44, 60, 52, 36, 68, 48]
  const { planks, seam } = pal
  for (let row = 0; FY0 + row * 8 < FY1; row++) {
    const y = FY0 + row * 8
    let x = FX0 - ((row * 23) % 44)
    for (let k = 0; x < FX1; k++) {
      const len = LENS[(row * 4 + k) % LENS.length]
      const t = planks[Math.floor(hash(row, k, 7) * planks.length)]
      const grainRow = 2 + Math.floor(hash(row, k, 8) * 4)
      const g0 = 5 + Math.floor(hash(row, k, 9) * (len / 3))
      const g1 = g0 + 6 + Math.floor(hash(row, k, 10) * (len / 3))
      const knot = hash(row, k, 11) < 0.35 ? x + Math.floor(len * 0.65) : -1
      for (let dy = 0; dy < 8; dy++)
        for (let dx = 0; dx < len; dx++) {
          const px = x + dx
          const py = y + dy
          if (px < FX0 || px >= FX1 || py >= FY1) continue
          let c = dy === 0 ? t.h : dy === 7 ? seam : t.b
          if (dx === 0 && dy < 7) c = seam
          else if (dy === grainRow && dx >= g0 && dx < g1) c = t.g
          else if (dy === ((grainRow + 3) % 6) + 1 && dx >= g1 - 4 && dx < g1 + 6) c = t.g
          if (knot >= 0 && dy >= 3 && dy <= 4 && (px === knot || px === knot + 1)) c = t.k
          if ((dx === 2 || dx === len - 3) && dy === 3) c = pal.nails ?? '#3b2a1f'
          img.set(px, py, c)
        }
      x += len
    }
  }
}

/**
 * «Ялинка»: дощечки W×(M·W), лежачі й стоячі по черзі, сходинками по діагоналі.
 * У клітинках W×W одна «нитка» сходинок займає в кожному стовпчику 2M клітинок підряд
 * (M — лежача дощечка, M — стояча), наступна нитка — на 2M нижче. Усі краї рівні, без «драбинок».
 */
function herringbone(img, hash, pal) {
  const W = 4
  const M = 3
  const mod = (a, n) => ((a % n) + n) % n
  for (let y = FY0; y < FY1; y++)
    for (let x = FX0; x < FX1; x++) {
      const cx = Math.floor((x - FX0) / W)
      const cy = Math.floor((y - FY0) / W)
      const lx = (x - FX0) % W
      const ly = (y - FY0) % W
      const tt = cy - cx + M - 1
      const k = Math.floor(tt / (2 * M))
      const r = mod(tt, 2 * M)
      let id
      let c
      if (r < M) {
        // Лежача: n = cy − 2Mk, займає стовпчики n..n+M−1; along — котра клітинка від лівого торця.
        const n = cy - 2 * M * k
        const along = cx - n
        id = [n, k, 0]
        const t = pal.tones[Math.floor(hash(...id, 21) * pal.tones.length)]
        c = ly === 0 ? t.h : ly === W - 1 ? pal.seam : t.b
        if (along === 0 && lx === 0) c = pal.seam
        else if (ly === 2 && ((along === 1 && lx >= 1) || (along === 2 && lx <= 1))) c = t.g // прожилка
      } else {
        // Стояча: n = cx, займає рядки n+1..n+M (+2Mk); along — від верхнього торця.
        const n = cx
        const along = cy - 2 * M * k - (n + 1)
        id = [n, k, 1]
        const t = pal.tones[Math.floor(hash(...id, 21) * pal.tones.length)]
        c = lx === 0 ? t.h : lx === W - 1 ? pal.seam : t.b
        if (along === 0 && ly === 0) c = pal.seam
        else if (lx === 2 && ((along === 1 && ly >= 1) || (along === 2 && ly <= 1))) c = t.g
      }
      img.set(x, y, c)
    }
}

/** Кахлі 14×14 «шахівницею»: шов, світла кромка зверху зліва, темна знизу справа. */
function checker(img, hash, pal) {
  const S = 14
  for (let y = FY0; y < FY1; y++)
    for (let x = FX0; x < FX1; x++) {
      const i = Math.floor((x - FX0) / S)
      const j = Math.floor((y - FY0) / S)
      const lx = (x - FX0) % S
      const ly = (y - FY0) % S
      const base = (i + j) % 2 ? pal.b : pal.a
      let c = base
      if (lx === 0 || ly === 0) c = pal.grout
      else if (lx === 1 || ly === 1) c = shade(base, 0.12)
      else if (lx === S - 1 || ly === S - 1) c = shade(base, -0.12)
      else if (hash(x, y, 31) < 0.04) c = shade(base, -0.06) // ледь помітні цятки глазурі
      img.set(x, y, c)
    }
}

/** Найближчий і другий центри серед точок (для шестикутників і плит). */
function nearest2(points, x, y) {
  let d1 = Infinity
  let d2 = Infinity
  let best = null
  for (const p of points) {
    const d = Math.hypot(x - p.x, y - p.y)
    if (d < d1) {
      d2 = d1
      d1 = d
      best = p
    } else if (d < d2) d2 = d
  }
  return { best, gap: d2 - d1 }
}

/** Точки сітки з невеликим запасом довкола підлоги — щоб краї теж були цілими плитками. */
function lattice(step, rowStep, jitter, hash, seed) {
  const pts = []
  for (let j = -1; FY0 + j * rowStep < FY1 + rowStep; j++)
    for (let i = -1; FX0 + i * step < FX1 + step; i++) {
      const ox = j % 2 ? step / 2 : 0
      pts.push({
        x: FX0 + i * step + ox + (hash(i, j, seed) - 0.5) * jitter,
        y: FY0 + j * rowStep + (hash(i, j, seed + 1) - 0.5) * jitter,
        t: hash(i, j, seed + 2),
        m: hash(i, j, seed + 3),
      })
    }
  return pts
}

/** Сітка для пошуку сусідів: без неї 29 тис. пікселів × сотні центрів. */
function bucketed(points, cell) {
  const map = new Map()
  for (const p of points) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(p)
  }
  return (x, y) => {
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    const out = []
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) out.push(...(map.get(`${cx + i},${cy + j}`) ?? []))
    return out
  }
}

/** Шестикутна плитка (комірки Вороного правильної сітки — це шестикутники). */
function hex(img, hash, pal) {
  const S = 13
  const pts = lattice(S, Math.round(S * 0.866), 0, hash, 41)
  const near = bucketed(pts, S)
  for (let y = FY0; y < FY1; y++)
    for (let x = FX0; x < FX1; x++) {
      const { best, gap } = nearest2(near(x, y), x + 0.5, y + 0.5)
      const base = pal.tones[Math.floor(best.t * pal.tones.length)]
      let c = base
      if (gap < 1.1) c = pal.grout
      else if (gap < 2.2) c = y + 0.5 < best.y ? shade(base, 0.12) : shade(base, -0.1)
      img.set(x, y, c)
    }
}

/** Кам'яні плити: неправильні багатокутники різного тону, широкий шов, світла кромка, цятки. */
function flagstone(img, hash, pal) {
  const S = 22
  const pts = lattice(S, 18, 12, hash, 51)
  const near = bucketed(pts, S)
  for (let y = FY0; y < FY1; y++)
    for (let x = FX0; x < FX1; x++) {
      const { best, gap } = nearest2(near(x, y), x + 0.5, y + 0.5)
      const base = pal.tones[Math.floor(best.t * pal.tones.length)]
      let c = base
      if (gap < 1.6) {
        c = pal.grout
        if (pal.moss && hash(x, y, 53) < 0.45) c = pal.moss[Math.floor(hash(x, y, 54) * 2)]
      } else if (gap < 2.8) c = y + 0.5 < best.y ? shade(base, 0.14) : shade(base, -0.12)
      else {
        const n = hash(x, y, 55)
        if (n < 0.06) c = shade(base, -0.1)
        else if (n > 0.95) c = shade(base, 0.1)
      }
      img.set(x, y, c)
    }
}

/** Глиняна доливка: рівні плями двох тонів (без шуму по пікселю) і сліди віника дугами. */
function clay(img, hash, pal) {
  for (let y = FY0; y < FY1; y++)
    for (let x = FX0; x < FX1; x++) {
      const bx = Math.floor((x - FX0) / 8)
      const by = Math.floor((y - FY0) / 6)
      // Пляма на 8×6 зсунута в кожному рядку — без «сітки».
      const v = hash(bx + (by % 2) * 0.5, by, 61)
      let c = v < 0.2 ? pal.tones[1] : v > 0.85 ? pal.tones[2] : pal.tones[0]
      // Дуги від віника: кожні ~10 px, хвилясті.
      const wave = (y - FY0 + Math.round(Math.sin((x - FX0) / 9 + Math.floor((y - FY0) / 10)) * 2)) % 10
      if (wave === 0 && hash(Math.floor(x / 12), Math.floor(y / 10), 62) < 0.55) c = pal.mark
      img.set(x, y, c)
    }
  // Підведена вздовж стін смуга — як білили «призьбу» в хаті.
  const edge = shade(pal.tones[0], -0.18)
  img.hline(FX0, FX1 - 1, FY0 + 3, edge)
  img.vline(FX0 + 3, FY0 + 3, FY1 - 1, edge)
  img.vline(FX1 - 4, FY0 + 3, FY1 - 1, edge)
}

const PAINTERS = { boards: [boards, BOARDS], herringbone: [herringbone, HERRING], checker: [checker, CHECKER], hex: [hex, HEX], flagstone: [flagstone, FLAG], clay: [clay, CLAY] }

/* ───────── Світло ───────── */

const DOORMAT = [
  '.rrrrrrrrrrrrrrrrrrrrrr.',
  'rRRRRRRRRRRRRRRRRRRRRRRr',
  'rRyRRgRRyRRgRRyRRgRRyRRr',
  'rRRRRRRRRRRRRRRRRRRRRRRr',
  'rRgRRyRRgRRyRRgRRyRRgRRr',
  'rRRRRRRRRRRRRRRRRRRRRRRr',
  '.rrrrrrrrrrrrrrrrrrrrrr.',
  'f.f.f.f.f.f.f.f.f.f.f.f.',
]
const DOORMAT_PAL = { r: '#8e2a1f', R: '#c8372d', y: '#ffd23c', g: '#2f6fd0', f: '#e6dbc4' }

/** Тіні від стін, сонце з вікон, тепло печі, килимок біля дверей — поверх будь-якої підлоги. */
export function floorLight(img) {
  for (const [y, a] of [[FY0, 0.32], [FY0 + 1, 0.2], [FY0 + 2, 0.1]]) img.hline(FX0, FX1 - 1, y, '#1a0e06', a)
  for (const [dx, a] of [[0, 0.24], [1, 0.12]]) {
    img.vline(FX0 + dx, FY0, FY1 - 1, '#1a0e06', a)
    img.vline(FX1 - 1 - dx, FY0, FY1 - 1, '#1a0e06', a)
  }
  for (const win of WINDOWS)
    for (let y = FY0 + 2; y < FY0 + 40; y++) {
      const shift = Math.round((y - FY0) * 0.5)
      for (let x = win.x0 + 3 + shift; x < win.x1 - 3 + shift; x++) {
        const edge = x === win.x0 + 3 + shift || x === win.x1 - 4 + shift
        img.set(x, y, '#ffe9b0', edge ? 0.08 : 0.16)
      }
    }
  for (let y = 100; y < 140; y++)
    for (let x = 160; x < 232; x++) {
      const d = ((x - 196) / 34) ** 2 + ((y - 116) / 16) ** 2
      if (d < 0.45) img.set(x, y, '#ffb050', 0.12)
      else if (d < 1) img.set(x, y, '#ffb050', 0.06)
    }
  img.rows(DOORMAT, DOOR.x0 - 2 + ((DOOR.x1 - DOOR.x0 + 4 - 24) >> 1), FY1 - 9, DOORMAT_PAL)
}

/** Намалювати підлогу { p, c } у кімнату (координати HOME_MAP), без світла. */
export function drawFloor(img, hash, p, c) {
  const [paint, pals] = PAINTERS[p]
  paint(img, hash, pals[c])
}

/** Аркуш home-floors.png: рядок — візерунок, стовпчик — колір; кожна клітинка вже зі світлом. */
export function floorSheet({ Img, hash }) {
  const sheet = new Img(FLOOR_SHEET.w, FLOOR_SHEET.h)
  FLOOR_PATTERNS.forEach((p, row) => {
    for (let c = 0; c < FLOOR_COLOR_COUNT; c++) {
      const room = new Img(HOME_MAP.w, HOME_MAP.h)
      drawFloor(room, hash, p, c)
      floorLight(room)
      for (let y = 0; y < FLOOR_CELL.h; y++) {
        const si = ((FY0 + y) * room.w + FX0) * 4
        const di = ((row * FLOOR_CELL.h + y) * sheet.w + c * FLOOR_CELL.w) * 4
        sheet.d.set(room.d.subarray(si, si + FLOOR_CELL.w * 4), di)
      }
    }
  })
  return sheet
}
