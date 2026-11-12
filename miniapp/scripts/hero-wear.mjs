/**
 * Мандрівник шарами: тіло (голова, волосся, чоботи) + низ + верх + головний убір.
 * Кожна річ — намальована вручну сітка символів 16×22 для трьох поглядів (down / up / side,
 * side дивиться ліворуч; праворуч — дзеркально) і, для того, що на ногах, — кадр кроку збоку (stride).
 * Кадри ходьби робимо тим самим перетворенням для кожного шару, тож одяг іде в ногу з тілом.
 *
 * Генератор (gen-island-art.mjs) кладе всі шари в аркуш public/game/walk/hero-wear.png
 * (рядок = шар, 12 кадрів) і опис src/game/walk/hero-wear.json; рушій збирає з них мандрівника
 * у вдягненому (src/game/walk/outfit.js). Іконки одягу для шафи — scripts/sd-wardrobe.mjs.
 * Назви й ціни — на сервері (server/src/game/wardrobe.js), id тут мусять збігатися.
 */

const K = '#2b1d16' // контур — як у всього світу
const SKIN = { s: '#f5c9a0', S: '#d9a077', e: K }
const HAIR = { h: '#7a4524', H: '#4f2a14' }

export const FW = 16
export const FH = 22
/** Клітинка в аркуші: кадр + 1 px прозорого поля з кожного боку (лінійний фільтр не зачепить сусіда). */
export const CELL = { w: FW + 2, h: FH + 2 }
export const DIRS = ['down', 'up', 'left', 'right']
export const FRAMES = DIRS.flatMap((d) => [0, 1, 2].map((i) => `${d}_${i}`))
/** Порядок шарів знизу вгору. */
export const ORDER = ['body', 'bottom', 'top', 'hat']

/**
 * Шар: pal — палітра, down / up / side — [перший рядок, рядки] (up типово = down),
 * stride — [перший рядок, рядки], що замінюють side у кадрі кроку.
 */
const BODY = {
  pal: { K, ...SKIN, ...HAIR, B: '#6a4528', b: '#3a2414' },
  down: [3, [
    '.....KKKKKK.....',
    '....KhhhhhhK....',
    '...KhhHhhhhhK...',
    '...KhhhhhhhhK...',
    '...KhsssssshK...',
    '...KsessssesK...',
    '...KSssssssSK...',
    '....KKsSSsKK....',
    '................', '................', '................', '................', '................',
    '................', '................', '................',
    '...KBBBKKBBBK...',
    '...KbbbKKbbbK...',
    '....KKK..KKK....',
  ]],
  up: [3, [
    '.....KKKKKK.....',
    '....KhhhhhhK....',
    '...KhhhhHhhhK...',
    '...KhhhhhhhhK...',
    '...KhhhhhhhhK...',
    '...KhhhhhhhhK...',
    '...KHhhHHhhHK...',
    '....KKSSSSKK....',
    '................', '................', '................', '................', '................',
    '................', '................', '................',
    '...KBBBKKBBBK...',
    '...KbbbKKbbbK...',
    '....KKK..KKK....',
  ]],
  side: [3, [
    '.....KKKKKK.....',
    '....KhhhhhhK....',
    '...KhhhhhHhhK...',
    '...KhhhhhhhhK...',
    '...KsssshhhhK...',
    '...KsesshhhhK...',
    '...KSssshhhHK...',
    '....KKsShhKK....',
    '................', '................', '................', '................', '................',
    '................', '................', '................',
    '....KBBKKBBK....',
    '...KbbbKKbbK....',
    '....KKK..KK.....',
  ]],
  stride: [19, [
    '..KBBK..KBBK....',
    '.KbbbK.KbbbK....',
    '..KKK...KKK.....',
  ]],
}

