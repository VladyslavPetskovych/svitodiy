/**
 * Острів Хуртовини: земля (сніг, лід, холодна вода), прибій, сітка прохідності, місця для заметів
 * і спрайти — засніжені ялини, скелі, сухе дерево, сніговик, замети, крижані брили, хмиз.
 *
 * Той самий піксель, що й на рідному острові (1 px арту = 1 px світу), світло зверху зліва.
 * Тіні й контури — холодні сині замість теплих коричневих: сніг відбиває небо.
 *
 * Модуль не має власного полотна й шуму — генератор (gen-island-art.mjs) передає свої.
 */

import { CELL } from '../src/game/walk/layout.js'
import { WINTER_LAND, WINTER_MAP, WINTER_PIER, WINTER_PROPS, WINTER_RESERVED, propFootprint } from '../src/game/walk/winter.js'

const WATER = 0
const SNOW = 1
const FLOE = 2
const POND = 3

/** Сніг: від тіні (небо в ній синє) до сліпучо-білого. */
const SNOW_PAL = ['#7f98bf', '#94abcf', '#aabedd', '#bfd0e8', '#d2dff0', '#e3ebf6', '#f2f6fb', '#ffffff']
/** Лід: глибокий синій у тріщинах → блакитний → білий відблиск. */
const ICE_PAL = ['#3f7aa8', '#4f8cb8', '#64a0c8', '#7db4d6', '#98c8e2', '#b7dcee', '#d6eef8']
/** Хвоя під снігом — темніша й синіша за літню. */
const NEEDLES = ['#6f9a6a', '#3f6f4f', '#2d5a40', '#204632', '#163626']
const BARK = { lo: '#4a3222', mid: '#6b4a30', hi: '#8f6a48' }
const ROCK_PAL = ['#4d5463', '#606878', '#767f90', '#9aa3b3', '#c3c9d4']
const OUTLINE = '#2a3656'
const SHADOW = '#1c2f5c'

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)]
const clamp01 = (v) => Math.max(0, Math.min(1, v))

/** Тон 0…1 → колір рампи, дизеринг лише вузькою смугою між відтінками (як ramp у генераторі). */
function ramp(pal, v, x, y, dither = bayer) {
  const f = Math.max(0, Math.min(0.9999, v)) * (pal.length - 1)
  const i = Math.floor(f)
  const fr = Math.max(0, Math.min(1, (f - i - 0.5) / 0.32 + 0.5))
  return pal[Math.min(pal.length - 1, i + (fr > dither(x, y) ? 1 : 0))]
}

/**
 * @param {{ Img: any, hash: (x: number, y: number, seed: number) => number,
 *   fbm: (x: number, y: number, seed: number, oct?: number) => number,
 *   worley: (x: number, y: number, size: number, seed: number) => { d1: number, d2: number, id: number },
 *   distanceTo: (mask: Uint8Array, w: number, h: number) => Float32Array }} lib
 */
