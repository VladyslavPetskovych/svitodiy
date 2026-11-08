/**
 * Город: культури за стадіями росту, грядки, бур'ян, комора городника, дощувач, лежанка для псів,
 * а також іконки врожаю й пакетики насіння для рюкзака.
 *
 * Усе намальовано вдвічі дрібнішим пікселем (як Сірко) і показується в масштабі 0.5 (img.k):
 * грядка 16×16 у світі — це 32×32 тут, тож видно жилки на листках, насінинки на полуниці,
 * ребра гарбуза й спіраль соняшника. Світло — зверху зліва, 5–7 тонів, впорядкований дизер.
 *
 * Модуль не має власного полотна — генератор (gen-island-art.mjs) передає свої Img і шум.
 */

import { CROPS } from '../../telegram-bot/src/data/crops.js'

const LIGHT = [-0.55, -0.83]
/** Скільки стадій росту — з тих самих даних, що й сервер. */
const STAGES = Object.fromEntries(CROPS.map((c) => [c.id, c.stages]))

/* ───────── Палітри ───────── */

const P = {
  dirt: ['#2e1c10', '#432a17', '#5a3a20', '#6e4a2a', '#83593a', '#9a6c46', '#b08052'],
  wet: ['#1c120a', '#26180d', '#321f11', '#3f2816', '#4d321c', '#5c3d23'],
  leaf: ['#123018', '#173d1f', '#1f5528', '#2a6e2f', '#3b8a36', '#55a63f', '#78c24f', '#a3dc6a'],
  frond: ['#173f1a', '#1f5522', '#2a6a2a', '#3f8a34', '#5aa83e', '#80c64e', '#a8e06a'],
  beetLeaf: ['#16281a', '#1a3418', '#244a22', '#30602c', '#427838', '#5a9446', '#7cb05a'],
  cabbage: ['#173226', '#1f3f2e', '#2b5a3c', '#3a7449', '#4f9056', '#6aab64', '#8ec47a', '#b8dc9c'],
  cabHead: ['#2c5228', '#3c6a32', '#58893f', '#78a64e', '#9cc264', '#c0dc86', '#e2f0b8'],
  pumpLeaf: ['#132c10', '#1a3a16', '#244e1e', '#306628', '#408034', '#549a40', '#6eb24e', '#8ccc66'],
  stem: ['#1f3a14', '#2c5a22', '#3f7a2c', '#5d9a3a', '#7cb44a'],
  redStalk: ['#4a0e22', '#7a2333', '#a8384a', '#cf5c6c'],
  beetStalk: ['#3a0820', '#5a0f2c', '#86204a', '#b0386a'],
  radish: ['#3a0812', '#4a0a18', '#7a1428', '#ad2238', '#d63d50', '#f2707a', '#ffb0b0'],
  carrot: ['#4a1a06', '#5e2208', '#8f3a0e', '#c45812', '#e87b20', '#ffa748', '#ffd08a'],
  beet: ['#1a0412', '#26061a', '#45102e', '#6a1a46', '#912a62', '#b84a86', '#de80b0'],
  tomato: ['#3a0806', '#4a0a08', '#7c1610', '#b02818', '#dc4428', '#f87650', '#ffc0a0'],
  tomatoGreen: ['#1e360c', '#2a4a12', '#3e6a1a', '#5a8c26', '#7cae3a', '#a8d060'],
  berry: ['#3a0610', '#4a0810', '#7a1220', '#b01e30', '#e03848', '#ff7080', '#ffc0c8'],
  petal: ['#7a4a06', '#b87810', '#e8a91a', '#ffd23c', '#fff08a'],
  disc: ['#160b04', '#1e1006', '#33200c', '#4e3214', '#6e4a1e', '#8e6a2e'],
  pumpkin: ['#3a1403', '#4a1a04', '#7a2e08', '#ad480e', '#d86818', '#f28c2c', '#ffb860'],
  pumpGreen: ['#18300a', '#24400e', '#365a14', '#4c781e', '#68962c', '#8cb446'],
  flowerY: ['#8a5a08', '#c48a10', '#f0b81e', '#ffd23c', '#fff0a0'],
  white: ['#9c9a90', '#c8c4b8', '#e6e2d6', '#fbfaf6'],
  wood: ['#3a2210', '#4a2c16', '#6e4424', '#93653a', '#b88a58', '#d8ae7c'],
  burlap: ['#5a4424', '#7a5e34', '#9a7a48', '#b8985e', '#d4b67c'],
  paper: ['#7a5a2e', '#a68250', '#cca872', '#e8cf9c', '#f8ebc8'],
  wicker: ['#4a2e12', '#6e461c', '#93622a', '#b8823c', '#d8a456'],
  blanket: ['#5a1210', '#8a1e1a', '#b8322a', '#d9493a', '#f07a62'],
  brass: ['#5a3e10', '#8a6418', '#c2922a', '#ffd860'],
}
const INK = '#14100a'
const PLANT_INK = '#0e1c0c'

/**
 * @param {{ Img: any, hash: (x:number,y:number,s:number)=>number, bayer: (x:number,y:number)=>number,
 *   clamp01: (v:number)=>number }} h
 */
