/**
 * Сучасна колекція для хатинки (аркуш home-decor.png, спрайти hd_*): скандинавські меблі,
 * рослини, техніка, світильники, неон і гірлянди. Тим самим пікселем, що й решта острова, але
 * детальніше: кожен матеріал — рампа з 5 тонів (світло зверху зліва), об'ємні кулі й циліндри
 * зафарбовано за нормаллю, а не «плямою». Темний контур і м'яка тінь — як у решти меблів.
 *
 * Розміри — у масштабі хати: ліжко 38×45, комод 28×26, шафа 26×35. Якір — низ по центру.
 * Де річ світить (лампа, екран, неон) — центр світла описано в src/game/walk/interior.js.
 */

const K = '#2b1d16'

/* ───────── Кольори ───────── */

const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
/** Тон кольору: t > 0 — до теплого світла, t < 0 — до холодної тіні (тіні не сірі, а фіолетуваті). */
function tone(hex, t) {
  const [r, g, b] = hx(hex)
  const [tr, tg, tb] = t < 0 ? [26, 18, 34] : [255, 248, 228]
  const k = Math.abs(t)
  return toHex(r + (tr - r) * k, g + (tg - g) * k, b + (tb - b) * k)
}
/** Рампа матеріалу: L — відблиск, l — світла грань, b — основа, d — тінь, D — глибока тінь. */
const ramp = (hex) => ({ L: tone(hex, 0.34), l: tone(hex, 0.15), b: hex, d: tone(hex, -0.22), D: tone(hex, -0.42) })

const C = {
  oak: '#c99a63',
  walnut: '#7a4e2f',
  black: '#2c2a31',
  char: '#45424c',
  white: '#ece6da',
  cream: '#e6d7bb',
  linen: '#d9cbb0',
  sage: '#8ea784',
  terra: '#c66a45',
  mustard: '#dba23a',
  navy: '#34496e',
  blush: '#e2a397',
  brass: '#c9a046',
  steel: '#b9bec6',
  marble: '#e7e4df',
  leaf: '#4c8a43',
  leafL: '#79b85a',
  cognac: '#a8592c',
  grey: '#8f96a3',
  rope: '#c7a874',
}

/** Детермінований «шум» для фактури (килими, ворс, мотузка). */
const noise = (x, y, s = 1) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 982451653)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/* ───────── Полотно з інструментами ───────── */

function canvas(Img, w, h) {
  const im = new Img(w, h)
  const c = {
    im,
    w,
    h,
    px: (x, y, col, a = 1) => im.set(x, y, col, a),
    rect: (x, y, ww, hh, col, a = 1) => ww > 0 && hh > 0 && im.rect(x, y, ww, hh, col, a),
    hl: (x0, x1, y, col, a = 1) => im.hline(x0, x1, y, col, a),
    vl: (x, y0, y1, col, a = 1) => im.vline(x, y0, y1, col, a),
    /** Прямокутна деталь із фаскою: світлий верх і лівий край, темний низ і правий. r — заокруглення кутів. */
    panel(x, y, ww, hh, base, { r = 0, flat = false } = {}) {
      const R = ramp(base)
      for (let j = 0; j < hh; j++)
        for (let i = 0; i < ww; i++) {
          if (r && (i < r || i >= ww - r) && (j < r || j >= hh - r)) {
            const cx = i < r ? r - 0.5 : ww - r - 0.5
            const cy = j < r ? r - 0.5 : hh - r - 0.5
            if (Math.hypot(i - cx, j - cy) > r - 0.35) continue
          }
          let col = R.b
          if (!flat) {
            if (j === 0) col = R.L
            else if (j === hh - 1) col = R.D
            else if (i === 0) col = R.l
            else if (i === ww - 1) col = R.d
          }
          im.set(x + i, y + j, col)
        }
    },
    /** Куля / подушка / диск: тон за нормаллю (світло зверху зліва й трохи на глядача). */
    ball(cx, cy, rx, ry, base, { a = 1, soft = 0 } = {}) {
      const R = ramp(base)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx
          const dy = (y + 0.5 - cy) / ry
          const d2 = dx * dx + dy * dy
          if (d2 > 1) continue
          const l = -dx * 0.45 - dy * 0.6 + Math.sqrt(1 - d2) * 0.65 + soft
          const col = l > 0.92 ? R.L : l > 0.66 ? R.l : l > 0.3 ? R.b : l > 0.02 ? R.d : R.D
          im.set(x, y, col, a)
        }
    },
    /** Вертикальний циліндр (вазон, ніжка, банка): світла смуга ліворуч, тінь праворуч. */
    cyl(x, y, ww, hh, base) {
      const R = ramp(base)
      for (let i = 0; i < ww; i++) {
        const t = (i + 0.5) / ww
        const col = t < 0.18 ? R.l : t < 0.34 ? R.L : t < 0.68 ? R.b : t < 0.86 ? R.d : R.D
        for (let j = 0; j < hh; j++) im.set(x + i, y + j, col)
      }
    },
    line(x0, y0, x1, y1, col, a = 1) {
      x0 = Math.round(x0)
      y0 = Math.round(y0)
      x1 = Math.round(x1)
      y1 = Math.round(y1)
      const dx = Math.abs(x1 - x0)
      const dy = -Math.abs(y1 - y0)
      const sx = x0 < x1 ? 1 : -1
      const sy = y0 < y1 ? 1 : -1
      let err = dx + dy
      for (;;) {
        im.set(x0, y0, col, a)
        if (x0 === x1 && y0 === y1) break
        const e2 = 2 * err
        if (e2 >= dy) {
          err += dy
          x0 += sx
        }
        if (e2 <= dx) {
          err += dx
          y0 += sy
        }
      }
    },
    /**
     * Листок: витягнутий еліпс від основи (x, y) під кутом ang (рад, 0 — праворуч, −π/2 — вгору).
     * Верхня половина світліша, по центру — прожилка; holes — розрізи монстери.
     */
    leaf(x, y, ang, len, wid, base, { holes = false, rib = true } = {}) {
      const R = ramp(base)
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      const ext = Math.ceil(len + wid)
      for (let py = Math.floor(y - ext); py <= y + ext; py++)
        for (let px = Math.floor(x - ext); px <= x + ext; px++) {
          const rx = px + 0.5 - x
          const ry = py + 0.5 - y
          const u = rx * ca + ry * sa // уздовж
          const v = -rx * sa + ry * ca // упоперек
          if (u < 0 || u > len) continue
          const half = wid * Math.sin((Math.PI * u) / len) ** 0.8
          if (Math.abs(v) > half) continue
          if (holes && u > len * 0.25 && u < len * 0.9 && Math.abs(v) > half * 0.45 && Math.floor(u / 2.2) % 2 === 0) continue
          let col = v < -half * 0.35 ? R.l : v > half * 0.45 ? R.d : R.b
          if (rib && Math.abs(v) < 0.5 && u > 1) col = R.D
          if (u > len * 0.82 && v < 0) col = R.L
          im.set(px, py, col)
        }
    },
  }
  return c
}