/** Одяг за місцем: id → шар. */
export const WEAR_LAYERS = {
  hat: {
    straw_hat: {
      pal: { K, Y: '#e9c56a', y: '#c49a45', T: '#c8372d' },
      down: [1, [
        '.....KKKKKK.....',
        '....KYYYYYYK....',
        '...KYYyYYyYYK...',
        '.KKKTTTTTTTTKKK.',
        'KYYYYYYYYYYYYYYK',
        '.KKyyyyyyyyyyKK.',
      ]],
      side: 'down',
    },
    flat_cap: {
      pal: { K, G: '#8b9097', g: '#6c7179', d: '#474b52' },
      down: [2, [
        '....KKKKKKKK....',
        '...KGGGGGGGGK...',
        '...KGgGGGGgGK...',
        '..KKggggggggKK..',
        '..KddddddddddK..',
      ]],
      up: [2, [
        '....KKKKKKKK....',
        '...KGGGGGGGGK...',
        '...KGGGGGGGGK...',
        '...KggggggggK...',
        '...KKKKKKKKKK...',
      ]],
      side: [2, [
        '.....KKKKKK.....',
        '....KGGGGGGK....',
        '...KGGGGGgGGK...',
        '...KggggggggK...',
        '.KKddddggggggK..',
      ]],
    },
    beanie: {
      pal: { K, R: '#d8463a', r: '#9e3024' },
      down: [2, [
        '....KKKKKKKK....',
        '...KRRRrRRRRK...',
        '...KRRrRRRrRK...',
        '...KrrrrrrrrK...',
        '...KrRrRrRrRK...',
      ]],
      side: [2, [
        '.....KKKKKK.....',
        '....KRRRRRRK....',
        '...KRRrRRRrRK...',
        '...KrrrrrrrrK...',
        '...KrRrRrRrRK...',
      ]],
    },
    flower_wreath: {
      pal: { K, Y: '#ffd23c', o: '#c87810', P: '#e2485a', g: '#559b33', b: '#4aa3ff', w: '#f3eee2' },
      down: [4, [
        '...gYgPPgbbgYg..',
        '..gYYgPPgbgYYg..',
      ]],
      up: [4, [
        '...gYgPPgbbgYg..',
        '..gYYgPPgbgYYg..',
        '......PYb.......',
        '......PYb.......',
        '......PYb.......',
        '......PYb.......',
        '......PYb.......',
        '......PYb.......',
        '......P.b.......',
      ]],
      side: [4, [
        '....gYgPgbYg....',
        '...gYYgPPgbgg...',
        '...........PYb..',
        '...........PYb..',
        '...........PYb..',
        '...........P.b..',
      ]],
    },
    captain_cap: {
      pal: { K, N: '#2c4580', n: '#1f3160', W: '#f3eee2', w: '#cbc2b0', G: '#ffd23c' },
      down: [1, [
        '...KKKKKKKKKK...',
        '..KWWWWWWWWWWK..',
        '..KwwwwwwwwwwK..',
        '...KNNNGGNNNK...',
        '...KNNNNNNNNK...',
        '..KKKKKKKKKKKK..',
      ]],
      up: [1, [
        '...KKKKKKKKKK...',
        '..KWWWWWWWWWWK..',
        '..KwwwwwwwwwwK..',
        '...KNNNNNNNNK...',
        '...KNNNNNNNNK...',
        '...KnnnnnnnnK...',
      ]],
      side: [1, [
        '....KKKKKKKKK...',
        '...KWWWWWWWWWK..',
        '...KwwwwwwwwwK..',
        '....KGNNNNNNK...',
        '....KNNNNNNNK...',
        '.KKKKKnnnnnnK...',
      ]],
    },
  },
  top: {
    vyshyvanka: {
      pal: { K, ...SKIN, W: '#f3eee2', w: '#cbc2b0', R: '#c8372d', r: '#8e2a1f' },
      down: [11, [
        '..KWWWWRRWWWWK..',
        '.KwWWWWRRWWWWwK.',
        '.KwWRWWRRWWRWwK.',
        '.KsWWWWRRWWWWsK.',
        '.KSrrrrrrrrrrSK.',
      ]],
      up: [11, [
        '..KWWWWWWWWWWK..',
        '.KwWWWWWWWWWWwK.',
        '.KwWRWWWWWWRWwK.',
        '.KsWWWWWWWWWWsK.',
        '.KSrrrrrrrrrrSK.',
      ]],
      side: [11, [
        '....KWWWWWWK....',
        '....KwRWWWwK....',
        '....KwRWWWwK....',
        '....KWsWWWwK....',
        '....KrSrrrrK....',
      ]],
    },
    striped_shirt: {
      pal: { K, ...SKIN, W: '#f3eee2', w: '#cbc2b0', B: '#3f5fa8', b: '#2c4580' },
      down: [11, [
        '..KWWWWWWWWWWK..',
        '.KbBBBBBBBBBBbK.',
        '.KwWWWWWWWWWWwK.',
        '.KsBBBBBBBBBBsK.',
        '.KSWWWWWWWWWWSK.',
      ]],
      side: [11, [
        '....KWWWWWWK....',
        '....KbBBBBbK....',
        '....KwWWWWwK....',
        '....KBsBBBbK....',
        '....KWSWWWwK....',
      ]],
    },
    raincoat: {
      pal: { K, ...SKIN, Y: '#ffd23c', y: '#e0a018', o: '#a87010' },
      down: [11, [
        '..KyYYYYYYYYyK..',
        '.KyYYYYYoYYYYyK.',
        '.KyYYYYYYYYYYyK.',
        '.KsYYYYYoYYYYsK.',
        '.KSyYYYYYYYYySK.',
        '..KyyyyyyyyyyK..',
      ]],
      up: [11, [
        '..KyYYYYYYYYyK..',
        '.KyYYYYYYYYYYyK.',
        '.KyYYYYYYYYYYyK.',
        '.KsYYYYYYYYYYsK.',
        '.KSyYYYYYYYYySK.',
        '..KyyyyyyyyyyK..',
      ]],
      side: [11, [
        '....KYYYYYYK....',
        '....KyYYYYyK....',
        '....KyoYYYyK....',
        '....KYsYYYyK....',
        '....KySYYYyK....',
        '....KyyyyyyK....',
      ]],
    },
    sweater: {
      pal: { K, ...SKIN, G: '#5a9e4a', g: '#3f7d27', L: '#7cc060' },
      down: [11, [
        '..KGGGGggGGGGK..',
        '.KgGGLGGGGLGGgK.',
        '.KgGGLGGGGLGGgK.',
        '.KsGGLGGGGLGGsK.',
        '.KSggggggggggSK.',
      ]],
      up: [11, [
        '..KGGGGGGGGGGK..',
        '.KgGGGGGGGGGGgK.',
        '.KgGGGGGGGGGGgK.',
        '.KsGGGGGGGGGGsK.',
        '.KSggggggggggSK.',
      ]],
      side: [11, [
        '....KGGGGGGK....',
        '....KgGLGGgK....',
        '....KgGLGGgK....',
        '....KGsLGGgK....',
        '....KgSggggK....',
      ]],
    },
  },
  bottom: {
    blue_pants: {
      pal: { K, P: '#3f5fa8', p: '#2c4580' },
      down: [16, [
        '..KPPPPPPPPPPK..',
        '...KPPpKKpPPK...',
        '...KPPPKKPPPK...',
      ]],
      side: [16, [
        '....KPPPPPPK....',
        '....KPPPPPpK....',
        '....KPPKKPpK....',
      ]],
      stride: [16, [
        '....KPPPPPPK....',
        '...KPPPKKPPpK...',
        '..KPPK..KPpK....',
      ]],
    },
    shorts: {
      pal: { K, ...SKIN, C: '#d8c48a', c: '#b09a60' },
      down: [16, [
        '..KCCCCCCCCCCK..',
        '...KCCcKKcCCK...',
        '...KsssKKsssK...',
      ]],
      side: [16, [
        '....KCCCCCCK....',
        '....KCCCCCcK....',
        '....KssKKssK....',
      ]],
      stride: [16, [
        '....KCCCCCCK....',
        '...KCCCKKCCcK...',
        '..KssK..KssK....',
      ]],
    },
    sharovary: {
      pal: { K, R: '#c8372d', r: '#8e2a1f' },
      down: [16, [
        '..KRRRRRRRRRRK..',
        '..KRRRrKKrRRRK..',
        '..KRRRrKKrRRRK..',
      ]],
      side: [16, [
        '....KRRRRRRK....',
        '...KRRRRRRrK....',
        '...KRRRKKRrK....',
      ]],
      stride: [16, [
        '....KRRRRRRK....',
        '...KRRRKKRRrK...',
        '..KRRRK.KRrK....',
      ]],
    },
  },
}