export function farmArt({ Img, hash, bayer, clamp01 }) {
  /** Тон рампи з дизером: v 0…1 → колір. */
  const tone = (ramp, v, x, y) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(clamp01(v) * (ramp.length - 1) + bayer(x, y) - 0.25)))]

  /** Новий кадр дрібного пікселя (показується вдвічі меншим). */
  const fine = (w, h) => {
    const img = new Img(w, h)
    img.k = 0.5
    return img
  }

  /* ───────── Примітиви ───────── */

  /** Затінена куля/еліпсоїд: світло зверху зліва, блік, легка рефлексія знизу. */
  function ball(img, cx, cy, rx, ry, ramp, { spec = true, clipBelow = Infinity, bias = 0 } = {}) {
    const n = ramp.length
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      if (y > clipBelow) continue
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        const r = dx * dx + dy * dy
        if (r > 1) continue
        const nz = Math.sqrt(1 - r)
        let lum = (dx * LIGHT[0] + dy * LIGHT[1]) * 0.45 + nz * 0.55 + bias
        if (dy > 0.55 && r > 0.6) lum += 0.12 // відбите світло від землі
        img.set(x, y, ramp[Math.max(0, Math.min(n - 1, Math.floor(clamp01(lum) * (n - 1) + bayer(x, y) - 0.3)))])
      }
    }
    if (spec) {
      const sx = Math.round(cx - rx * 0.42)
      const sy = Math.round(cy - ry * 0.48)
      img.set(sx, sy, ramp[n - 1])
      if (rx > 3.5) {
        img.set(sx + 1, sy, ramp[n - 1])
        img.set(sx, sy + 1, ramp[n - 2])
      }
    }
  }

  /**
   * Листок уздовж напрямку ang (радіани, −π/2 — угору): ширшає біля основи, жилка посередині,
   * бічні жилки «ялинкою», краї темніші, бік до світла — світліший.
   * round — наскільки круглий кінчик (менше — кругліше), serr — зубчики по краю, curl — загин.
   */
  function leaf(img, x0, y0, ang, len, wid, pal, o = {}) {
    const { curl = 0, round = 0.75, serr = 0, rib = 'auto', veins = len >= 7, bias = 0 } = o
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    const nx = -dy
    const ny = dx
    const R = len + wid + 2
    const n = pal.length
    for (let y = Math.floor(y0 - R); y <= Math.ceil(y0 + R); y++)
      for (let x = Math.floor(x0 - R); x <= Math.ceil(x0 + R); x++) {
        const px = x + 0.5 - x0
        const py = y + 0.5 - y0
        const u = (px * dx + py * dy) / len
        if (u < 0 || u > 1) continue
        const v = px * nx + py * ny - curl * u * u * len
        let half = wid * Math.pow(Math.sin(Math.PI * Math.pow(u, round)), 0.8)
        if (serr && u > 0.12 && Math.floor(u * len * 0.9) % 2) half -= serr
        const av = Math.abs(v)
        if (av > half) continue
        const t = av / Math.max(0.6, half)
        const side = v >= 0 ? 1 : -1
        const face = side * (nx * LIGHT[0] + ny * LIGHT[1])
        let lum = 0.5 + face * 0.2 + (1 - t) * 0.14 - u * 0.12 + bias
        if (t > 0.8) lum -= 0.14
        if (veins && u > 0.1 && t < 0.86) {
          const w = u * len - av * 0.85
          if (((w % 3.1) + 3.1) % 3.1 < 0.55) lum -= 0.13
        }
        if (rib && av < 0.55 && u < 0.9) {
          img.set(x, y, rib === 'auto' ? pal[Math.min(n - 1, Math.max(2, Math.round(n * 0.75)))] : rib)
          continue
        }
        img.set(x, y, tone(pal, lum, x, y))
      }
    return [x0 + dx * len, y0 + dy * len]
  }

  /** Стебло-ламана товщиною w: лівий край освітлений, правий — у тіні. */
  function stem(img, pts, pal, w = 1) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k]
      const [bx, by] = pts[k + 1]
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2))
      for (let s = 0; s <= steps; s++) {
        const x = ax + ((bx - ax) * s) / steps
        const y = ay + ((by - ay) * s) / steps
        for (let i = 0; i < w; i++) {
          const c = w === 1 ? pal[2] : i === 0 ? pal[pal.length - 1] : i === w - 1 ? pal[0] : pal[Math.min(pal.length - 2, 2)]
          img.set(Math.round(x) + i - Math.floor(w / 2), Math.round(y), c)
        }
      }
    }
  }

  /** Листок на черешку: черешок довжиною stalk, далі пластинка. */
  function stalkLeaf(img, x, y, ang, stalk, len, wid, pal, stalkPal, o = {}) {
    const ex = x + Math.cos(ang) * stalk
    const ey = y + Math.sin(ang) * stalk
    stem(img, [[x, y], [ex, ey]], stalkPal, 1)
    return leaf(img, ex, ey, ang + (o.bend ?? 0), len, wid, pal, o)
  }

  /** Горбик землі (з насінинками на нульовій стадії). */
  function mound(img, cx, by, { seeds = null, rx = 6.5 } = {}) {
    ball(img, cx, by - 1.2, rx, 2.6, P.dirt, { spec: false, bias: 0.05 })
    for (let i = -rx + 1; i < rx - 1; i += 2) if (hash(cx + i, by, 31) < 0.4) img.set(cx + i, by - 2, P.dirt[6])
    if (seeds) {
      for (const [sx, sy] of [[-3, -2], [0, -3], [3, -2], [1, -1]]) {
        img.set(cx + sx, by + sy, seeds[0])
        img.set(cx + sx + 1, by + sy, seeds[1])
        img.set(cx + sx, by + sy - 1, seeds[2] ?? seeds[1])
      }
    }
  }

  /** Земля спереду, що прикриває низ коренеплоду. */
  function soilFront(img, cx, by, rx = 7) {
    ball(img, cx, by + 0.5, rx, 2, P.dirt, { spec: false, bias: 0.1 })
    img.set(cx - 2, by - 1, P.dirt[5])
    img.set(cx + 3, by, P.dirt[2])
  }

  /** Пір'ястий листок моркви: тонкий стрижень і дрібні часточки по черзі. */
  function frond(img, x, y, ang, len, pal, curl = 0) {
    const pts = []
    for (let i = 0; i <= len; i++) {
      const a = ang + curl * (i / len)
      const prev = pts[i - 1] ?? [x, y]
      pts.push(i ? [prev[0] + Math.cos(a), prev[1] + Math.sin(a)] : [x, y])
    }
    stem(img, pts, P.stem, 1)
    for (let i = 3; i < len; i += 2) {
      const [px, py] = pts[i]
      const a = ang + curl * (i / len)
      const side = (i >> 1) % 2 ? 1 : -1
      const sz = 2.2 + (1 - i / len) * 1.4
      leaf(img, px, py, a + side * 0.95, sz, 1.05, pal, { rib: null, veins: false, bias: 0.05 })
    }
    const [tx, ty] = pts[len]
    leaf(img, tx, ty, ang + curl, 2.6, 1.1, pal, { rib: null, veins: false, bias: 0.1 })
  }

  /** Трійчастий лист полуниці: три круглі зубчасті листочки. */
  function trifoliate(img, x, y, ang, stalk, size, pal) {
    const ex = x + Math.cos(ang) * stalk
    const ey = y + Math.sin(ang) * stalk
    stem(img, [[x, y], [ex, ey]], P.stem, 1)
    for (const d of [-0.75, 0.75, 0]) leaf(img, ex, ey, ang + d, size, size * 0.62, pal, { round: 0.6, serr: 0.5, bias: d ? -0.03 : 0.04 })
  }

  /** П'ятипелюсткова квітка (полуниця, помідор). */
  function flower(img, cx, cy, r, petals, center) {
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k / 5) * Math.PI * 2
      ball(img, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85, r * 0.75, r * 0.7, petals, { spec: false })
    }
    img.set(Math.round(cx), Math.round(cy), center[1])
    img.set(Math.round(cx) - 1, Math.round(cy), center[0])
    img.set(Math.round(cx), Math.round(cy) - 1, center[2] ?? center[1])
  }

  /** Зірочка-чашолистик (помідор, полуниця). */
  function calyx(img, cx, cy, r, pal) {
    for (const a of [-2.6, -1.9, -1.2, -0.5, 0.2]) leaf(img, cx, cy, a, r, 0.9, pal, { rib: null, veins: false, bias: 0.05 })
  }

  /** Ягода полуниці: «сердечко», що звужується донизу, з жовтими насінинками. */
  function berry(img, cx, cy, s, ramp) {
    const h = s * 2.6
    for (let y = Math.floor(cy - h * 0.45); y <= Math.ceil(cy + h * 0.6); y++) {
      const t = (y + 0.5 - (cy - h * 0.45)) / h
      if (t < 0 || t > 1) continue
      const half = s * (t < 0.3 ? 0.8 + t * 0.7 : 1.01 - (t - 0.3) * 1.25) * 1.05
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const dx = (x + 0.5 - cx) / Math.max(0.6, half)
        if (Math.abs(dx) > 1) continue
        const lum = 0.62 - dx * 0.28 - t * 0.35 + (1 - Math.abs(dx)) * 0.15
        img.set(x, y, tone(ramp, lum, x, y))
      }
    }
    for (let y = Math.ceil(cy - h * 0.3); y < cy + h * 0.5; y += 2)
      for (let x = Math.ceil(cx - s * 0.8) + (y % 4 ? 1 : 0); x < cx + s * 0.8; x += 2) if (img.alpha(x, y)) img.set(x, y, '#ffe680')
    img.set(Math.round(cx - s * 0.4), Math.round(cy - h * 0.2), ramp[ramp.length - 1])
  }

  /** Гарбуз: сегменти-ребра, що сходяться до верху й низу, плодоніжка. */
  function pumpkinBody(img, cx, cy, rx, ry, ramp) {
    const seg = rx / 2.4
    for (const k of [-2, 2, -1, 1, 0]) ball(img, cx + k * seg * 0.95, cy, seg * 1.35, ry, ramp, { spec: k === 0, bias: k === 0 ? 0.08 : -Math.abs(k) * 0.04 })
    for (const b of [-1.5, -0.5, 0.5, 1.5])
      for (let y = Math.ceil(cy - ry + 1); y < cy + ry - 1; y++) {
        const q = 1 - ((y + 0.5 - cy) / ry) ** 2
        const x = Math.round(cx + b * seg * 0.95 * Math.sqrt(Math.max(0, q)) * 1.1)
        if (img.alpha(x, y)) img.set(x, y, ramp[2])
      }
  }

  /** Насінинки соняшника: спіраль Фібоначчі на диску. */
  function sunDisc(img, cx, cy, rx, ry) {
    ball(img, cx, cy, rx, ry, P.disc, { spec: false, bias: 0.05 })
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < 46; i++) {
      const r = Math.sqrt(i / 46)
      const a = i * golden
      const x = Math.round(cx + Math.cos(a) * r * (rx - 0.8))
      const y = Math.round(cy + Math.sin(a) * r * (ry - 0.8))
      img.set(x, y, i % 3 ? P.disc[4] : P.disc[5])
    }
  }

  /* ───────── Культури: кадр на стадію (0 — насіння в землі … stages — урожай) ───────── */

  /** Каркас кадру: ширина/висота, основа рослини за 4 px від низу. */
  function frames(w, h, stages, draw) {
    return Array.from({ length: stages + 1 }, (_, s) => {
      const img = fine(w, h)
      const by = h - 4
      const cx = Math.floor(w / 2)
      draw(img, s, cx, by)
      return img.outline(PLANT_INK, 0.85)
    })
  }

  const sprout = (img, cx, by, pal = P.leaf, size = 5) => {
    stem(img, [[cx, by], [cx, by - 4]], P.stem, 1)
    leaf(img, cx, by - 4, -2.55, size, 2.3, pal, { round: 0.55, veins: false })
    leaf(img, cx, by - 4, -0.6, size, 2.3, pal, { round: 0.55, veins: false })
  }

  const CROP_DRAW = {
    radish: { w: 32, h: 30, seeds: ['#5a2a1e', '#7a3c2a', '#9a5a40'], draw(img, s, cx, by) {
      if (s === 1) return sprout(img, cx, by, P.leaf, 4.5)
      const big = s === 3
      const angs = big ? [-2.8, -2.25, -1.62, -1.0, -0.38] : [-2.6, -1.95, -1.15, -0.5]
      for (const a of angs) stalkLeaf(img, cx, by - (big ? 6 : 2), a, big ? 4 : 2, big ? 9.5 : 7, big ? 3.2 : 2.5, P.leaf, P.redStalk, { round: 0.62, serr: big ? 0.4 : 0 })
      if (big) {
        ball(img, cx, by - 3.5, 5.5, 5, P.radish)
        img.set(cx - 2, by - 6, P.radish[6])
        soilFront(img, cx, by + 1, 7)
      } else {
        ball(img, cx, by - 1, 3, 2.2, P.radish)
        soilFront(img, cx, by + 1, 5)
      }
    } },
    carrot: { w: 32, h: 36, seeds: ['#4a3a20', '#6a5430', '#8a7444'], draw(img, s, cx, by) {
      if (s === 1) {
        frond(img, cx, by, -2.0, 6, P.frond, -0.2)
        frond(img, cx, by, -1.1, 6, P.frond, 0.2)
        return
      }
      const sets = {
        2: [[-2.1, 9, -0.2], [-1.57, 10, 0], [-1.0, 9, 0.2]],
        3: [[-2.5, 12, -0.3], [-2.0, 13, -0.15], [-1.57, 14, 0], [-1.15, 13, 0.15], [-0.65, 12, 0.3]],
        4: [[-2.75, 14, -0.35], [-2.3, 16, -0.2], [-1.9, 17, -0.1], [-1.5, 18, 0], [-1.15, 17, 0.1], [-0.8, 16, 0.2], [-0.4, 14, 0.35]],
      }[s]
      for (const [a, l, c] of sets) frond(img, cx, by - 2, a, l, P.frond, c)
      if (s >= 3) {
        const r = s === 4 ? 3.8 : 2.6
        ball(img, cx, by - 1.5, r, r * 0.75, P.carrot)
        for (let x = -r + 1; x < r - 1; x += 1) if (hash(x, s, 7) < 0.5) img.set(cx + x, by - 1, P.carrot[2])
        soilFront(img, cx, by + 1, r + 3)
      }
    } },
    beet: { w: 32, h: 34, seeds: ['#3a1a1a', '#5a2a2a', '#7a3e3a'], draw(img, s, cx, by) {
      if (s === 1) {
        stem(img, [[cx, by], [cx, by - 4]], P.beetStalk, 1)
        leaf(img, cx, by - 4, -2.5, 5, 2.2, P.beetLeaf, { round: 0.6, rib: '#b0304f', veins: false })
        leaf(img, cx, by - 4, -0.65, 5, 2.2, P.beetLeaf, { round: 0.6, rib: '#b0304f', veins: false })
        return
      }
      const cfg = { 2: [[-2.4, -1.57, -0.75], 3, 7, 2.8], 3: [[-2.6, -2.0, -1.2, -0.55], 4, 10, 4], 4: [[-2.75, -2.2, -1.6, -1.0, -0.4], 5, 12, 4.6] }[s]
      for (const a of cfg[0]) stalkLeaf(img, cx, by - 3, a, cfg[1], cfg[2], cfg[3], P.beetLeaf, P.beetStalk, { round: 0.65, rib: '#b0304f', curl: a < -1.57 ? -0.08 : 0.08 })
      if (s >= 3) {
        const r = s === 4 ? 6 : 3.2
        ball(img, cx, by - (s === 4 ? 3 : 1), r, r * 0.92, P.beet)
        if (s === 4) {
          img.hline(cx - 3, cx + 2, by - 1, P.beet[2])
          img.set(cx + 1, by + 2, P.beet[1])
        }
        soilFront(img, cx, by + 1.5, r + 2)
      }
    } },
    tomato: { w: 34, h: 58, seeds: ['#a88a50', '#c8a868', '#e0c888'], draw(img, s, cx, by) {
      if (s === 1) {
        sprout(img, cx, by, P.leaf, 4.5)
        leaf(img, cx, by - 4, -1.57, 3.5, 1.6, P.leaf, { round: 0.7, serr: 0.3, veins: false })
        return
      }
      const sx = cx + 4
      const top = { 2: 18, 3: 30, 4: 42, 5: 42 }[s]
      // Кілочок і шпагат.
      for (let y = by + 1; y >= by - 46; y--) {
        img.set(sx, y, P.wood[4])
        img.set(sx + 1, y, P.wood[3])
        img.set(sx + 2, y, P.wood[1])
      }
      img.set(sx + 1, by - 47, P.wood[5])
      // Стебло в'ється довкола кілочка.
      const pts = []
      for (let y = 0; y <= top; y += 3) pts.push([cx + Math.round(Math.sin(y * 0.35) * 2.2), by - y])
      stem(img, pts, P.stem, 2)
      for (let y = 8; y < top; y += 10) img.hline(sx - 2, sx + 2, by - y, '#e8d8a8')
      // Складні листки: черешок + три зубчасті листочки.
      const leaves = []
      for (let y = 5; y < top - 2; y += 6) leaves.push([by - y, leaves.length % 2 ? 1 : -1])
      for (const [ly, side] of leaves) {
        const a = side > 0 ? -0.45 : -2.7
        const lx = cx + Math.round(Math.sin((by - ly) * 0.35) * 2.2)
        const [ex, ey] = [lx + Math.cos(a) * 5, ly + Math.sin(a) * 5]
        stem(img, [[lx, ly], [ex, ey]], P.stem, 1)
        leaf(img, ex, ey, a, 6, 2.4, P.leaf, { serr: 0.5, round: 0.7 })
        leaf(img, lx + Math.cos(a) * 2.5, ly + Math.sin(a) * 2.5, a - side * 0.9, 4, 1.8, P.leaf, { serr: 0.4, veins: false })
      }
      leaf(img, pts.at(-1)[0], pts.at(-1)[1], -1.57, 5, 2.4, P.leaf, { serr: 0.5 })
      if (s === 4) for (const [fx, fy] of [[cx - 6, by - 26], [cx + 7, by - 33], [cx - 4, by - 38]]) flower(img, fx, fy, 1.6, P.flowerY, ['#c46a08', '#e8a010'])
      if (s === 5) {
        const fruit = [[cx - 7, by - 22, P.tomato], [cx - 3, by - 27, P.tomato], [cx + 8, by - 30, P.tomato], [cx + 5, by - 18, P.tomato], [cx - 6, by - 36, P.tomatoGreen]]
        for (const [fx, fy, ramp] of fruit) {
          ball(img, fx, fy, 3.6, 3.3, ramp)
          calyx(img, fx, fy - 3, 2.2, P.leaf)
        }
      }
    } },
    cabbage: { w: 34, h: 34, seeds: ['#3a2a20', '#54402e', '#6e5640'], draw(img, s, cx, by) {
      if (s === 1) return sprout(img, cx, by, P.cabbage, 4.6)
      const n = { 2: 4, 3: 5, 4: 6, 5: 7 }[s]
      const len = { 2: 6, 3: 9, 4: 11, 5: 13 }[s]
      const wid = { 2: 3.6, 3: 4.8, 4: 5.6, 5: 6.4 }[s]
      for (let i = 0; i < n; i++) {
        const a = -Math.PI + 0.25 + (i / (n - 1)) * (Math.PI - 0.5)
        leaf(img, cx, by - 3, a, len, wid, P.cabbage, { round: 0.55, rib: P.cabbage[6], curl: (a + 1.57) * 0.12, bias: -0.04 })
      }
      if (s >= 3) {
        const r = { 3: 3.2, 4: 6, 5: 8.5 }[s]
        ball(img, cx, by - r * 0.8 - 1, r, r * 0.85, P.cabHead, { bias: 0.04 })
        // Листки, що обгортають качан.
        for (let k = 1; k <= (s === 5 ? 3 : 1); k++) {
          const rr = r * (1 - k * 0.22)
          for (let a = -2.6; a < -0.5; a += 0.12) {
            const x = Math.round(cx + Math.cos(a) * rr * (k % 2 ? 1 : -1) * 0.9)
            const y = Math.round(by - r * 0.8 - 1 + Math.sin(a) * rr * 0.75)
            if (img.alpha(x, y)) img.set(x, y, P.cabHead[2])
          }
        }
        if (s === 5) {
          leaf(img, cx - 2, by - 1, -2.15, 12, 5.5, P.cabbage, { round: 0.6, rib: P.cabbage[6], bias: 0.02 })
          leaf(img, cx + 2, by - 1, -0.95, 12, 5.5, P.cabbage, { round: 0.6, rib: P.cabbage[6], bias: 0.02 })
        }
      }
    } },
    strawberry: { w: 32, h: 30, seeds: ['#a83a2a', '#c85a3e', '#e88a60'], draw(img, s, cx, by) {
      if (s === 1) return sprout(img, cx, by, P.leaf, 4)
      const angs = s === 2 ? [-2.4, -1.57, -0.75] : [-2.75, -2.15, -1.57, -1.0, -0.4]
      const st = s === 2 ? 5 : 6
      for (const a of angs) trifoliate(img, cx, by - 1, a, st, s === 2 ? 4.8 : 5, P.leaf)
      if (s === 3) for (const [fx, fy] of [[cx - 9, by - 4], [cx + 9, by - 6], [cx + 2, by - 15]]) flower(img, fx, fy, 1.8, P.white, ['#c89a10', '#f2c12e', '#ffe680'])
      if (s === 4) {
        for (const [fx, fy, ramp] of [[cx - 9, by - 2, P.berry], [cx - 4, by + 0, P.berry], [cx + 6, by - 1, P.berry], [cx + 10, by - 5, P.berry], [cx + 1, by - 13, P.tomatoGreen]]) {
          stem(img, [[cx, by - 4], [fx, fy - 3]], P.stem, 1)
          berry(img, fx, fy, 2.4, ramp)
          calyx(img, fx, fy - 3, 1.8, P.leaf)
        }
      }
    } },
    sunflower: { w: 34, h: 78, seeds: ['#2a2420', '#e8e0d0', '#4a3e34'], draw(img, s, cx, by) {
      if (s === 1) return sprout(img, cx, by, P.leaf, 5.5)
      const height = { 2: 14, 3: 30, 4: 46, 5: 54 }[s]
      const pts = []
      for (let y = 0; y <= height; y += 4) pts.push([cx + Math.round(Math.sin(y * 0.08) * 1.2), by - y])
      stem(img, pts, P.stem, 3)
      // Ворсинки на стеблі.
      for (let y = 4; y < height; y += 5) img.set(cx - 2, by - y, P.stem[4])
      let side = -1
      for (let y = 6; y < height - 4; y += 8) {
        const a = side < 0 ? -2.7 : -0.45
        const size = 7 + Math.min(5, (height - y) / 8)
        stalkLeaf(img, cx + Math.round(Math.sin(y * 0.08) * 1.2), by - y, a, 2, size, size * 0.52, P.leaf, P.stem, { round: 0.65, serr: 0.35, curl: side * 0.1 })
        side = -side
      }
      const [tx, ty] = pts.at(-1)
      if (s <= 3) {
        // Молода верхівка: пара листочків, що тільки розгортаються.
        leaf(img, tx, ty, -2.2, 6, 2.8, P.leaf, { round: 0.6, serr: 0.3, bias: 0.06 })
        leaf(img, tx, ty, -0.9, 6, 2.8, P.leaf, { round: 0.6, serr: 0.3, bias: 0.06 })
      }
      if (s === 4) {
        ball(img, tx, ty - 3, 4.5, 4, P.pumpGreen)
        for (const a of [-2.8, -2.2, -1.57, -0.95, -0.35]) leaf(img, tx, ty - 3, a, 5, 1.1, P.leaf, { rib: null, veins: false })
      }
      if (s === 5) {
        const hx = tx
        const hy = ty - 9
        for (let k = 0; k < 18; k++) {
          const a = (k / 18) * Math.PI * 2
          leaf(img, hx + Math.cos(a) * 4.5, hy + Math.sin(a) * 4, a, 6.5, 1.8, P.petal, { rib: P.petal[4], veins: false, round: 0.55, bias: Math.sin(a) < 0 ? 0.1 : -0.05 })
        }
        for (let k = 0; k < 18; k++) {
          const a = ((k + 0.5) / 18) * Math.PI * 2
          leaf(img, hx + Math.cos(a) * 4, hy + Math.sin(a) * 3.6, a, 5, 1.5, P.petal, { rib: null, veins: false, bias: -0.15 })
        }
        sunDisc(img, hx, hy, 6.2, 5.6)
      }
    } },
    pumpkin: { w: 40, h: 40, seeds: ['#d8c890', '#f0e4b4', '#b8a870'], draw(img, s, cx, by) {
      if (s === 1) return sprout(img, cx, by, P.pumpLeaf, 6)
      // Плетиво лози по землі з вусиками.
      const vine = (dir, len) => {
        const pts = []
        for (let i = 0; i <= len; i += 2) pts.push([cx + dir * i, by - 2 + Math.round(Math.sin(i * 0.4) * 1.3)])
        stem(img, pts, P.stem, 2)
        const [ex, ey] = pts.at(-1)
        for (let k = 0; k < 7; k++) {
          const a = k * 0.9
          img.set(Math.round(ex + dir * (2 + Math.cos(a) * (2.4 - k * 0.25))), Math.round(ey - 2 + Math.sin(a) * (2.4 - k * 0.25)), P.stem[3])
        }
        return pts
      }
      const reach = { 2: 4, 3: 12, 4: 15, 5: 16, 6: 17 }[s]
      const left = vine(-1, reach)
      const right = vine(1, reach)
      const bigLeaf = (x, y, a, size) => stalkLeaf(img, x, y, a, 3, size, size * 0.62, P.pumpLeaf, P.stem, { round: 0.55, serr: 0.7, rib: P.pumpLeaf[6] })
      bigLeaf(cx, by - 2, -2.2, s === 2 ? 7 : 9)
      bigLeaf(cx, by - 2, -0.95, s === 2 ? 7 : 9)
      if (s >= 3) {
        bigLeaf(left[3][0], left[3][1], -2.4, 8)
        bigLeaf(right[4][0], right[4][1], -0.7, 8)
        bigLeaf(cx - 1, by - 3, -1.6, 10)
      }
      if (s === 4) {
        const [fx, fy] = right[2]
        leaf(img, fx, fy - 1, -1.2, 6, 2.6, P.flowerY, { rib: null, veins: false, round: 0.4 })
        leaf(img, fx, fy - 1, -0.6, 6, 2.6, P.flowerY, { rib: null, veins: false, round: 0.4, bias: -0.1 })
        ball(img, fx + 3.5, fy - 5, 2.2, 2, P.flowerY, { spec: false, bias: 0.15 })
      }
      if (s === 5) ball(img, cx + 2, by - 4, 5, 3.8, P.pumpGreen)
      if (s === 6) {
        pumpkinBody(img, cx + 1, by - 7, 11, 7.5, P.pumpkin)
        stem(img, [[cx + 1, by - 14], [cx + 2, by - 17], [cx + 4, by - 18]], P.stem, 2)
      }
    } },
  }

  /* ───────── Іконки врожаю й пакетики насіння (для рюкзака) ───────── */

  const ICONS = {
    radish(img) {
      for (const a of [-2.3, -1.7, -1.1]) stalkLeaf(img, 16, 13, a, 3, 8, 3, P.leaf, P.redStalk, { round: 0.6, serr: 0.4 })
      ball(img, 16, 20, 7, 6.5, P.radish)
      stem(img, [[17, 26], [18, 29], [20, 31]], ['#d8d0c8', '#e8e0d8', '#f6f0e8'], 1)
    },
    carrot(img) {
      for (const [a, l] of [[-2.2, 10], [-1.75, 12], [-1.3, 11]]) frond(img, 22, 9, a + 0.6, l, P.frond, 0)
      for (let t = 0; t <= 1; t += 0.02) {
        const x = 22 - t * 15
        const y = 10 + t * 19
        const r = 4.6 * (1 - t) + 0.6
        for (let k = -r; k <= r; k += 0.5) {
          const px = Math.round(x + k * 0.8)
          const py = Math.round(y + k * 0.55)
          const lum = 0.55 - (k / r) * 0.32 + (1 - Math.abs(k / r)) * 0.15
          img.set(px, py, tone(P.carrot, lum, px, py))
        }
      }
      for (const t of [0.25, 0.45, 0.62, 0.78]) {
        const x = Math.round(22 - t * 15)
        const y = Math.round(10 + t * 19)
        img.set(x + 1, y, P.carrot[2])
        img.set(x + 2, y + 1, P.carrot[2])
      }
    },
    beet(img) {
      for (const a of [-2.2, -1.57, -0.95]) stalkLeaf(img, 16, 12, a, 4, 8, 3.4, P.beetLeaf, P.beetStalk, { round: 0.65, rib: '#b0304f' })
      ball(img, 16, 20, 7.5, 7, P.beet)
      stem(img, [[16, 27], [15, 30], [13, 31]], P.beet, 1)
    },
    tomato(img) {
      ball(img, 16, 18, 10, 9, P.tomato)
      img.set(10, 18, P.tomato[3])
      img.set(22, 19, P.tomato[2])
      calyx(img, 16, 10, 4.2, P.leaf)
      stem(img, [[16, 9], [17, 6]], P.stem, 2)
    },
    cabbage(img) {
      leaf(img, 13, 27, -2.75, 12, 6, P.cabbage, { round: 0.6, rib: P.cabbage[6] })
      leaf(img, 19, 27, -0.4, 12, 6, P.cabbage, { round: 0.6, rib: P.cabbage[6] })
      ball(img, 16, 16, 10, 9.5, P.cabHead, { bias: 0.04 })
      for (const [k, dir] of [[0.75, 1], [0.55, -1]])
        for (let a = -2.7; a < -0.4; a += 0.1) {
          const x = Math.round(16 + Math.cos(a) * 10 * k * dir)
          const y = Math.round(16 + Math.sin(a) * 9.5 * k)
          if (img.alpha(x, y)) img.set(x, y, P.cabHead[2])
        }
    },
    strawberry(img) {
      berry(img, 16, 18, 7, P.berry)
      calyx(img, 16, 10, 4.5, P.leaf)
      stem(img, [[16, 9], [15, 5]], P.stem, 2)
    },
    sunflower(img) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2
        leaf(img, 16 + Math.cos(a) * 6, 16 + Math.sin(a) * 6, a, 8, 2.4, P.petal, { rib: P.petal[4], veins: false, round: 0.55, bias: Math.sin(a) < 0 ? 0.1 : -0.05 })
      }
      sunDisc(img, 16, 16, 7.5, 7.5)
    },
    pumpkin(img) {
      leaf(img, 18, 11, -0.35, 9, 3.6, P.pumpLeaf, { round: 0.55, serr: 0.6, rib: P.pumpLeaf[6] })
      pumpkinBody(img, 16, 20, 11.5, 9, P.pumpkin)
      stem(img, [[16, 12], [17, 8], [20, 6]], P.stem, 3)
    },
  }

  function produceIcon(id) {
    const img = fine(32, 32)
    ICONS[id](img)
    return img.outline(INK, 0.9)
  }

  /** Пакетик насіння: паперовий конверт із загнутим верхом, кольорова смуга й малюнок урожаю. */
  function seedPacket(id, icon, seeds) {
    const img = fine(32, 32)
    for (let y = 3; y < 31; y++)
      for (let x = 5; x < 27; x++) {
        const lum = 0.62 - (x - 5) / 22 * 0.3 + (y < 7 ? 0.12 : 0) + (hash(x, y, 5) - 0.5) * 0.08
        img.set(x, y, tone(P.paper, lum, x, y))
      }
    for (let x = 5; x < 27; x++) img.set(x, 3 + (x % 2), P.paper[1]) // зубчастий край
    img.hline(5, 26, 7, P.paper[1])
    const band = ICON_BAND[id]
    img.rect(5, 24, 22, 5, band[0])
    img.hline(5, 26, 24, band[1])
    for (let x = 7; x < 25; x += 3) img.set(x, 26, P.paper[4])
    // Малюнок урожаю вдвічі меншим.
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const si = ((y * 2 + 1) * icon.w + x * 2 + 1) * 4
        if (icon.d[si + 3] < 128) continue
        const hex = '#' + [icon.d[si], icon.d[si + 1], icon.d[si + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')
        img.set(8 + x, 8 + y, hex)
      }
    // Кілька насінин висипались.
    for (const [x, y] of [[23, 29], [25, 30], [21, 30]]) {
      img.set(x, y, seeds[0])
      img.set(x + 1, y, seeds[1])
    }
    return img.outline(INK, 0.9)
  }
  const ICON_BAND = {
    radish: ['#c22a42', '#e25365'],
    carrot: ['#d0621a', '#ef8a2c'],
    beet: ['#76204c', '#9c3466'],
    tomato: ['#c6301f', '#e8523a'],
    cabbage: ['#4f9056', '#78b06a'],
    strawberry: ['#b01e30', '#e03848'],
    sunflower: ['#e8a91a', '#ffd23c'],
    pumpkin: ['#d86818', '#f28c2c'],
  }

  /* ───────── Грядки й поле ───────── */

  /** Скопана грядка 16×16: три борозни, грудочки, камінці; волога — темніша з відблисками. */
  function soil(wet) {
    const img = fine(32, 32)
    const pal = wet ? P.wet : P.dirt
    for (let y = 1; y < 31; y++)
      for (let x = 1; x < 31; x++) {
        const cornerCut = (x < 3 || x > 28) && (y < 3 || y > 28)
        if (cornerCut && (x === 1 || x === 30 || y === 1 || y === 30)) continue
        const f = (y - 1) % 10 // борозна: гребінь угорі, западина внизу
        let lum = f < 3 ? 0.78 : f < 6 ? 0.55 : f < 8 ? 0.36 : 0.22
        lum += (hash(x >> 1, y >> 1, wet ? 61 : 60) - 0.5) * 0.22
        lum -= Math.abs(x - 15.5) / 15.5 * 0.08
        if (x < 3 || x > 28 || y < 3 || y > 28) lum -= 0.18
        img.set(x, y, tone(pal, lum, x, y))
      }
    // Грудочки землі на гребенях.
    for (let i = 0; i < 18; i++) {
      const x = 3 + Math.floor(hash(i, 1, wet ? 71 : 70) * 25)
      const y = 2 + Math.floor(hash(i, 2, 70) * 3) * 10 + Math.floor(hash(i, 3, 70) * 3)
      img.set(x, y, pal[pal.length - 1])
      img.set(x + 1, y + 1, pal[1])
    }
    // Камінці.
    for (const [x, y] of [[6, 14], [22, 25], [25, 6]]) {
      img.set(x, y, wet ? '#6a6a70' : '#a8a49c')
      img.set(x + 1, y, wet ? '#4a4a50' : '#7a766e')
    }
    if (wet) for (let i = 0; i < 9; i++) img.set(3 + Math.floor(hash(i, 9, 80) * 25), 3 + Math.floor(hash(i, 8, 80) * 25), '#9ab4c4', 0.55)
    return img.outline(wet ? '#120c06' : '#2a1a0c', 0.6)
  }

  /** Розмітка ще не скопаної грядки: ледь помітні кутики. */
  function plotMark() {
    const img = fine(32, 32)
    for (const [x, y, dx, dy] of [[1, 1, 1, 1], [30, 1, -1, 1], [1, 30, 1, -1], [30, 30, -1, -1]])
      for (let k = 0; k < 4; k++) {
        img.set(x + dx * k, y, '#f6f0d8', 0.45)
        img.set(x, y + dy * k, '#f6f0d8', 0.45)
      }
    return img
  }

  /** Бур'ян на ще закритих ділянках: стебла, кульбаба, камінці. variant — 0…2. */
  function weeds(variant) {
    const img = fine(32, 28)
    const by = 25
    for (let i = 0; i < 9; i++) {
      const x = 5 + Math.floor(hash(i, variant, 90) * 22)
      const a = -1.57 + (hash(i, variant, 91) - 0.5) * 1.3
      leaf(img, x, by, a, 7 + hash(i, variant, 92) * 8, 1.4, P.frond, { rib: null, veins: false, round: 0.9, curl: (hash(i, variant, 93) - 0.5) * 0.4 })
    }
    for (let i = 0; i < 3; i++) {
      const x = 7 + Math.floor(hash(i, variant, 94) * 18)
      leaf(img, x, by, -2.4 + i, 6, 2.6, P.beetLeaf, { serr: 0.6, round: 0.7 })
    }
    if (variant !== 1) {
      const fx = 10 + variant * 8
      stem(img, [[fx, by], [fx + 1, by - 12]], P.stem, 1)
      ball(img, fx + 1, by - 14, 2.4, 2.2, variant ? P.white : P.flowerY, { spec: false, bias: 0.1 })
    }
    ball(img, 8 + variant * 6, by, 3, 2, ['#4a4640', '#6a6660', '#8a867e', '#aaa69e'])
    ball(img, 22 - variant * 3, by + 1, 2.2, 1.6, ['#4a4640', '#6a6660', '#8a867e', '#aaa69e'])
    return img.outline(PLANT_INK, 0.8)
  }

  /** Комора городника: стіл під дашком, лоток із пакетиками, мішки й табличка з паростком. */
  function seedStand() {
    const img = fine(48, 52)
    const by = 50
    // Ніжки й стільниця.
    for (const x of [6, 40]) for (let y = 26; y <= by; y++) {
      img.set(x, y, P.wood[3])
      img.set(x + 1, y, P.wood[2])
      img.set(x + 2, y, P.wood[1])
    }
    for (let y = 30; y < 36; y++) for (let x = 3; x < 46; x++) img.set(x, y, tone(P.wood, 0.75 - (y - 30) * 0.08 + (x % 6 === 0 ? -0.15 : 0), x, y))
    img.hline(3, 45, 30, P.wood[5])
    // Дашок-навіс у смужку.
    for (let y = 4; y < 14; y++)
      for (let x = 1 + (13 - y) / 3; x < 47 - (13 - y) / 3; x++) {
        const stripe = Math.floor(x / 6) % 2
        img.set(Math.round(x), y, stripe ? (y < 6 ? '#e8e0c8' : '#f6f0e2') : y < 6 ? '#a8281f' : '#d9493a')
      }
    for (let x = 1; x < 47; x += 6) {
      img.set(x + 2, 14, '#d9493a')
      img.set(x + 3, 15, '#a8281f')
    }
    for (const x of [6, 40]) for (let y = 14; y < 26; y++) img.set(x + 1, y, P.wood[2])
    // Пакетики на стільниці.
    const cols = ['#c22a42', '#d0621a', '#4f9056', '#e8a91a', '#b01e30', '#76204c']
    cols.forEach((c, i) => {
      const x = 6 + i * 6
      img.rect(x, 22, 5, 8, P.paper[3])
      img.rect(x, 26, 5, 3, c)
      img.hline(x, x + 4, 22, P.paper[4])
      img.set(x + 2, 24, c)
    })
    // Мішки з насінням біля столу.
    for (const [x, c] of [[12, '#7a5e34'], [32, '#9a7a48']]) {
      ball(img, x, by - 6, 7, 7, P.burlap, { spec: false })
      img.hline(x - 3, x + 3, by - 12, c)
      ball(img, x, by - 12, 4, 1.6, ['#3a2a10', '#5a4220', '#e8c060', '#f8e090'], { spec: false })
    }
    // Табличка з паростком.
    img.rect(20, 37, 9, 7, P.wood[4])
    img.hline(20, 28, 37, P.wood[5])
    leaf(img, 24, 42, -2.3, 3, 1.4, P.leaf, { rib: null, veins: false })
    leaf(img, 24, 42, -0.8, 3, 1.4, P.leaf, { rib: null, veins: false })
    return img.outline(INK, 0.9)
  }

  /** Латунний дощувач на трубці. */
  function sprinkler() {
    const img = fine(16, 24)
    for (let y = 8; y < 22; y++) {
      img.set(7, y, P.brass[2])
      img.set(8, y, P.brass[1])
    }
    ball(img, 7.5, 7, 4.5, 2.6, P.brass)
    for (const x of [3, 7, 11]) img.set(x, 5, '#9ad0f0')
    ball(img, 7.5, 22, 5, 1.6, P.dirt, { spec: false })
    return img.outline(INK, 0.9)
  }

  /** Плетена лежанка для псів із вишитою ковдрою — кладеться на підлогу в хатинці. */
  function dogBed() {
    const img = fine(48, 32)
    for (let y = 1; y < 31; y++)
      for (let x = 1; x < 47; x++) {
        const dx = (x + 0.5 - 24) / 23
        const dy = (y + 0.5 - 16) / 15
        const r = dx * dx + dy * dy
        if (r > 1) continue
        if (r > 0.62) {
          // Лоза кошика: косе плетіння.
          const weave = ((x + y * 2) >> 1) % 3
          img.set(x, y, P.wicker[Math.max(0, Math.min(4, 3 - weave + (dy < 0 ? 1 : 0) - (r > 0.9 ? 1 : 0)))])
        } else {
          const lum = 0.55 - dx * 0.15 - dy * 0.2 + (hash(x >> 2, y >> 2, 3) - 0.5) * 0.1
          img.set(x, y, tone(P.blanket, lum, x, y))
          // Вишивка хрестиком: маленькі «х» рядками.
          const qx = ((x % 6) + 6) % 6
          const qy = ((y % 6) + 6) % 6
          if (Math.abs(dx) < 0.6 && qx > 0 && qx < 4 && qy > 0 && qy < 4 && (qx === qy || qx + qy === 4)) img.set(x, y, '#f3eee2')
        }
      }
    ball(img, 13, 12, 6, 4, P.white, { bias: 0.05 })
    return img.outline(INK, 0.7)
  }

  /* ───────── Разом ───────── */

  const sprites = {}
  const meta = {}
  for (const [id, def] of Object.entries(CROP_DRAW)) {
    const list = frames(def.w, def.h, STAGES[id], (img, s, cx, by) => {
      if (s === 0) mound(img, cx, by, { seeds: def.seeds })
      else def.draw(img, s, cx, by)
    })
    list.forEach((img, s) => (sprites[`crop_${id}_${s}`] = img))
    meta[id] = list.length
  }
  sprites.soil_dry = soil(false)
  sprites.soil_wet = soil(true)
  sprites.plot_mark = plotMark()
  for (let v = 0; v < 3; v++) sprites[`weeds_${v}`] = weeds(v)
  sprites.seed_stand = seedStand()
  sprites.sprinkler = sprinkler()
  sprites.home_dog_bed = dogBed()

  /** Окремі PNG для рюкзака: crop_<id>.png і seed_<id>.png. */
  const items = {}
  for (const id of Object.keys(CROP_DRAW)) {
    const icon = produceIcon(id)
    items[`crop_${id}`] = icon
    items[`seed_${id}`] = seedPacket(id, icon, CROP_DRAW[id].seeds)
  }
  return { sprites, items, meta }
}