/** Готовий спрайт: рамка 1 px під контур, м'яка тінь під ногами (grounded), темний контур. */
function finish(Img, c, { grounded = true, contour = 1, shadowW = null } = {}) {
  const s = new Img(c.w + 2, c.h + 3)
  if (grounded) s.ellipse((c.w + 2) / 2, c.h + 1, (shadowW ?? c.w) / 2 + 1, 2, '#1a0e06', 0.3)
  s.blit(c.im, 1, 1)
  return contour ? s.outline(K, contour) : s
}

/* ───────── Меблі на підлозі ───────── */

/** Дугова лампа: мармурова основа, латунна дуга, чорний купол із теплим світлом усередині. */
function arcLamp(Img) {
  const c = canvas(Img, 26, 42)
  c.ball(5.5, 39.5, 5.5, 2.5, C.marble)
  c.hl(2, 9, 41, tone(C.marble, -0.35))
  // Стійка й дуга (дві лінії: світла й тіньова — щоб латунь була кругла).
  const B = ramp(C.brass)
  c.vl(5, 12, 37, B.l)
  c.vl(6, 12, 37, B.d)
  for (let a = Math.PI; a >= 0.28; a -= 0.02) {
    const x = 13 + 8 * Math.cos(a)
    const y = 12 - 8 * Math.sin(a)
    c.px(x, y, a > Math.PI / 2 ? B.l : B.b)
    c.px(x, y + 1, B.d)
  }
  c.vl(21, 9, 10, B.d)
  // Купол.
  const S = ramp(C.black)
  for (let y = 10; y <= 15; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, 1 - ((15.5 - y) / 6) ** 2)) * 5)
    for (let x = 21 - half; x <= 21 + half; x++) c.px(x, y, x < 19 && y < 13 ? S.l : x > 23 ? S.D : S.b)
  }
  c.px(19, 11, S.L)
  c.hl(16, 26, 15, B.b)
  c.hl(17, 25, 16, '#ffe9b0')
  c.hl(19, 23, 16, '#fffaf0')
  return finish(Img, c, { shadowW: 14 })
}

/** Сучасна канапа: шавлієвий букле, три подушки спинки, гірчична й теракотова подушки, плед. */
function sofa(Img) {
  const c = canvas(Img, 46, 25)
  const base = C.sage
  c.panel(3, 2, 40, 12, tone(base, -0.08), { r: 2 })
  for (let i = 0; i < 3; i++) {
    c.panel(6 + i * 12, 4, 11, 9, base, { r: 2 })
    c.hl(8 + i * 12, 14 + i * 12, 5, tone(base, 0.4))
  }
  // Подушки-акценти з візерунком.
  c.panel(7, 7, 9, 7, C.mustard, { r: 1 })
  for (let k = 0; k < 3; k++) c.px(9 + k * 2, 10, tone(C.mustard, -0.3))
  c.panel(30, 7, 9, 7, C.terra, { r: 1 })
  c.line(31, 12, 37, 8, tone(C.terra, 0.35))
  // Сидіння.
  c.panel(6, 13, 18, 6, base, { r: 1 })
  c.panel(23, 13, 17, 6, base, { r: 1 })
  c.hl(7, 22, 14, tone(base, 0.4))
  c.hl(24, 38, 14, tone(base, 0.4))
  // Підлокітники.
  c.panel(0, 7, 7, 14, base, { r: 2 })
  c.panel(39, 7, 7, 14, base, { r: 2 })
  c.hl(1, 5, 8, tone(base, 0.45))
  // Царга.
  c.panel(6, 18, 34, 3, tone(base, -0.2))
  // Плед крупної в'язки, перекинутий через правий підлокітник.
  const W = ramp(C.cream)
  for (let y = 6; y <= 20; y++)
    for (let x = 37; x <= 43; x++) {
      const braid = (x - 37) % 3 === 1 ? ((y + (x > 40 ? 1 : 0)) % 2 ? W.d : W.b) : (y % 2 ? W.l : W.b)
      c.px(x, y, braid)
    }
  for (let x = 37; x <= 43; x += 2) c.vl(x, 21, 22, W.d)
  // Ніжки.
  for (const x of [3, 41]) {
    c.vl(x, 21, 24, tone(C.walnut, 0.2))
    c.vl(x + 1, 21, 23, C.walnut)
  }
  return finish(Img, c)
}

/** Журнальний столик: дубова стільниця на чорних «шпильках», книжки, чашка й сукулент. */
function coffeeTable(Img) {
  const c = canvas(Img, 32, 17)
  // Ніжки-шпильки.
  const M = ramp(C.black)
  for (const [x0, x1] of [[3, 5], [8, 6], [24, 26], [29, 27]]) c.line(x0, 10, x1, 16, M.b)
  c.panel(0, 5, 32, 5, C.oak, { r: 2 })
  c.panel(1, 9, 30, 2, tone(C.oak, -0.25))
  for (let x = 4; x < 28; x += 7) c.hl(x, x + 3, 7, tone(C.oak, 0.12)) // волокна
  // Стос книжок.
  c.panel(3, 4, 10, 2, C.navy)
  c.panel(4, 2, 8, 2, C.terra)
  c.panel(3, 0, 9, 2, C.cream)
  c.vl(11, 0, 1, tone(C.cream, -0.3))
  // Чашка з паром.
  c.cyl(16, 3, 4, 3, C.white)
  c.px(20, 4, C.white)
  c.hl(16, 19, 3, '#5a3a24')
  c.px(17, 1, '#ffffff', 0.5)
  c.px(18, 0, '#ffffff', 0.4)
  // Сукулент у бетонному горщику.
  c.cyl(24, 3, 5, 3, C.grey)
  c.ball(26.5, 2, 3, 2, '#7fae84')
  c.px(26, 1, '#bfe0b0')
  return finish(Img, c)
}