export function winterArt({ Img, hash, fbm, worley, distanceTo }) {
  const { w: W, h: H } = WINTER_MAP
  const grain = (x, y) => hash(x, y, 1999)

  /** Еліпси, що зливаються, з шумом на краях (як field у генераторі). */
  function field(blobs, x, y, seed, amp) {
    let best = -Infinity
    for (const b of blobs) {
      const dx = (x - b.x) / b.rx
      const dy = (y - b.y) / b.ry
      best = Math.max(best, 1 - Math.sqrt(dx * dx + dy * dy))
    }
    return best + (fbm(x / 36, y / 36, seed) - 0.5) * amp
  }

  /* ───────── Рельєф ───────── */

  function terrain() {
    const N = W * H
    const cls = new Uint8Array(N)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        const l = field(WINTER_LAND.snow, x, y, 111, 0.16)
        if (l >= 0) cls[i] = field(WINTER_LAND.pond, x, y, 131, 0.3) > 0 ? POND : SNOW
        // Замерзле море — лише там, де воно тримається берега.
        else cls[i] = field(WINTER_LAND.floe, x, y, 121, 0.3) > 0 && l > -0.3 ? FLOE : WATER
      }
    const isWater = cls.map((c) => (c === WATER ? 1 : 0))
    const isLand = cls.map((c) => (c === WATER ? 0 : 1))
    const notSnow = cls.map((c) => (c !== SNOW ? 1 : 0))
    const isSnow = cls.map((c) => (c === SNOW ? 1 : 0))
    return {
      cls,
      dWater: distanceTo(isWater, W, H), // для суші: як далеко вода
      dLand: distanceTo(isLand, W, H), // для води: як далеко берег
      dEdge: distanceTo(notSnow, W, H), // для снігу: як далеко лід чи вода
      dSnow: distanceTo(isSnow, W, H), // для льоду: як далеко сніг
    }
  }

  /* ───────── Земля ───────── */

  function groundImage(t) {
    const img = new Img(W, H)
    const { cls, dWater, dLand, dEdge, dSnow } = t
    const idx = (x, y) => y * W + x
    const dune = (x, y) => fbm(x / 46, y / 46, 7)

    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y)
        const c = cls[i]
        const n = hash(x, y, 5)

        /* Холодна вода: сіро-бірюзова мілина, темна глибина. */
        if (c === WATER) {
          const dl = dLand[i]
          if (dl < 18) {
            const k = 1 - dl / 18
            img.set(x, y, '#8cc8d8', 0.55 * k ** 1.4)
            if (dl < 5) img.set(x, y, '#d8eef4', 0.35 * (1 - dl / 5))
          }
          if (dl > 15 && dl < 20 && bayer(x, y) < 0.5) img.set(x, y, '#1d4f80', 0.22)
          if (dl > 24) img.set(x, y, '#0c2c52', Math.min(0.5, (dl - 24) / 90))
          continue
        }

        /* Лід: плити з тріщинами, косі відблиски, сніжна пороша плямами. */
        if (c === FLOE || c === POND) {
          const size = c === POND ? 9 : 14
          const wv = worley(x * 0.9, y * 1.15, size, c === POND ? 71 : 61)
          const e = wv.d2 - wv.d1
          let tone = 0.42 + (wv.id - 0.5) * 0.3 + (fbm(x / 10, y / 10, 62) - 0.5) * 0.25
          const streak = Math.sin((x - y * 0.6) * 0.09 + fbm(x / 20, y / 20, 63) * 3)
          if (streak > 0.8) tone += 0.2
          let col = ramp(ICE_PAL, tone, x, y)
          if (e < 0.75) col = '#2c5a80'
          else if (e < 1.5) {
            // Світла фаска з боку світла, темна — з тіньового.
            const up = worley((x - 1) * 0.9, (y - 1) * 1.15, size, c === POND ? 71 : 61)
            if (up.d2 - up.d1 < 0.75) col = ICE_PAL[6]
          }
          const dust = fbm(x / 14, y / 14, 64)
          if (dust > 0.62) col = ramp(SNOW_PAL, 0.55 + (dust - 0.62) * 2.5, x, y, grain)
          else if (dust > 0.58 && bayer(x, y) < (dust - 0.58) * 25) col = SNOW_PAL[4]
          // Край крижини біля води — товстий білий бортик.
          const dw = dWater[i]
          if (c === FLOE && dw < 2) col = '#eaf5fb'
          else if (c === FLOE && dw < 3.5) col = '#9fc9e2'
          // Біля снігу лід присипаний: суцільно впритул, далі — рідшими цятками.
          if (dSnow[i] < 1.5) col = SNOW_PAL[5]
          else if (dSnow[i] < 3.5 && bayer(x, y) < 0.5 - (dSnow[i] - 1.5) / 4) col = SNOW_PAL[4]
          img.set(x, y, col)
          if (n < 0.008) img.set(x, y, '#ffffff')
          else if (n > 0.994) img.set(x, y, '#c3e4f4')
          continue
        }

        /* Сніг: пологі дюни зі світлом зверху зліва, заструги від вітру, блискітки. */
        const d0 = dune(x, y)
        const gx = dune(x + 2, y) - dune(x - 2, y)
        const gy = dune(x, y + 2) - dune(x, y - 2)
        let tone = 0.6 + (d0 - 0.5) * 0.35 + (fbm(x / 9, y / 9, 17) - 0.5) * 0.18
        tone += -(gx * 0.6 + gy * 0.8) * 7
        tone += (0.5 - (x / W + y / H) / 2) * 0.12
        const rip = Math.sin(x * 0.16 - y * 0.5 + fbm(x / 24, y / 24, 8) * 7)
        const ripK = clamp01((dEdge[i] - 4) / 8) * clamp01((fbm(x / 30, y / 30, 9) - 0.45) * 8)
        if (rip > 0.86) tone += 0.13 * ripK
        else if (rip < -0.88) tone -= 0.15 * ripK
        const dw = dWater[i]
        // Берег: сніговий карниз над водою — синя тінь під ним.
        if (dw < 1.5) tone = 0.08
        else if (dw < 3.2) tone -= 0.3
        else if (dw < 5) tone -= 0.1
        let col = ramp(SNOW_PAL, tone, x, y, grain)
        if (dEdge[i] < 1.5 && dw >= 1.5) col = '#cfe3f0' // сніг ледь налазить на лід
        img.set(x, y, col)
        if (dw > 4) {
          if (n < 0.005) img.set(x, y, '#ffffff')
          else if (n > 0.996) img.set(x, y, '#d6f0ff')
        }
      }

    /* ───── Деталі поверх снігу ───── */

    const okSnow = (x, y, gap = 3) => x > 2 && y > 4 && x < W - 3 && y < H - 3 && cls[idx(x, y)] === SNOW && dEdge[idx(x, y)] > gap && dWater[idx(x, y)] > gap + 2

    // Суха трава, що стирчить зі снігу.
    for (let k = 0; k < 140; k++) {
      const x = Math.floor(hash(k, 1, 401) * W)
      const y = Math.floor(hash(k, 2, 401) * H)
      if (!okSnow(x, y, 5) || fbm(x / 30, y / 30, 402) < 0.48) continue
      const blades = 2 + Math.floor(hash(k, 3, 401) * 3)
      for (let b = 0; b < blades; b++) {
        const bx = x + b * 2 - blades
        const len = 2 + Math.floor(hash(k, 10 + b, 401) * 3)
        const lean = hash(k, 20 + b, 401) < 0.5 ? -1 : 1
        for (let j = 0; j < len; j++) img.set(bx + (j === len - 1 ? lean : 0), y - j, j === len - 1 ? '#c9b47a' : '#8a7a4a')
      }
      img.hline(x - blades - 1, x + blades, y + 1, '#9fb4d6', 0.7)
    }

    // Камінці, присипані снігом.
    for (let k = 0; k < 60; k++) {
      const x = Math.floor(hash(k, 1, 411) * W)
      const y = Math.floor(hash(k, 2, 411) * H)
      if (!okSnow(x, y, 4)) continue
      img.set(x, y, '#5b6470')
      img.set(x + 1, y, '#4d5463')
      img.set(x, y - 1, '#ffffff')
      img.set(x + 1, y - 1, '#e3ebf6')
      img.set(x - 1, y, '#9aa6b4')
      img.hline(x - 1, x + 2, y + 1, '#8ea6c8', 0.6)
    }

    // Сліди зайця: парні відбитки вздовж плавної кривої.
    for (let tr = 0; tr < 5; tr++) {
      let x = 60 + hash(tr, 1, 421) * (W - 120)
      let y = 70 + hash(tr, 2, 421) * (H - 160)
      let a = hash(tr, 3, 421) * Math.PI * 2
      for (let s = 0; s < 16; s++) {
        a += (fbm(s / 4, tr, 422) - 0.5) * 0.9
        x += Math.cos(a) * 7
        y += Math.sin(a) * 5
        const px = Math.round(x)
        const py = Math.round(y)
        if (!okSnow(px, py, 4)) continue
        // Задні лапи поруч, передні — одна за одною.
        const ox = Math.round(-Math.sin(a) * 1.5)
        const oy = Math.round(Math.cos(a) * 1.5)
        img.set(px + ox, py + oy, '#8ea6c8')
        img.set(px - ox, py - oy, '#8ea6c8')
        img.set(px - Math.round(Math.cos(a) * 3), py - Math.round(Math.sin(a) * 2), '#9db1d3')
      }
    }

    // Пташині сліди: дрібні «стрілочки» ланцюжком.
    for (let tr = 0; tr < 6; tr++) {
      let x = 40 + hash(tr, 1, 431) * (W - 80)
      let y = 50 + hash(tr, 2, 431) * (H - 120)
      const a = hash(tr, 3, 431) * Math.PI * 2
      for (let s = 0; s < 9; s++) {
        x += Math.cos(a) * 3 + (hash(tr, s, 432) - 0.5) * 2
        y += Math.sin(a) * 2.4
        const px = Math.round(x)
        const py = Math.round(y)
        if (!okSnow(px, py, 3)) continue
        img.set(px, py, '#9db1d3')
        img.set(px - 1, py - 1, '#a9bedc')
        img.set(px + 1, py - 1, '#a9bedc')
      }
    }

    // Крижини на воді біля берега (по них не ходять — лише окраса).
    for (let k = 0; k < 220; k++) {
      const x = Math.floor(hash(k, 1, 441) * W)
      const y = Math.floor(hash(k, 2, 441) * H)
      const i = idx(x, y)
      if (cls[i] !== WATER || dLand[i] < 6 || dLand[i] > 70 || hash(k, 3, 441) > 0.4 - dLand[i] / 250) continue
      const rx = 1.5 + hash(k, 4, 441) * 4.5
      const ry = rx * (0.45 + hash(k, 5, 441) * 0.25)
      img.ellipse(x + 0.5, y + 1.5, rx, ry, '#123a63', 0.35)
      img.ellipse(x, y, rx, ry, '#a8cde2')
      img.ellipse(x - 0.4, y - 0.5, Math.max(1, rx - 1), Math.max(0.6, ry - 0.8), '#eef6fb')
      if (rx > 3) img.set(Math.round(x - rx / 2), Math.round(y - ry / 3), '#ffffff')
    }
    return img
  }

  /** Прибій: 4 кадри — піна б'ється об сніг і крижини, хвиля котиться до берега, зблиски. */
  function shoreImage(t) {
    const FR = 4
    const img = new Img(W, H * FR)
    const TAU = Math.PI * 2
    for (let f = 0; f < FR; f++) {
      const ph = (f / FR) * TAU
      const oy = f * H
      const swash = 1.4 + 1.3 * Math.sin(ph)
      const wave = 13 - 9 * (f / FR)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x
          if (t.cls[i] !== WATER) continue
          const dl = t.dLand[i]
          if (dl > 20) continue
          const n = fbm(x / 6, y / 6, 551 + f, 2)
          if (dl < swash + (n - 0.5) * 2) img.set(x, y + oy, '#f6fcff', 0.95)
          else if (dl < swash + 1.4 + (n - 0.5) * 2) img.set(x, y + oy, '#cbe7f2', 0.8)
          if (Math.abs(dl - wave - (n - 0.5) * 3) < 0.75 && n > 0.42) img.set(x, y + oy, '#e6f6ff', 0.6 * (dl / 13))
        }
      for (let k = 0; k < 140; k++) {
        const x = Math.floor(hash(k, 1, 951) * W)
        const y = Math.floor(hash(k, 2, 951) * H)
        if (t.cls[y * W + x] !== WATER || t.dLand[y * W + x] < 4) continue
        const s = Math.sin(ph + hash(k, 3, 951) * TAU)
        if (s < 0.55) continue
        img.set(x, y + oy, '#ffffff', 0.85)
        if (s > 0.92) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) img.set(x + dx, y + dy + oy, '#ffffff', 0.45)
      }
    }
    return img
  }

  /** Сітка прохідності: клітинка прохідна, якщо майже вся — сніг чи лід. */
  function walkGrid(t) {
    const cols = Math.ceil(W / CELL)
    const rows = Math.ceil(H / CELL)
    const out = []
    for (let cy = 0; cy < rows; cy++) {
      let line = ''
      for (let cx = 0; cx < cols; cx++) {
        let ok = 0
        for (let y = cy * CELL; y < Math.min(H, (cy + 1) * CELL); y++)
          for (let x = cx * CELL; x < Math.min(W, (cx + 1) * CELL); x++) if (t.cls[y * W + x] !== WATER) ok++
        line += ok >= CELL * CELL * 0.7 ? '1' : '0'
      }
      out.push(line)
    }
    return out
  }

  /**
   * Де самі виростають замети, хмиз (сніг) і крижані брили (лід) — server/src/game/winter-slots.json.
   * Шахматка з кроком 16 px; висадку, вогнище й декорації лишаємо вільними.
   */
  function nodeSlots(t, walk) {
    const ok = (x, y) => walk[Math.floor(y / CELL)]?.[Math.floor(x / CELL)] === '1'
    const P = WINTER_PIER
    const busy = [...WINTER_RESERVED, [P.x - P.w / 2 - 6, P.y0 - 12, P.w + 12, P.y1 - P.y0 + 12], ...WINTER_PROPS.map((p) => propFootprint(p))]
    const near = (x, y) => busy.some(([rx, ry, rw, rh]) => x >= rx - 12 && x <= rx + rw + 12 && y >= ry - 4 && y <= ry + rh + 16)
    const out = { snow: [], ice: [] }
    for (let y = 24; y < H - 8; y += 16)
      for (let x = 16; x < W - 16; x += 16) {
        const ax = x + ((y / 16) % 2 ? 8 : 0)
        if (near(ax, y)) continue
        if (![[-8, -8], [8, -8], [-8, -1], [8, -1], [0, -12], [0, 4]].every(([dx, dy]) => ok(ax + dx, y + dy))) continue
        const i = (y - 2) * W + ax
        const c = t.cls[i]
        if (c === SNOW && t.dEdge[i] > 5 && t.dWater[i] > 8) out.snow.push([ax, y])
        else if ((c === FLOE && t.dWater[i] > 6) || c === POND) out.ice.push([ax, y])
      }
    return out
  }

  /* ───────── Спрайти ───────── */

  const shadow = (img, cx, cy, rx, ry, a = 0.3) => img.ellipse(cx, cy, rx, ry, SHADOW, a)

  /**
   * Сніговий горбик: півеліпс із горбиками зверху, світло зверху зліва.
   * Повертає функцію «чи всередині» — щоб домалювати те, що з нього стирчить.
   */
  function mound(img, cx, base, rx, ry, seed, light = 0) {
    for (let y = Math.floor(base - ry - 2); y <= base; y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx
        const lump = (fbm((x + seed * 13) / 4, seed, seed, 2) - 0.5) * 0.35
        const dy = (y + 0.5 - base) / (ry * (1 + lump))
        if (dy > 0 || dx * dx + dy * dy > 1) continue
        const l = -(dx * 0.55 + dy * 0.85) + light + (hash(x, y, seed) - 0.5) * 0.1
        img.set(x, y, ramp(SNOW_PAL, 0.25 + l * 0.6, x, y))
      }
  }

  /** Замет: що там під ним — видно лише краєчок і блиск. */
  function drift() {
    const img = new Img(22, 12)
    shadow(img, 11, 10.5, 10, 1.8, 0.28)
    mound(img, 11, 10, 9.5, 7, 3)
    // Щось темне визирає з-під снігу, і блищить.
    img.set(15, 9, '#5a4a3a')
    img.set(16, 9, '#7a6a58')
    img.set(16, 8, '#9aa6b4')
    img.set(6, 4, '#ffffff')
    img.set(7, 5, '#d6f0ff')
    return img.outline(OUTLINE, 0.75)
  }

  /** Великий замет: два горби, з одного стирчить ріжок скрині. */
  function bigDrift() {
    const img = new Img(32, 17)
    shadow(img, 16, 15.5, 15, 2.2, 0.3)
    mound(img, 12, 15, 11, 11, 5)
    // Ріжок старої скрині з іржавим окуттям.
    img.rect(21, 7, 6, 6, '#6b4a30')
    img.hline(21, 26, 7, '#8f6a48')
    img.vline(26, 7, 12, '#4a3222')
    img.vline(23, 7, 12, '#b0703a')
    img.set(23, 9, '#e0a050')
    mound(img, 21, 15, 10, 7, 9, -0.05)
    img.set(9, 5, '#ffffff')
    img.set(10, 6, '#d6f0ff')
    img.set(18, 10, '#ffffff')
    return img.outline(OUTLINE, 0.75)
  }

  /** Опукла фігура за точками (за годинниковою стрілкою) — чи точка всередині. */
  const inPoly = (pts, x, y) => {
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }

  /** Крижана брила: кілька кристалів з гранями (світла ліва, темна права), сніг на маківках. */
  function iceChunk() {
    const img = new Img(22, 20)
    shadow(img, 11, 18, 10, 2, 0.32)
    const shards = [
      { pts: [[4, 18], [3, 9], [7, 3], [11, 1], [14, 6], [15, 18]], ridge: [10, 1.5, 9.5, 18] },
      { pts: [[13, 18], [14, 10], [17, 6], [20, 9], [19, 18]], ridge: [17.5, 6, 16.5, 18] },
      { pts: [[1, 18], [2, 13], [5, 11], [7, 18]], ridge: [4.5, 11, 4, 18] },
    ]
    for (const s of shards) {
      const [rx0, ry0, rx1, ry1] = s.ridge
      for (let y = 0; y < img.h; y++)
        for (let x = 0; x < img.w; x++) {
          if (!inPoly(s.pts, x + 0.5, y + 0.5)) continue
          const t = (y + 0.5 - ry0) / (ry1 - ry0)
          const rxAt = rx0 + (rx1 - rx0) * t
          const left = x + 0.5 < rxAt
          let tone = left ? 0.72 - t * 0.2 : 0.4 - t * 0.22
          if (Math.abs(x + 0.5 - rxAt) < 0.8) tone = 0.95 // ребро ловить світло
          tone += (hash(x, y, 77) - 0.5) * 0.08
          img.set(x, y, ramp(ICE_PAL, tone, x, y))
        }
      // Сніг на маківці кристала.
      for (let x = 0; x < img.w; x++)
        for (let y = 0; y < img.h; y++) {
          if (!inPoly(s.pts, x + 0.5, y + 0.5)) continue
          img.set(x, y, '#ffffff')
          if (hash(x, 3, 78) < 0.5) img.set(x, y + 1, '#e3ebf6')
          break
        }
    }
    // Бульбашки й блиск.
    img.set(7, 10, '#ffffff')
    img.set(8, 11, '#d6eef8')
    img.set(17, 12, '#d6eef8')
    // Сніг довкола основи.
    for (let x = 1; x < 21; x++) if (img.alpha(x, 17)) img.set(x, 18, hash(x, 18, 79) < 0.5 ? '#e3ebf6' : '#ffffff')
    return img.outline(OUTLINE, 0.85)
  }

  /** Хмиз: пучок сухого гілля, що стирчить з невеликого замету. */
  function brushwood() {
    const img = new Img(18, 14)
    shadow(img, 9, 12.5, 8, 1.6, 0.26)
    const line = (x0, y0, x1, y1, col) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
      for (let k = 0; k <= n; k++) img.set(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, col)
    }
    for (const [x1, y1, col] of [[2, 3, BARK.mid], [5, 1, BARK.hi], [9, 0, BARK.mid], [13, 2, BARK.lo], [16, 4, BARK.mid], [11, 4, BARK.hi]]) line(9, 11, x1, y1, col)
    line(5, 1, 3, 0, BARK.lo)
    line(13, 2, 15, 0, BARK.mid)
    for (const [x, y] of [[3, 2], [5, 0], [9, 0], [14, 1], [16, 3]]) img.set(x, y - 1 < 0 ? 0 : y, '#ffffff')
    mound(img, 9, 12, 7, 4, 11)
    return img.outline(OUTLINE, 0.8)
  }

  /** Засніжена ялина: яруси хвої, сніг на верхніх гранях і звисає з країв. */
  function snowyPine(W0, H0, tiers) {
    const img = new Img(W0, H0)
    const cx = Math.floor(W0 / 2)
    shadow(img, cx, H0 - 3, W0 / 2 - 2, 3, 0.32)
    const trunkTop = tiers.at(-1)[0] + tiers.at(-1)[2] - 1
    img.rect(cx - 2, trunkTop, 4, H0 - trunkTop - 2, BARK.mid)
    img.vline(cx - 2, trunkTop, H0 - 3, BARK.lo)
    img.vline(cx + 1, trunkTop, H0 - 3, BARK.hi)
    for (const [top, half, hgt] of tiers) {
      for (let y = 0; y < hgt; y++) {
        const w = Math.round(1 + (half * y) / (hgt - 1))
        for (let x = -w; x <= w; x++) {
          const u = (x + w) / (2 * w + 1)
          let k = y === hgt - 1 ? 4 : u < 0.25 ? 1 : u < 0.6 ? 2 : u < 0.85 ? 3 : 4
          if (k <= 2 && hash(x, y + top, 47) < 0.08) k = 0
          img.set(cx + x, top + y, NEEDLES[k])
          // Сніг: верхні рядки ярусу й освітлений лівий схил.
          const snowLine = 0.45 + (hash(x, top, 48) - 0.5) * 0.3
          if (y / hgt < snowLine && u < 0.75) img.set(cx + x, top + y, u < 0.35 ? '#ffffff' : '#e3ebf6')
          else if (y / hgt < snowLine + 0.12 && u < 0.6 && hash(x, y + top, 49) < 0.5) img.set(cx + x, top + y, '#bccde4')
        }
        // Сніг звисає з нижнього краю ярусу.
        if (y === hgt - 1) for (let x = -w; x <= w; x += 2) if (hash(x, top, 50) < 0.6) img.set(cx + x, top + y + 1, x < 0 ? '#ffffff' : '#bccde4')
      }
    }
    img.set(cx, tiers[0][0] - 1, '#ffffff')
    return img.outline(OUTLINE, 0.9)
  }

  /** Скеля, присипана снігом. */
  function snowRock(big) {
    const [w, h] = big ? [26, 18] : [15, 12]
    const img = new Img(w, h)
    shadow(img, w / 2, h - 2, w / 2 - 1, 2.5, 0.32)
    const cx = w / 2
    const cy = h / 2 + 0.5
    for (let y = 0; y < h - 1; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - cx) / (w / 2 - 1)
        const dy = (y + 0.5 - cy) / (h / 2 - 1)
        const r = dx * dx + dy * dy * 1.2 + (hash(x, y, 84) - 0.5) * 0.1
        if (r > 1) continue
        const light = -(dx * 0.5 + dy * 0.85)
        img.set(x, y, light > 0.4 ? ROCK_PAL[4] : light > 0 ? ROCK_PAL[3] : light > -0.45 ? ROCK_PAL[2] : light > -0.8 ? ROCK_PAL[1] : ROCK_PAL[0])
        // Сніговий ковпак: зверху, з нерівним краєм.
        const cap = -0.15 + (fbm(x / 3, 1, 85, 2) - 0.5) * 0.7
        if (dy < cap) img.set(x, y, light > 0.2 ? '#ffffff' : '#d2dff0')
      }
    if (big) {
      img.vline(10, 8, 12, ROCK_PAL[0])
      img.set(11, 13, ROCK_PAL[0])
    }
    return img.outline(OUTLINE, 0.85)
  }

  /** Сухе дерево: голі гілки, на кожній — смужка снігу. */
  function deadTree() {
    const img = new Img(26, 40)
    shadow(img, 13, 37, 9, 2.5, 0.3)
    const line = (x0, y0, x1, y1, col, wdt = 1) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n
        const y = y0 + ((y1 - y0) * k) / n
        for (let q = 0; q < wdt; q++) img.set(x + q, y, q === 0 && wdt > 1 ? BARK.hi : col)
        // Сніг на верхньому боці похилих гілок.
        if (Math.abs(y1 - y0) < Math.abs(x1 - x0) * 1.6 && hash(Math.round(x), Math.round(y), 91) < 0.75) img.set(x, y - 1, '#f2f6fb')
      }
    }
    img.rect(11, 18, 4, 19, BARK.mid)
    img.vline(11, 18, 36, BARK.hi)
    img.vline(14, 18, 36, BARK.lo)
    line(12, 20, 4, 12, BARK.mid, 2)
    line(4, 12, 2, 6, BARK.lo)
    line(6, 14, 7, 7, BARK.lo)
    line(13, 18, 13, 6, BARK.mid, 2)
    line(13, 6, 10, 1, BARK.lo)
    line(14, 9, 18, 4, BARK.lo)
    line(14, 22, 22, 14, BARK.mid, 2)
    line(22, 14, 24, 9, BARK.lo)
    line(19, 17, 23, 18, BARK.lo)
    // Сніг біля коріння.
    mound(img, 13, 37, 6, 2, 13)
    return img.outline(OUTLINE, 0.85)
  }

  /** Сніговик: три кулі, вуглинки, морква, руки-гілочки, червоний шарф і відро на голові. */
  function snowman() {
    const img = new Img(20, 28)
    shadow(img, 10, 26, 8, 2, 0.32)
    const ball = (cx, cy, r) => {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = (x + 0.5 - cx) / r
          const dy = (y + 0.5 - cy) / r
          if (dx * dx + dy * dy > 1) continue
          const l = -(dx * 0.55 + dy * 0.8)
          img.set(x, y, ramp(SNOW_PAL, 0.45 + l * 0.45, x, y))
        }
    }
    ball(10, 20.5, 6)
    ball(10, 12.5, 4.5)
    ball(10, 6.5, 3.5)
    // Руки-гілочки.
    for (const [x, y] of [[5, 12], [4, 11], [3, 10], [2, 9], [3, 8]]) img.set(x, y, BARK.mid)
    for (const [x, y] of [[15, 12], [16, 11], [17, 10], [18, 9], [18, 11]]) img.set(x, y, BARK.mid)
    // Шарф.
    img.hline(7, 13, 9, '#c8372d')
    img.hline(7, 12, 10, '#8e2a1f')
    img.vline(12, 10, 13, '#c8372d')
    img.set(13, 12, '#8e2a1f')
    // Обличчя.
    img.set(9, 6, '#1e1e24')
    img.set(11, 6, '#1e1e24')
    img.set(10, 7, '#f08a2c')
    img.set(11, 7, '#d0621a')
    // Ґудзики-вуглинки.
    img.set(10, 12, '#1e1e24')
    img.set(10, 14, '#1e1e24')
    img.set(10, 18, '#1e1e24')
    // Відро замість капелюха.
    img.rect(7, 1, 6, 3, '#6b7a8a')
    img.hline(7, 12, 1, '#9aa6b4')
    img.hline(6, 13, 3, '#4d5463')
    img.set(12, 2, '#4d5463')
    return img.outline(OUTLINE, 0.85)
  }

  /** Розкопаний замет: синювата ямка з грудками — лежить на землі (рушій дає їй танути). */
  function dug() {
    const img = new Img(20, 10)
    img.ellipse(10, 5, 9, 4.2, '#bfd0e8')
    img.ellipse(10, 5.4, 7.5, 3.2, '#94abcf')
    img.ellipse(10.5, 5.8, 5.5, 2.2, '#7f98bf')
    img.hline(5, 14, 2, '#f2f6fb')
    for (const [x, y] of [[2, 3], [17, 4], [3, 7], [16, 7], [12, 1]]) {
      img.set(x, y, '#ffffff')
      img.set(x + 1, y, '#d2dff0')
    }
    return img
  }

  /* ───────── Запуск ───────── */

  const t = terrain()
  const walk = walkGrid(t)
  return {
    terrain: t,
    ground: groundImage(t),
    foam: shoreImage(t),
    walk,
    slots: nodeSlots(t, walk),
    sprites: {
      w_drift: drift(),
      w_drift_big: bigDrift(),
      w_ice: iceChunk(),
      w_brush: brushwood(),
      w_pine: snowyPine(28, 46, [[2, 6, 12], [10, 9, 13], [19, 12, 15]]),
      w_pine_s: snowyPine(20, 32, [[2, 4, 9], [8, 7, 10], [15, 8, 10]]),
      w_rock: snowRock(true),
      w_rock_s: snowRock(false),
      w_dead_tree: deadTree(),
      w_snowman: snowman(),
      w_dug: dug(),
    },
  }
}