/** Що на мандрівникові від початку (як starter у server/src/game/wardrobe.js). */
export const STARTER = { hat: 'straw_hat', top: 'vyshyvanka', bottom: 'blue_pants' }

/** [перший рядок, рядки] → повний кадр 16×22 (решта — прозоре). */
function place(spec, where) {
  const [y0, rows] = spec
  const out = Array.from({ length: FH }, () => '.'.repeat(FW))
  rows.forEach((r, i) => {
    if (r.length !== FW) throw new Error(`${where}: рядок ${y0 + i} має ${r.length} символів замість ${FW}: «${r}»`)
    out[y0 + i] = r
  })
  return out
}

/** Кадр ходьби спереду/ззаду: одна нога піднята на 1 px (як у старого мандрівника, але ширше — для шароварів). */
function liftLeg(rows, left) {
  const out = rows.map((r) => r.split(''))
  const [x0, x1] = left ? [2, 7] : [8, 13]
  for (let y = 18; y < out.length; y++)
    for (let x = x0; x <= x1; x++) out[y - 1][x] = y - 1 >= 18 || out[y][x] !== '.' ? out[y][x] : out[y - 1][x]
  for (let x = x0; x <= x1; x++) out[out.length - 1][x] = '.'
  return out.map((r) => r.join(''))
}