/** Тумба під телевізор: горіх із рейковими дверцятами, плаский екран із заходом сонця, саундбар, вазон. */
function tvConsole(Img) {
  const c = canvas(Img, 44, 34)
  // Тумба.
  c.panel(0, 20, 44, 10, C.walnut, { r: 1 })
  const Wn = ramp(C.walnut)
  for (let x = 2; x <= 41; x++) {
    if (x === 21 || x === 22) continue
    c.vl(x, 22, 27, x % 2 ? Wn.d : Wn.b)
  }
  c.vl(21, 22, 27, Wn.D)
  c.vl(22, 22, 27, Wn.l)
  c.px(19, 25, C.brass)
  c.px(24, 25, C.brass)
  c.hl(1, 42, 21, Wn.L)
  for (const [x0, x1] of [[4, 2], [39, 41]]) c.line(x0, 30, x1, 33, C.black)
  // Телевізор.
  c.panel(5, 1, 34, 18, C.black, { r: 1 })
  for (let y = 2; y <= 16; y++)
    for (let x = 6; x <= 37; x++) {
      const t = (y - 2) / 14
      let col = t < 0.2 ? '#3d2f5c' : t < 0.38 ? '#7c4a7a' : t < 0.52 ? '#e07a6a' : t < 0.58 ? '#ffc07a' : t < 0.78 ? '#2f5f8f' : '#244a74'
      const sx = x - 26
      const sy = y - 9.5
      if (sx * sx + sy * sy * 1.6 < 9 && y < 10) col = y < 8 ? '#fff0b0' : '#ffd27a' // сонце над обрієм
      if (y >= 10 && y <= 15 && Math.abs(x - 26) < 2 + (y - 10) && (x + y) % 3 === 0) col = '#ffc07a' // доріжка
      if (y >= 7 && y <= 9 && x >= 9 && x <= 15 - (y - 7)) col = y === 9 ? '#1c3a2a' : '#2f5a3a' // острівець
      c.px(x, y, col)
    }
  c.line(8, 15, 15, 2, '#ffffff', 0.12)
  c.line(10, 15, 17, 2, '#ffffff', 0.08)
  c.px(22, 17, '#ff5050')
  // Саундбар і ніжка.
  c.panel(13, 18, 18, 2, C.char)
  for (let x = 14; x <= 29; x += 2) c.px(x, 18, tone(C.char, -0.3))
  // Вазон праворуч.
  c.cyl(38, 15, 5, 5, C.white)
  c.leaf(40, 15, -2.0, 7, 2.2, C.leaf)
  c.leaf(40, 15, -1.2, 8, 2.2, C.leafL)
  c.leaf(41, 15, -0.5, 5, 1.8, C.leaf)
  return finish(Img, c)
}

/** Монстера в рифленому вазоні на дерев'яній підставці. */
function monstera(Img) {
  const c = canvas(Img, 24, 36)
  // Підставка.
  const O = ramp(C.oak)
  for (const [x0, x1] of [[8, 6], [15, 17]]) {
    c.line(x0, 30, x1, 35, O.b)
    c.line(x0 + 1, 30, x1 + 1, 35, O.d)
  }
  c.hl(8, 16, 32, O.d)
  // Вазон із ребрами.
  c.cyl(6, 23, 12, 8, C.white)
  for (let x = 7; x <= 16; x += 2) c.vl(x, 24, 29, tone(C.white, -0.12))
  c.hl(6, 17, 23, tone(C.white, 0.4))
  c.hl(6, 17, 30, tone(C.white, -0.35))
  c.ball(12, 23, 5, 1.2, '#4a3226')
  // Стебла й листя (дальні темніші).
  const stems = [[-2.6, 11, 4.6, '#3e7a3a', 14], [-0.6, 11, 4.4, '#3e7a3a', 14], [-2.0, 12, 5, C.leaf, 12], [-1.1, 12, 5, C.leaf, 12], [-1.55, 13, 5.2, '#5a9a4a', 10]]
  for (const [ang, len, wid, col, sl] of stems) {
    const bx = 12 + Math.cos(ang) * sl * 0.55
    const by = 23 + Math.sin(ang) * sl * 0.55
    c.line(12, 23, bx, by, tone(col, -0.2))
    c.leaf(bx, by, ang, len, wid, col, { holes: true })
  }
  return finish(Img, c, { shadowW: 14 })
}

/** Сансев'єрія у теракотовому горщику: смугасте листя з жовтою облямівкою. */
function snakePlant(Img) {
  const c = canvas(Img, 13, 25)
  const blades = [[2, 10, -0.18], [4, 4, -0.06], [6, 0, 0.02], [8, 6, 0.1], [10, 11, 0.2]]
  for (const [bx, top, lean] of blades) {
    for (let y = top; y < 18; y++) {
      const k = (18 - y) / (18 - top)
      const x = Math.round(bx + 0.5 + lean * (18 - y))
      const w = k > 0.85 ? 1 : 2
      for (let i = 0; i < w; i++) c.px(x + i, y, (y + i) % 3 === 0 ? '#2f5a34' : i === 0 ? '#5a8a4a' : '#3f6f3a')
      if (w === 2) c.px(x + 2, y, '#d8c25a')
    }
  }
  c.cyl(2, 17, 9, 7, C.terra)
  c.hl(1, 11, 17, tone(C.terra, 0.3))
  c.hl(1, 11, 18, tone(C.terra, -0.15))
  return finish(Img, c, { shadowW: 9 })
}

/** Ретро-холодильник: кремовий, хромовані ручки, магнітики й дитячий малюнок. */
function fridge(Img) {
  const c = canvas(Img, 20, 38)
  c.panel(0, 0, 20, 36, C.cream, { r: 3 })
  c.hl(2, 17, 1, tone(C.cream, 0.5))
  c.vl(1, 3, 33, tone(C.cream, 0.25))
  c.hl(1, 18, 11, tone(C.cream, -0.45))
  c.hl(1, 18, 12, tone(C.cream, 0.2))
  const S = ramp(C.steel)
  for (const [y0, y1] of [[4, 9], [15, 24]]) {
    c.vl(16, y0, y1, S.L)
    c.vl(17, y0, y1, S.d)
  }
  // Магнітики й малюнок.
  c.panel(3, 15, 7, 7, '#fbf8f0', { flat: true })
  c.ball(5, 18, 1.4, 1.4, '#ffd23c')
  c.hl(4, 8, 21, '#5aa83e')
  c.px(7, 19, '#c8372d')
  c.px(8, 18, '#c8372d')
  c.px(6, 15, '#d9493a')
  c.px(5, 5, '#3a6fc0')
  c.px(9, 4, '#5aa83e')
  c.px(11, 7, '#e2485a')
  c.panel(4, 26, 5, 3, '#fbf8f0', { flat: true })
  c.hl(5, 7, 27, '#8a8a90')
  c.px(6, 25, '#d9a33a')
  // Цоколь.
  c.panel(1, 33, 18, 3, C.char)
  for (let x = 3; x <= 16; x += 2) c.px(x, 34, tone(C.char, -0.35))
  c.hl(2, 17, 36, '#1a1a20')
  c.hl(2, 17, 37, '#1a1a20')
  return finish(Img, c)
}

/** Сучасна кухня: шавлієві фасади з латунними ручками, мармурова стільниця, мийка, духовка й кавоварка. */
function kitchen(Img) {
  const c = canvas(Img, 40, 32)
  // Фасади.
  c.panel(0, 13, 40, 17, C.sage)
  const Sg = ramp(C.sage)
  c.vl(14, 14, 28, Sg.D)
  c.vl(27, 14, 28, Sg.D)
  c.vl(15, 14, 28, Sg.l)
  c.vl(28, 14, 28, Sg.l)
  c.hl(15, 26, 20, Sg.D)
  c.hl(15, 26, 21, Sg.l)
  for (const [x, y] of [[17, 16], [17, 23], [30, 16]]) c.hl(x, x + 6, y, C.brass)
  // Духовка: чорне скло з теплим вогником.
  c.panel(2, 15, 11, 13, C.black, { r: 1 })
  c.hl(3, 11, 16, C.steel)
  c.panel(4, 19, 7, 6, '#3a2420', { flat: true })
  c.hl(5, 9, 23, '#e8892d', 0.8)
  c.hl(6, 8, 22, '#ffc060', 0.6)
  c.panel(0, 29, 40, 2, tone(C.sage, -0.5), { flat: true })
  // Стільниця.
  c.panel(0, 10, 40, 4, C.marble)
  c.line(4, 11, 9, 12, '#c9c4bd')
  c.line(26, 12, 31, 11, '#c9c4bd')
  // Варильна поверхня з каструлькою.
  c.hl(2, 12, 10, '#1f1d24')
  c.cyl(4, 4, 7, 6, C.steel)
  c.hl(3, 11, 4, tone(C.steel, 0.4))
  c.hl(1, 3, 6, C.black)
  c.px(6, 2, '#ffffff', 0.45)
  c.px(8, 1, '#ffffff', 0.35)
  c.px(7, 0, '#ffffff', 0.25)
  // Мийка й змішувач.
  c.hl(16, 23, 11, tone(C.steel, -0.3))
  c.line(20, 10, 20, 4, C.steel)
  c.line(21, 4, 23, 4, C.steel)
  c.px(23, 5, C.steel)
  c.px(19, 4, tone(C.steel, 0.4))
  // Дошка з зеленню.
  c.panel(25, 3, 5, 8, C.oak, { r: 1 })
  c.ball(32, 8, 2, 1.8, '#5aa83e')
  c.cyl(31, 9, 3, 2, C.terra)
  // Кавоварка.
  c.panel(34, 1, 6, 10, C.black, { r: 1 })
  c.hl(35, 38, 3, C.steel)
  c.cyl(35, 8, 3, 2, C.white)
  c.px(37, 5, '#5aa8ff')
  return finish(Img, c)
}

/** Ліжко-платформа: м'яке узголів'я у «смужку», біла ковдра зі складками, плед і подушки. */
function platformBed(Img) {
  const c = canvas(Img, 44, 42)
  // Узголів'я.
  const hb = '#8f9aa8'
  c.panel(2, 0, 40, 13, hb, { r: 2 })
  const H = ramp(hb)
  for (let x = 5; x <= 38; x += 4) {
    c.vl(x, 2, 11, H.d)
    c.vl(x + 1, 2, 11, H.l)
  }
  // Каркас.
  c.panel(0, 33, 44, 5, C.oak, { r: 1 })
  c.hl(1, 42, 34, tone(C.oak, 0.35))
  for (const x of [2, 40]) c.rect(x, 38, 2, 3, tone(C.oak, -0.4))
  // Ковдра.
  c.panel(2, 13, 40, 22, C.white, { r: 2 })
  const Wt = ramp(C.white)
  for (const [x0, y0, x1, y1] of [[8, 22, 14, 27], [30, 21, 35, 26], [18, 29, 26, 30]]) c.line(x0, y0, x1, y1, Wt.d)
  c.vl(2, 15, 33, Wt.d)
  c.vl(41, 15, 33, Wt.D)
  // Подушки.
  c.panel(5, 11, 16, 7, C.white, { r: 2 })
  c.panel(23, 11, 16, 7, C.white, { r: 2 })
  c.hl(7, 18, 12, Wt.L)
  c.hl(25, 36, 12, Wt.L)
  c.panel(10, 15, 9, 6, C.sage, { r: 1 })
  c.panel(25, 15, 9, 6, C.mustard, { r: 1 })
  c.line(26, 20, 33, 16, tone(C.mustard, 0.3))
  // Плед у ногах, з бахромою.
  const T = ramp(C.terra)
  for (let y = 26; y <= 32; y++)
    for (let x = 2; x <= 41; x++) c.px(x, y, y === 26 ? T.L : (x + (y % 2)) % 3 === 0 ? T.d : y === 32 ? T.D : T.b)
  for (let x = 3; x <= 40; x += 2) c.px(x, 33, T.d)
  return finish(Img, c)
}

/** Стелаж-куби 3×3: книжки, платівки, вазон, кошик, ваза й рамка. */
function cubeShelf(Img) {
  const c = canvas(Img, 34, 36)
  c.panel(0, 0, 34, 36, C.white)
  const inner = tone(C.white, -0.38)
  const spines = ['#c66a45', '#34496e', '#dba23a', '#8ea784', '#e6d7bb', '#7a4e2f', '#e2a397', '#45424c']
  const cells = []
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) cells.push([1 + i * 11, 1 + j * 11])
  for (const [x, y] of cells) {
    c.rect(x, y, 10, 10, inner)
    c.hl(x, x + 9, y, tone(inner, -0.3))
    c.vl(x, y, y + 9, tone(inner, -0.15))
  }
  const fill = [
    // книжки рівно
    (x, y) => {
      for (let k = 0; k < 7; k++) {
        const h = 6 + ((k * 5) % 4)
        const col = spines[(k * 3) % spines.length]
        c.vl(x + 1 + k, y + 10 - h, y + 9, col)
        c.px(x + 1 + k, y + 10 - h, tone(col, 0.35))
      }
    },
    // вазон із пагонами, що звисають
    (x, y) => {
      c.cyl(x + 3, y + 6, 4, 4, C.terra)
      c.ball(x + 5, y + 5, 3, 2, C.leaf)
      for (const [dx, len] of [[2, 6], [6, 8], [8, 5]]) for (let k = 0; k < len; k++) c.px(x + dx + (k % 2), y + 6 + k, k % 3 ? C.leafL : C.leaf)
    },
    // платівки в конвертах
    (x, y) => {
      for (let k = 0; k < 4; k++) c.panel(x + 1 + k * 2, y + 2, 2, 8, ['#d9493a', '#2c2a31', '#dba23a', '#3a6fc0'][k], { flat: true })
      c.ball(x + 8, y + 6, 1.8, 3.5, '#1a1a20')
    },
    // кошик
    (x, y) => {
      for (let yy = y + 3; yy <= y + 9; yy++) for (let xx = x + 1; xx <= x + 8; xx++) c.px(xx, yy, (xx + yy) % 2 ? C.rope : tone(C.rope, -0.25))
      c.hl(x + 1, x + 8, y + 3, tone(C.rope, 0.3))
    },
    // ваза з гілочкою
    (x, y) => {
      c.ball(x + 5, y + 7, 2.5, 2.8, C.blush)
      c.line(x + 5, y + 4, x + 3, y + 1, C.walnut)
      c.line(x + 5, y + 4, x + 8, y + 1, C.walnut)
      for (const [dx, dy] of [[3, 1], [8, 1], [4, 2], [7, 2]]) c.px(x + dx, y + dy, '#f6f0e2')
    },
    // книжки похило + куля
    (x, y) => {
      for (let k = 0; k < 4; k++) c.vl(x + 1 + k, y + 3, y + 9, spines[(k + 2) % spines.length])
      c.line(x + 5, y + 9, x + 8, y + 3, '#c66a45')
      c.line(x + 6, y + 9, x + 9, y + 4, '#c66a45')
    },
    // рамка з фото
    (x, y) => {
      c.panel(x + 2, y + 2, 6, 8, C.oak, { flat: true })
      c.rect(x + 3, y + 3, 4, 6, '#9cc8e8')
      c.rect(x + 3, y + 7, 4, 2, '#5a9a4a')
    },
    // свічка й книжки лежма
    (x, y) => {
      c.panel(x + 1, y + 8, 8, 2, C.navy, { flat: true })
      c.panel(x + 2, y + 6, 6, 2, C.mustard, { flat: true })
      c.cyl(x + 3, y + 3, 3, 3, C.cream)
      c.px(x + 4, y + 2, '#ffd35a')
    },
    // вінілова колонка
    (x, y) => {
      c.panel(x + 2, y + 2, 6, 8, C.walnut, { r: 1 })
      c.ball(x + 5, y + 6, 2, 2, C.black)
      c.px(x + 5, y + 3, C.black)
    },
  ]
  cells.forEach(([x, y], k) => fill[k](x, y))
  c.panel(0, 33, 34, 3, tone(C.white, -0.15), { flat: true })
  return finish(Img, c)
}