/** Шар → 12 кадрів (рядки символів + чи дзеркалити) у порядку FRAMES. */
function layerFrames(layer, where) {
  const view = (v) => {
    const spec = layer[v] === 'down' ? layer.down : (layer[v] ?? layer.down)
    return place(spec, `${where}.${v}`)
  }
  const down = view('down')
  const up = layer.up ? view('up') : down
  const side = view('side')
  let stride = side
  if (layer.stride) {
    const [y0, rows] = layer.stride
    stride = side.map((r, y) => (y >= y0 && y < y0 + rows.length ? rows[y - y0] : r))
    place(layer.stride, `${where}.stride`) // перевірити ширину
  }
  return [
    [down, false], [liftLeg(down, true), false], [liftLeg(down, false), false],
    [up, false], [liftLeg(up, true), false], [liftLeg(up, false), false],
    [side, false], [stride, false], [side, false],
    [side, true], [stride, true], [side, true],
  ]
}

/** Усі шари: [ключ, шар] — 'body' і '<місце>:<id>'. */
function allLayers() {
  const out = [['body', BODY]]
  for (const [slot, items] of Object.entries(WEAR_LAYERS)) for (const [id, l] of Object.entries(items)) out.push([`${slot}:${id}`, l])
  return out
}

/**
 * Аркуш шарів: рядок на шар, 12 клітинок CELL у порядку FRAMES.
 * @returns {{ image: any, meta: { cell: object, frame: object, frames: string[], order: string[], layers: Record<string, number> } }}
 */
export function wearSheet({ Img }) {
  const layers = allLayers()
  const image = new Img(CELL.w * FRAMES.length, CELL.h * layers.length)
  const index = {}
  layers.forEach(([key, layer], row) => {
    index[key] = row
    layerFrames(layer, key).forEach(([rows, flip], col) => image.rows(rows, col * CELL.w + 1, row * CELL.h + 1, layer.pal, flip))
  })
  return { image, meta: { cell: CELL, frame: { w: FW, h: FH }, frames: FRAMES, order: ORDER, layers: index } }
}

/** Кадри hero_<dir>_<i> у вдягненому outfit (для атласу й прев'ю генератора). */
export function heroFrames({ Img }, outfit = STARTER) {
  const parts = [BODY, WEAR_LAYERS.bottom[outfit.bottom], WEAR_LAYERS.top[outfit.top], outfit.hat && WEAR_LAYERS.hat[outfit.hat]].filter(Boolean)
  const framesOf = parts.map((l) => [l, layerFrames(l, 'hero')])
  const f = {}
  FRAMES.forEach((name, i) => {
    const img = new Img(FW, FH)
    for (const [l, fr] of framesOf) img.rows(fr[i][0], 0, 0, l.pal, fr[i][1])
    f[`hero_${name}`] = img
  })
  return f
}