/** Крісло «лаунж»: коньячна шкіра в горіховій оболонці, хромована ніжка-зірка. */
function loungeChair(Img) {
  const c = canvas(Img, 26, 27)
  const M = ramp(C.black)
  // Ніжка-зірка.
  c.vl(12, 20, 22, C.steel)
  c.vl(13, 20, 22, tone(C.steel, -0.3))
  for (const [x1, y1] of [[3, 25], [22, 25], [8, 26], [17, 26]]) c.line(12.5, 23, x1, y1, M.b)
  // Оболонка спинки й подушки.
  c.panel(4, 0, 18, 16, C.walnut, { r: 4 })
  c.panel(6, 2, 14, 13, C.cognac, { r: 3 })
  const L = ramp(C.cognac)
  c.hl(7, 18, 7, L.d)
  c.hl(7, 18, 8, L.l)
  c.vl(12, 3, 13, L.d)
  c.hl(8, 17, 3, L.L)
  // Сидіння.
  c.panel(3, 14, 20, 7, C.walnut, { r: 2 })
  c.panel(4, 14, 18, 5, C.cognac, { r: 2 })
  c.hl(6, 19, 15, L.L)
  // Підлокітники.
  c.panel(0, 11, 6, 3, C.black, { r: 1 })
  c.panel(20, 11, 6, 3, C.black, { r: 1 })
  c.vl(4, 13, 16, M.d)
  c.vl(21, 13, 16, M.d)
  return finish(Img, c)
}

/** Крісло-мішок. */
function beanBag(Img) {
  const c = canvas(Img, 18, 14)
  c.ball(9, 8, 9, 6, C.mustard)
  c.ball(8, 5, 5, 2.4, tone(C.mustard, -0.18))
  c.line(3, 8, 8, 13, tone(C.mustard, -0.3))
  c.line(14, 5, 16, 10, tone(C.mustard, -0.3))
  c.px(5, 4, tone(C.mustard, 0.45))
  return finish(Img, c, { shadowW: 16 })
}

/** Приліжковий столик із лампою: керамічна ніжка, лляний абажур, що світиться знизу. */
function sideLamp(Img) {
  const c = canvas(Img, 16, 28)
  // Столик.
  c.ball(8, 16, 8, 1.8, C.oak)
  c.hl(1, 15, 17, tone(C.oak, -0.35))
  c.cyl(7, 18, 2, 8, C.black)
  c.ball(8, 26.5, 4, 1.3, C.black)
  // Лампа.
  c.ball(8, 11.5, 3, 3.2, C.terra)
  c.vl(8, 7, 8, C.brass)
  for (let y = 1; y <= 7; y++) {
    const half = 3 + Math.floor((y - 1) / 2.5)
    for (let x = 8 - half; x <= 8 + half - 1; x++) c.px(x, y, x < 8 - half + 2 ? '#f6edda' : x > 8 + half - 3 ? '#cdbb98' : '#e8dcc0')
  }
  c.hl(3, 12, 8, '#fff3c4')
  c.hl(5, 10, 8, '#ffffff')
  // Книжка на столику.
  c.panel(11, 13, 4, 2, C.navy, { flat: true })
  return finish(Img, c, { shadowW: 10 })
}

/** Робоче місце: білий стіл на дубових ніжках, монітор із кодом, клавіатура, лампа й вазон. */
function deskSetup(Img) {
  const c = canvas(Img, 38, 33)
  const O = ramp(C.oak)
  // Ніжки.
  for (const [x0, x1] of [[4, 2], [6, 8], [31, 29], [33, 35]]) c.line(x0, 19, x1, 32, O.b)
  c.hl(3, 34, 26, O.d)
  // Стільниця.
  c.panel(0, 16, 38, 4, C.white)
  c.panel(24, 19, 11, 4, C.white)
  c.hl(28, 31, 21, tone(C.white, -0.4))
  // Монітор.
  c.panel(10, 1, 19, 12, C.black, { r: 1 })
  for (let y = 2; y <= 11; y++) for (let x = 11; x <= 27; x++) c.px(x, y, '#1f2740')
  const code = [[12, 3, 4, '#c678dd'], [17, 3, 6, '#e5c07b'], [13, 5, 7, '#61afef'], [21, 5, 3, '#98c379'], [13, 7, 3, '#e06c75'], [17, 7, 8, '#abb2bf'], [12, 9, 5, '#c678dd'], [18, 9, 4, '#98c379']]
  for (const [x, y, len, col] of code) c.hl(x, x + len - 1, y, col)
  c.vl(25, 9, 9, '#ffffff')
  c.rect(19, 13, 2, 2, C.char)
  c.hl(16, 23, 15, C.char)
  // Клавіатура й мишка.
  c.hl(11, 22, 17, tone(C.white, -0.15))
  for (let x = 11; x <= 22; x += 2) c.px(x, 17, tone(C.white, -0.35))
  c.px(25, 17, C.char)
  // Лампа.
  c.ball(4, 15.5, 2.5, 1.2, C.black)
  c.line(4, 15, 3, 9, C.black)
  c.line(3, 9, 7, 5, C.black)
  c.panel(6, 3, 4, 3, C.black, { r: 1 })
  c.hl(6, 9, 6, '#fff3c4')
  // Вазон і чашка.
  c.cyl(31, 12, 5, 4, C.white)
  c.leaf(33, 12, -1.9, 6, 2, C.leaf)
  c.leaf(33, 12, -0.9, 6, 2, C.leafL)
  c.leaf(33, 12, -2.6, 5, 1.6, C.leaf)
  c.cyl(27, 13, 3, 3, C.terra)
  return finish(Img, c)
}

/** Котячий будиночок: сизалеві стовпчики, полиці, хатка з круглим входом, помпон — і котик нагорі. */
function catTree(Img) {
  const c = canvas(Img, 20, 37)
  const rope = (x, y0, y1) => {
    for (let y = y0; y <= y1; y++) {
      c.px(x, y, y % 2 ? '#d7bd8a' : '#b89a62')
      c.px(x + 1, y, y % 2 ? '#c4a672' : '#a0844e')
      c.px(x + 2, y, '#8a6e40')
    }
  }
  const pad = '#cfc3b0'
  c.panel(0, 33, 20, 4, pad, { r: 1 })
  rope(14, 7, 33)
  rope(3, 28, 33)
  c.panel(0, 19, 12, 10, pad, { r: 1 })
  c.ball(6, 24.5, 2.6, 3, '#3a3036')
  c.panel(7, 5, 13, 3, pad, { r: 1 })
  c.panel(0, 17, 11, 3, pad, { r: 1 })
  // Помпон.
  c.vl(9, 8, 12, '#efe9df')
  c.ball(9, 13.5, 1.6, 1.6, '#e2485a')
  // Котик клубочком.
  c.ball(13, 2.8, 5, 2.6, '#a5a0a8')
  c.px(9, 1, '#a5a0a8')
  c.px(10, 0, '#a5a0a8')
  c.px(9, 0, '#7d7882')
  c.px(10, 2, '#2b1d16')
  c.line(15, 4, 18, 4, '#7d7882')
  return finish(Img, c)
}

/** Обідній куточок: круглий білий стіл на «тюльпані», два скандинавські стільці, тюльпани у вазі. */
function diningSet(Img) {
  const c = canvas(Img, 40, 27)
  const O = ramp(C.oak)
  const chair = (x, flip) => {
    const f = (dx) => (flip ? x + 8 - dx : x + dx)
    // Спинка з рейками.
    for (let k = 0; k < 3; k++) c.vl(f(1 + k * 2), 6, 15, k === 0 ? O.l : O.b)
    c.hl(Math.min(f(0), f(6)), Math.max(f(0), f(6)), 5, O.L)
    c.hl(Math.min(f(0), f(6)), Math.max(f(0), f(6)), 6, O.b)
    // Сидіння й ніжки.
    c.panel(Math.min(f(1), f(9)), 16, 9, 2, C.oak)
    c.line(f(2), 18, f(1), 26, O.d)
    c.line(f(8), 18, f(9), 26, O.d)
  }
  chair(0, false)
  chair(31, true)
  // Стіл.
  c.cyl(18, 13, 4, 10, C.white)
  c.ball(20, 24.5, 6, 1.5, C.white)
  c.ball(20, 10.5, 13, 3, C.white)
  c.hl(8, 32, 12, tone(C.white, -0.4))
  // Ваза з тюльпанами.
  c.cyl(18, 5, 4, 5, '#bfe0ee')
  c.px(19, 6, '#ffffff')
  for (const [x, y, col] of [[17, 1, '#e2485a'], [20, 0, '#f07ab0'], [22, 2, '#ffd23c']]) {
    c.line(20, 5, x + 1, y + 2, C.leaf)
    c.rect(x, y, 2, 2, col)
    c.px(x, y, tone(col, 0.35))
  }
  return finish(Img, c)
}

/** Програвач платівок на горіховій тумбі з полицею вінілу. */
function recordPlayer(Img) {
  const c = canvas(Img, 22, 26)
  c.panel(0, 9, 22, 14, C.walnut, { r: 1 })
  c.rect(2, 12, 18, 9, tone(C.walnut, -0.5))
  const sleeves = ['#d9493a', '#efe9df', '#34496e', '#dba23a', '#2c2a31', '#8ea784', '#e2a397', '#c66a45', '#efe9df']
  sleeves.forEach((col, k) => c.vl(2 + k * 2, 13 + (k % 3 === 0 ? 1 : 0), 20, col))
  for (const [x0, x1] of [[2, 1], [19, 20]]) c.line(x0, 23, x1, 25, C.black)
  // Програвач.
  c.panel(1, 4, 20, 6, C.oak, { r: 1 })
  c.ball(9, 6.5, 6.5, 2.1, '#1c1a20')
  c.ball(9, 6.5, 1.5, 0.8, '#d9493a')
  c.hl(5, 8, 6, '#3a3640')
  c.line(17, 5, 13, 7, C.steel)
  c.px(17, 4, tone(C.steel, -0.3))
  // Конверт, що стоїть позаду.
  c.panel(13, 0, 6, 5, '#dba23a', { flat: true })
  c.ball(16, 2.5, 1.5, 1.5, '#c66a45')
  return finish(Img, c)
}

/** Сучасний камін: біла ніша, дубова полиця, вогонь на полінах; на полиці — свічки й рамка. */
function fireplace(Img) {
  const c = canvas(Img, 34, 30)
  c.panel(0, 6, 34, 24, C.white)
  c.hl(1, 32, 7, tone(C.white, 0.4))
  c.panel(0, 4, 34, 3, C.oak)
  // Топка.
  c.panel(7, 14, 20, 14, C.black, { r: 1 })
  c.rect(9, 16, 16, 11, '#2a1a16')
  c.rect(9, 22, 16, 5, '#4a2418')
  // Поліна й вогонь.
  c.panel(10, 24, 7, 2, C.walnut)
  c.panel(17, 24, 7, 2, tone(C.walnut, -0.1))
  const flames = [[12, 17, '#e8562a'], [15, 15, '#f08a2c'], [18, 16, '#e8562a'], [21, 18, '#f08a2c']]
  for (const [x, top, col] of flames)
    for (let y = top; y <= 24; y++) {
      const w = Math.max(0, Math.round(((y - top) / (24 - top)) * 2.4))
      for (let dx = -w; dx <= w; dx++) c.px(x + dx, y, Math.abs(dx) < w - 0.5 && y > top + 2 ? '#ffd35a' : col)
    }
  c.hl(12, 21, 23, '#fff2b0')
  // Полиця: свічки, ваза, рамка.
  c.cyl(3, 0, 2, 4, C.cream)
  c.cyl(6, 1, 2, 3, C.cream)
  c.px(3, 0, '#ffd35a')
  c.px(6, 1, '#ffd35a')
  c.panel(13, 0, 7, 5, C.black, { flat: true })
  c.rect(14, 1, 5, 3, '#e2a397')
  c.ball(27, 2.5, 2, 2, C.sage)
  c.px(27, 0, C.leaf)
  c.hl(1, 32, 29, tone(C.white, -0.45))
  return finish(Img, c)
}

/** Робот-пилосос. */
function robotVacuum(Img) {
  const c = canvas(Img, 11, 6)
  c.ball(5.5, 3, 5.5, 2.8, C.black)
  c.ball(5.5, 2.4, 3.2, 1.3, C.char)
  c.px(5, 2, '#5ad0ff')
  c.hl(1, 9, 4, tone(C.black, -0.3))
  return finish(Img, c, { shadowW: 10 })
}

/* ───────── Килими (вид згори) ───────── */

/** Берберський килим: кремовий ворс, чорні ромби-лінії, бахрома з коротких боків. */
function geoRug(Img) {
  const w = 52
  const h = 32
  const c = canvas(Img, w, h)
  for (let y = 0; y < h; y++)
    for (let x = 3; x < w - 3; x++) {
      const n = noise(x, y, 7)
      let col = n < 0.2 ? '#ddd2bd' : n > 0.85 ? '#f6efe2' : '#ebe2d0'
      // Ромбова сітка.
      const u = (x + y) % 13
      const v = (x - y + 1300) % 13
      if (u === 0 || v === 0) col = n > 0.5 ? '#3a3432' : '#4a4240'
      else if ((u === 6 && v === 6) || (u === 7 && v === 7)) col = '#c66a45'
      if (x === 3 || x === w - 4 || y === 0 || y === h - 1) col = '#d4c8b0'
      c.px(x, y, col)
    }
  for (let y = 1; y < h - 1; y += 2) {
    c.hl(0, 2, y, '#e8dcc6')
    c.hl(w - 3, w - 1, y, '#e8dcc6')
  }
  return finish(Img, c, { grounded: false, contour: 0 })
}

/** Круглий пухнастий килимок кольору пудри. */
function shagRug(Img) {
  const w = 38
  const h = 24
  const c = canvas(Img, w, h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2)
      const dy = (y + 0.5 - h / 2) / (h / 2)
      const d = dx * dx + dy * dy
      const n = noise(x, y, 3)
      if (d > 1 - n * 0.12) continue
      const lit = -dx * 0.4 - dy * 0.5
      c.px(x, y, n > 0.82 ? tone(C.blush, 0.35) : n < 0.25 || lit < -0.45 ? tone(C.blush, -0.2) : C.blush)
    }
  return finish(Img, c, { grounded: false, contour: 0 })
}

/* ───────── На стіну ───────── */

/** Неонова вивіска: рожеве серце й бірюзова хвиля на прозорій плиті. */
function neonSign(Img) {
  const c = canvas(Img, 30, 15)
  // Прозора плита й тримачі.
  c.rect(0, 0, 30, 15, '#cfe7f0', 0.14)
  for (const [x, y] of [[1, 1], [28, 1], [1, 13], [28, 13]]) c.px(x, y, C.steel)
  // Серце.
  const heart = (x, y) => {
    const u = (x - 8.5) / 6
    const v = (8.2 - y) / 5.6 // у серця вісь y — вгору
    return (u * u + v * v - 1) ** 3 - u * u * v * v * v
  }
  // Неонова трубка — край маски серця: зовні рожеве скло, всередині світла нитка.
  const inside = (x, y) => x >= 0 && y >= 0 && x < 18 && y < 15 && heart(x + 0.5, y + 0.5) < 0
  const edge = (x, y) => inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < 18; x++) {
      if (edge(x, y)) c.px(x, y, '#ff5fae')
      else if (inside(x, y) && (edge(x - 1, y) || edge(x + 1, y) || edge(x, y - 1) || edge(x, y + 1))) c.px(x, y, '#ffe0f0')
    }
  // Хвиля.
  for (let x = 17; x <= 28; x++) {
    const y = Math.round(7.5 + Math.sin((x - 17) * 0.75) * 2.2)
    c.px(x, y, '#e0ffff')
    c.px(x, y + 1, '#3fd8e8')
    c.px(x, y - 1, '#3fd8e8', 0.6)
  }
  return finish(Img, c, { grounded: false, contour: 0 })
}

/** Гірлянда-лампочки: три провислі дуги з теплими кульками. */
function fairyLights(Img) {
  const w = 60
  const c = canvas(Img, w, 11)
  const wire = '#3a4a34'
  for (const [x0, x1] of [[0, 20], [20, 40], [40, 59]]) {
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0)
      const y = 1 + Math.round(Math.sin(t * Math.PI) * 5)
      c.px(x, y, wire)
      if ((x - x0) % 5 === 2 && x !== x0 && x !== x1) {
        const col = (x >> 2) % 3 === 0 ? '#ffe6a0' : '#fff4c8'
        c.px(x, y + 1, '#6a6050')
        c.ball(x + 0.5, y + 3, 1.3, 1.6, col, { soft: 0.4 })
        c.px(x, y + 2, '#ffffff')
      }
    }
    c.rect(x0, 0, 2, 2, C.char)
  }
  return finish(Img, c, { grounded: false, contour: 0 })
}

/** Абстрактна картина в тонкій дубовій рамі: теракотова арка, шавлієве коло, гірчичне сонце. */
function abstractArt(Img) {
  const c = canvas(Img, 30, 22)
  c.panel(0, 0, 30, 22, C.oak, { flat: false })
  c.rect(1, 1, 28, 20, '#efe7d8')
  for (let y = 1; y < 21; y++)
    for (let x = 1; x < 29; x++) {
      if (noise(x, y, 11) > 0.9) c.px(x, y, '#e4dac8')
      const ax = (x + 0.5 - 11) / 7
      const ay = (y + 0.5 - 21) / 13
      if (ax * ax + ay * ay < 1 && (ax * ax + ay * ay > 0.3 || y > 17)) c.px(x, y, ax < -0.3 ? tone(C.terra, 0.12) : C.terra)
    }
  c.ball(21, 13, 5.5, 5.5, C.sage, { soft: 0.6 })
  c.ball(21, 5.5, 3, 3, C.mustard, { soft: 0.8 })
  c.line(3, 4, 13, 4, '#2c2a31')
  c.line(24, 18, 27, 15, '#2c2a31')
  return finish(Img, c, { grounded: false, contour: 0.8 })
}

/** Галерея на стіні: постер із горами, фото моря й гербарій. */
function gallery(Img) {
  const c = canvas(Img, 34, 22)
  // Великий постер у чорній рамі.
  c.panel(0, 0, 16, 22, C.black)
  c.rect(1, 1, 14, 20, '#f2ece2')
  for (let x = 2; x <= 13; x++) {
    const y = Math.round(15 - Math.max(0, 6 - Math.abs(x - 6) * 1.5) - Math.max(0, 4 - Math.abs(x - 11) * 1.2))
    for (let yy = y; yy <= 16; yy++) c.px(x, yy, yy === y ? '#2c2a31' : yy < y + 2 && x < 8 ? '#efe7d8' : '#8fa1b8')
  }
  c.ball(11, 5, 1.8, 1.8, C.terra, { soft: 1 })
  c.hl(3, 12, 18, '#2c2a31')
  // Фото в дубовій рамці.
  c.panel(18, 0, 16, 11, C.oak)
  c.rect(19, 1, 14, 9, '#9fd0f0')
  c.rect(19, 6, 14, 4, '#3f78b8')
  c.hl(19, 32, 6, '#e6f6ff')
  c.px(29, 3, '#fff4c0')
  // Гербарій у білій рамці.
  c.panel(20, 13, 12, 9, C.white)
  c.rect(21, 14, 10, 7, '#f8f4ea')
  c.leaf(23, 19, -0.7, 7, 2, '#6a8a5a', { rib: true })
  return finish(Img, c, { grounded: false, contour: 0.8 })
}

/** Навісна полиця: дубова дошка, книжки, свічка в склі й плющ, що звисає. */
function floatShelf(Img) {
  const c = canvas(Img, 30, 19)
  c.panel(0, 9, 30, 3, C.oak)
  for (let k = 0; k < 4; k++) c.vl(2 + k * 2, 2 + (k % 2), 8, ['#34496e', '#c66a45', '#e6d7bb', '#8ea784'][k])
  c.vl(10, 3, 8, '#dba23a')
  c.line(11, 8, 14, 3, '#7a4e2f')
  // Свічка в склі.
  c.cyl(17, 5, 4, 4, '#cfe7f0')
  c.rect(18, 6, 2, 3, C.cream)
  c.px(18, 5, '#ffd35a')
  // Плющ.
  c.cyl(23, 5, 5, 4, C.white)
  c.ball(25.5, 4.5, 3, 1.8, C.leaf)
  for (const [x, len] of [[23, 7], [25, 9], [28, 5]])
    for (let k = 0; k < len; k++) c.px(x + (k % 3 === 1 ? 1 : 0), 10 + k, k % 2 ? C.leafL : C.leaf)
  return finish(Img, c, { grounded: false, contour: 0.8 })
}

/** Кругле дзеркало в латунній оправі на шкіряному ремінці. */
function roundMirror(Img) {
  const c = canvas(Img, 18, 23)
  c.line(9, 0, 4, 6, C.cognac)
  c.line(9, 0, 14, 6, C.cognac)
  c.px(9, 0, C.brass)
  c.ball(9, 14, 8.5, 8.5, C.brass, { soft: 0.3 })
  for (let y = 6; y <= 22; y++)
    for (let x = 1; x <= 17; x++) {
      const dx = x + 0.5 - 9
      const dy = y + 0.5 - 14
      if (dx * dx + dy * dy > 49) continue
      const streak = (x - y + 40) % 9
      c.px(x, y, streak === 0 || streak === 1 ? '#eef8fc' : dy > 3 ? '#a8c8d8' : '#c4dfea')
    }
  return finish(Img, c, { grounded: false, contour: 0.8 })
}

/** Бра: латунна планка й опалова куля, що світиться. */
function sconce(Img) {
  const c = canvas(Img, 10, 16)
  c.panel(3, 4, 4, 9, C.brass, { r: 1 })
  c.line(5, 9, 5, 7, tone(C.brass, -0.3))
  c.ball(5, 5, 4, 4, '#fff3d6', { soft: 0.7 })
  c.px(4, 3, '#ffffff')
  c.px(5, 4, '#ffffff')
  return finish(Img, c, { grounded: false, contour: 0.8 })
}

/** Годинник-мінімалізм: білий циферблат, чорний обідок, дубові позначки. */
function modernClock(Img) {
  const c = canvas(Img, 14, 14)
  c.ball(7, 7, 7, 7, C.black, { soft: 0.4 })
  c.ball(7, 7, 6, 6, '#f6f1e8', { soft: 0.9 })
  for (const [x, y] of [[7, 2], [12, 7], [7, 12], [2, 7]]) c.px(x, y, C.oak)
  c.line(7, 7, 7, 3, C.black)
  c.line(7, 7, 10, 8, C.black)
  c.px(7, 7, C.terra)
  return finish(Img, c, { grounded: false, contour: 0.8 })
}

/** Макраме на гілці з плавника. */
function macrame(Img) {
  const c = canvas(Img, 16, 30)
  c.panel(0, 1, 16, 2, '#b8a488', { r: 1 })
  c.line(3, 1, 8, 0, '#d9cbb0')
  c.line(8, 0, 13, 1, '#d9cbb0')
  const cord = '#efe5d2'
  const knot = '#d6c6a8'
  for (let k = 0; k < 6; k++) {
    const x = 2 + k * 2.4
    for (let y = 3; y <= 26; y++) {
      const zig = y > 6 && y < 18 ? Math.round(Math.sin((y + k * 3) * 0.55)) : 0
      c.px(x + zig, y, (y + k) % 4 === 0 ? knot : cord)
    }
  }
  // Ромб із вузлів посередині.
  for (let y = 9; y <= 17; y++) {
    const half = 4 - Math.abs(y - 13)
    c.hl(8 - half, 8 + half, y, (y % 2 ? knot : cord))
  }
  c.px(8, 13, C.terra)
  for (let x = 2; x <= 14; x += 2) c.vl(x, 26, 28 - (x % 4 === 0 ? 1 : 0), knot)
  return finish(Img, c, { grounded: false, contour: 0.6 })
}

/**
 * @param {{ Img: any }} h
 * @returns {Record<string, any>} спрайти hd_* для аркуша home-decor.png
 */
export function modernArt({ Img }) {
  return {
    hd_arc_lamp: arcLamp(Img),
    hd_sofa_modern: sofa(Img),
    hd_coffee_table: coffeeTable(Img),
    hd_tv_console: tvConsole(Img),
    hd_monstera: monstera(Img),
    hd_snake_plant: snakePlant(Img),
    hd_fridge: fridge(Img),
    hd_kitchen: kitchen(Img),
    hd_platform_bed: platformBed(Img),
    hd_cube_shelf: cubeShelf(Img),
    hd_lounge_chair: loungeChair(Img),
    hd_bean_bag: beanBag(Img),
    hd_side_lamp: sideLamp(Img),
    hd_desk_setup: deskSetup(Img),
    hd_cat_tree: catTree(Img),
    hd_dining_set: diningSet(Img),
    hd_record_player: recordPlayer(Img),
    hd_fireplace: fireplace(Img),
    hd_robot_vacuum: robotVacuum(Img),
    hd_geo_rug: geoRug(Img),
    hd_shag_rug: shagRug(Img),
    hd_neon_sign: neonSign(Img),
    hd_fairy_lights: fairyLights(Img),
    hd_abstract_art: abstractArt(Img),
    hd_gallery: gallery(Img),
    hd_float_shelf: floatShelf(Img),
    hd_round_mirror: roundMirror(Img),
    hd_sconce: sconce(Img),
    hd_clock_modern: modernClock(Img),
    hd_macrame: macrame(Img),
  }
}
