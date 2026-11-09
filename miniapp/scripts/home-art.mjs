/**
 * Хатинка зсередини: фон кімнати й нові меблі — класичний піксель-арт тим самим пікселем,
 * що й увесь острів. Фон складено з намальованих вручну плиток (дошка, тиньк, фриз, торці колод),
 * меблі — сітки символів, 3–5 тонів на матеріал, світло зверху зліва, без шуму й градієнтів.
 *
 * Геометрія (підлога, двері, вікна) — з src/game/walk/home.js, тож сітка прохідності
 * й точки взаємодії не змінюються.
 */

import { DOOR, FLOOR, HOME_MAP, WALL_H, WINDOWS } from '../src/game/walk/home.js'

const K = '#2b1d16'

/* ───────── Палітри ───────── */

const WOOD = { h: '#c79a62', H: '#b07a4c', b: '#8b5d3b', m: '#6b4426', d: '#5b3a22', s: '#3b2a1f' }
const PLASTER = ['#f4ecdb', '#ece2cc', '#ddd0b6']
const PLANKS = [
  { h: '#bb8a5e', b: '#9e6d46', g: '#86593a', k: '#6e4a2e' },
  { h: '#b07f55', b: '#93643f', g: '#7c5233', k: '#654229' },
  { h: '#c4945f', b: '#a7764c', g: '#8f633f', k: '#74502f' },
]
const SEAM = '#4e321d'

/* ───────── Плитки фону ───────── */

/** Фриз під сволоком: червоні «квіти» й сині листочки по білому, крок 12 px. */
const FRIEZE = ['............', '..r.....B...', '.rRr...BbB..', '..r..g..B...', '.....g......']
const FRIEZE_PAL = { r: '#d9493a', R: '#ffd23c', B: '#3a6fc0', b: '#9fc4f0', g: '#5a8a3a' }

/** Торець балки сволока, 10×10. */
const JOIST = ['.ssssssss.', 'shhbbbbbms', 'shbmmmmbms', 'sbmbbbbmms', 'sbmbhbbmms', 'sbmbbbbmms', 'sbbmmmmmms', 'smbbbbmmms', 'smmmmmmmms', '.ssssssss.']

/** Тиньк: кілька ледь темніших плямок і тріщинка на плитку 24×14 — щоб стіна не була пласкою. */
const PLASTER_TILE = [
  '........................',
  '...aa...................',
  '..aaa..........a........',
  '...............aa.......',
  '........................',
  '.....................a..',
  '..........c.............',
  '...........c............',
  '...........c.......aa...',
  '...a....................',
  '..aa....................',
  '..............aa........',
  '.............aaa........',
  '........................',
]

/** Килимок-доріжка біля дверей (тканий, смугастий). */
const DOORMAT = [
  '.rrrrrrrrrrrrrrrrrrrrrr.',
  'rRRRRRRRRRRRRRRRRRRRRRRr',
  'rRyRRyRRyRRyRRyRRyRRyRRr',
  'rggggggggggggggggggggggr',
  'rRRRyRRRRyRRRRyRRRRyRRRr',
  'rRRRRRRRRRRRRRRRRRRRRRRr',
  '.rrrrrrrrrrrrrrrrrrrrrr.',
  'f.f.f.f.f.f.f.f.f.f.f.f.',
]
const DOORMAT_PAL = { r: '#8e2a1f', R: '#c8372d', y: '#ffd23c', g: '#2f6fd0', f: '#e6dbc4' }

/* ───────── Меблі й речі (сітки) ───────── */

/** Ліжко: різьблене узголів'я, гора подушок, гуцульський ліжник у смуги, мереживний підзор. */
function bedRows() {
  const head = [
    '.....ssssssssssssssssssssssssss.....',
    '...sshhhhhhhhhhhhhhhhhhhhhhhhhhss...',
    '..shhbbbbbbbbbbbbbbbbbbbbbbbbbbhhs..',
    '.shbbbbrbbbbbbbbbbbbbbbbbbrbbbbbbms.',
    '.shbbbrrrbbbbbbbbbbbbbbbbrrrbbbbbms.',
    '.shbbbbrbbbbbbbbbbbbbbbbbbrbbbbbbms.',
    '.smmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmms.',
  ]
  // Подушки пірамідою: біле полотно, мереживо по краю, вишиті «кутики».
  const pillows = [
    '.shbbWWWWWWWWWWWWWWWWWWWWWWWWWWbbms.',
    '.shbWwWWWWWWWWWWWWWWWWWWWWWWWWwWbms.',
    '.shbWWWWWWWWWWWWWWWWWWWWWWWWWWWWbms.',
    '.shbWWrWWWWWWWWWWWWWWWWWWWWWWrWWbms.',
    '.shbwwwwwwwwwwwwwwwwwwwwwwwwwwwwbms.',
    '.shbbbbWWWWWWWWWWWWWWWWWWWWWWbbbbms.',
    '.shbbbWWrWWWWWWWWWWWWWWWWWWrWWbbbms.',
    '.shbbbWWWWWWWWWWWWWWWWWWWWWWWWbbbms.',
    '.shbbbwwwwwwwwwwwwwwwwwwwwwwwwbbbms.',
    '.shbbbbbbWWWWWWWWWWWWWWWWWWbbbbbbms.',
    '.shbbbbbbWWrWWWWWWWWWWWWrWWbbbbbbms.',
    '.shbbbbbbwwwwwwwwwwwwwwwwwwbbbbbbms.',
  ]
  // Ліжник: смуги червоного, чорного, зеленого й жовтого з ромбиками-«зубцями».
  const band = (c1, c2) => `.sh${c1}${(c2 + c1 + c1 + c1).repeat(7)}${c1}ms.`
  const blanket = [
    '.shRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRms.',
    '.shRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRms.',
    band('R', 'Y'),
    '.shKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKms.',
    band('G', 'Y'),
    '.shGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGms.',
    '.shRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRms.',
    band('R', 'W'),
    '.shRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRms.',
    '.shYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYms.',
    '.shKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKms.',
    band('R', 'Y'),
    '.shRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRms.',
    band('G', 'Y'),
    '.shGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGms.',
    '.shRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRms.',
    '.shrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrms.',
  ]
  // Підзор: біле мереживо з зубчиками до підлоги, ніжки.
  const valance = [
    '.sWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWs.',
    '.sWwWWwWWwWWwWWwWWwWWwWWwWWwWWwWWWs.',
    '.sWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWs.',
    '.s.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.Ws.',
    '.ss............................ss...',
    '.ss............................ss...',
  ]
  return [...head, ...pillows, ...blanket, ...valance]
}
const BED_PAL = { ...WOOD, W: '#f6f0e2', w: '#d9ccb2', r: '#c8372d', R: '#c8372d', K: '#2b1d16', G: '#3f7d27', Y: '#ffd23c' }

/** Розписна скриня-посаг: синя, з квітами й кованими кутами. */
const CHEST = [
  '..ssssssssssssssssssssss..',
  '.sBBBBBBBBBBBBBBBBBBBBBBs.',
  'sBbbbbbbbbbbbbbbbbbbbbbbBs',
  'sIbbbbbbbbbbbbbbbbbbbbbbIs',
  'sssssssssssssssssssssssss.',
  'sIBBBBBBBBBBBBBBBBBBBBBBIs',
  'sBBBrBBBBBBBGGBBBBBBrBBBBs',
  'sBBrYrBBBBBGyyGBBBBrYrBBBs',
  'sBBBrBGBBBBByyBBBBBBrBGBBs',
  'sBBBBGBBBBBBGGBBBBBBBGBBBs',
  'sBBBGBBBBBBBBBBBBBBBGBBBBs',
  'sIBBBBBBBBBBBBBBBBBBBBBBIs',
  'smmmmmmmmmmmmmmmmmmmmmmmms',
  '.ss..................ss...',
]
const CHEST_PAL = { s: '#1e2a40', B: '#3a6fc0', b: '#5a8fd8', I: '#aaa196', r: '#d9493a', Y: '#ffd23c', G: '#5aa83e', y: '#f6f0e2', m: '#2a4a80' }

/** Стіл зверху: дошки й вишита скатертина-доріжка (хліб, сіль і лампу кладемо окремо). */
function tableRows() {
  const rows = [
    '.ssssssssssssssssssssssssssssssssssssssss.',
    'shhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhs',
    'shbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbms',
    'shbbbbWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWbbbbms',
    'shbbbbWrWrWrWrWrWrWrWrWrWrWrWrWrWrWWbbbbms',
    'shmmmmWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWmmmmms',
    'shbbbbWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWbbbbms',
    'shbbbbWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWbbbbms',
    'shbbbbWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWbbbbms',
    'shmmmmWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWmmmmms',
    'shbbbbWrWrWrWrWrWrWrWrWrWrWrWrWrWrWWbbbbms',
    'shbbbbWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWbbbbms',
    'shbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbms',
    'smmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmms',
    'sddddddddddddddddddddddddddddddddddddddds.',
    '.sbs..................................sbs.',
    '.sbs..................................sbs.',
    '.sbs..................................sbs.',
    '.sms..................................sms.',
  ]
  return rows
}
const TABLE_PAL = { ...WOOD, W: '#f6f0e2', r: '#c8372d' }
/** Коровай, сільничка, глечик, гасова лампа — накладаються на стіл. */
const LOAF = ['..oooooo..', '.oCCCCCCo.', 'oCcCcCcCCo', 'oCCCCCCCCo', '.oooooooo.']
const SALT = ['.w.', 'www', 'sws']
const JUG = ['.oo.', 'oJJo', 'JjJJo', 'JJJJ', '.JJ.']
const LAMP = ['..y..', '.yYy.', '.gGg.', '.gGg.', '..b..', '.bbb.', 'bBBBb', '.bbb.']
const PROP_PAL = { o: '#8a5a24', C: '#d8a04a', c: '#f0c878', w: '#f6f0e2', s: '#aaa196', J: '#b8621b', j: '#e8892d', y: '#ffd35a', Y: '#fff4c0', g: '#cfe7f0', G: '#f6fbff', b: '#7a5a20', B: '#c49a32' }

/** Вазони з калачиками (геранню) на підвіконні. */
const GERANIUMS = [
  '..rRr.........pPp....',
  '.rRYRr..lL...pPYPp...',
  '..rRr..lLgl...pPp.lL.',
  '...g..lgGgl....g..lgl',
  '..gGg..gGg....gGg.gG.',
  '.TTTTT..TTT..TTTTT.T.',
  '.tTTTt.TTTTt.tTTTt...',
  '..ttt...ttt...ttt....',
]
const GERANIUM_PAL = { r: '#c8372d', R: '#e2485a', Y: '#ffd23c', p: '#d0508a', P: '#f07ab0', l: '#74bb44', L: '#9ad861', g: '#559b33', G: '#3f7d27', T: '#c8703a', t: '#8e4a24' }

/** Вінок часнику на мотузці. */
const GARLIC = ['...h...', '...h...', '..rhr..', '.wWWw..', 'wWWWWw.', '.wWWWw.', '..wWWw.', '.wWWw..', 'wWWWWw.', '.wWWw..', '..wWWw.', '.wWWWw.', '..ww...', '...e...']
/** Низка червоного перцю. */
const PEPPERS = ['..h..', '..h..', '.rRh.', 'rRRr.', '.rRRr', '..rRr', '.rRRr', 'rRRr.', '.rRr.', '..rRr', '.rRr.', '..r..']
const BRAID_PAL = { h: '#c79a62', r: '#a8281f', R: '#e2382c', w: '#d9ccb2', W: '#f6f0e2', e: '#e8d8a8' }

/** Покуть: ікона в золотій рамі під вишитим рушником і лампадка. */
const ICON = [
  'RWRWRWRWRWRWRWRWRWRWRWRW',
  'WWWWWWWWWWWWWWWWWWWWWWWW',
  'WrWWW.ggggggggggggg.WWWr',
  'WRW...gGGGGGGGGGGGg..WRW',
  'WrW...gGbbbbbbbbbGg..WrW',
  'WWW...gGbbbYYYbbbGg..WWW',
  'WrW...gGbbYyyyYbbGg..WrW',
  'WRW...gGbbYsssYbbGg..WRW',
  'WrW...gGbbbsssbbbGg..WrW',
  'WWW...gGbbRRRRRbbGg..WWW',
  'WrW...gGbRRRRRRRbGg..WrW',
  'WRW...gGbRRRRRRRbGg..WRW',
  'WrW...gGbbbbbbbbbGg..WrW',
  'WWW...gGGGGGGGGGGGg..WWW',
  'WrW...ggggggggggggg..WrW',
  'WRW..................WRW',
  'WrW.......ggg........WrW',
  'WWW.......lLl........WWW',
  'WrW........l.........WrW',
  'RRR..................RRR',
  'R.R..................R.R',
]
const ICON_PAL = { R: '#c8372d', r: '#2b1d16', W: '#f6f0e2', g: '#c49a32', G: '#ffd860', b: '#3a5a9a', Y: '#ffd23c', y: '#ffe9a8', s: '#f5c9a0', l: '#c8372d', L: '#ffd35a' }

/** Вікно в глибокій ніші: укоси, рама з хрестовиною, вид на море й пагорб, підвіконня, фіранки. */
function drawWindow(img, x0, x1) {
  const ww = x1 - x0
  img.rect(x0 - 2, 13, ww + 4, 28, PLASTER[2]) // укіс
  img.rect(x0, 14, ww, 24, WOOD.d)
  for (let y = 16; y < 36; y++)
    for (let x = x0 + 2; x < x1 - 2; x++) {
      const fx = x - x0
      let c = y < 22 ? '#8fcdf2' : y < 27 ? '#b6e0f8' : y < 29 ? '#e6f6ff' : y < 31 ? '#4f8fd0' : '#3f78b8'
      const hill = 29 - Math.round(Math.sin((fx / ww) * Math.PI) * 4)
      if (y >= hill && y < 36 && fx > ww * 0.45) c = y === hill ? '#8fd05a' : '#5fae3e'
      if (y >= 18 && y <= 19 && fx >= 4 && fx <= 9 - (y - 18)) c = '#ffffff'
      img.set(x, y, c)
    }
  const tx = x0 + Math.round(ww * 0.75)
  img.rect(tx, 25, 1, 3, '#5b3a22')
  img.rect(tx - 2, 22, 5, 3, '#3f7d27')
  img.rect(tx - 1, 21, 3, 1, '#559b33')
  const mid = (x0 + x1) >> 1
  img.vline(mid, 16, 35, WOOD.d)
  img.vline(mid - 1, 16, 35, WOOD.H)
  img.hline(x0 + 2, x1 - 3, 25, WOOD.d)
  img.hline(x0 + 2, x1 - 3, 24, WOOD.H)
  img.hline(x0, x1 - 1, 14, WOOD.H)
  img.rect(x0 - 3, 38, ww + 6, 3, WOOD.b)
  img.hline(x0 - 3, x1 + 2, 38, WOOD.h)
  img.hline(x0 - 3, x1 + 2, 40, WOOD.s)
  for (const [fx, dir] of [[x0 - 4, 1], [x1 + 1, -1]]) {
    for (let y = 12; y < 37; y++) {
      const narrow = y > 22 && y < 27 ? 1 : 0
      for (let k = 0; k < 3 - narrow; k++) {
        const px = dir > 0 ? fx + k : fx + 2 - k
        img.set(px, y, k === (dir > 0 ? 0 : 2 - narrow) ? '#d9ccb2' : '#f6f0e2')
      }
      if (y % 3 === 0 && !narrow) img.set(fx + 1, y, '#c8372d')
    }
    img.hline(fx, fx + 2, 24, '#c8372d')
  }
  img.hline(x0 - 5, x1 + 4, 12, WOOD.d) // карниз
}

/**
 * Стіна хати висотою WALL_H: сволок із балками, розписний фриз, побілений тиньк, синя підводка,
 * плінтус. Унизу ліворуч і праворуч — темніший кут, де стіна сходиться з сусідньою.
 * windows — [x0, x1] у координатах стіни; door — проріз [x0, x1]; shade — наскільки стіна в тіні.
 */
function wallStrip(Img, w, { windows = [], door = null, joists = [], shade = 0 } = {}) {
  const img = new Img(w, WALL_H)
  for (let y = 0; y < WALL_H; y++)
    for (let x = 0; x < w; x++) {
      let c
      if (y === 0) c = K
      else if (y < 9) c = [WOOD.h, WOOD.H, WOOD.b, WOOD.b, WOOD.m, WOOD.m, WOOD.d, WOOD.s][y - 1]
      else if (y < 14) c = PLASTER[0]
      else if (y < 42) {
        const t = PLASTER_TILE[(y - 14) % PLASTER_TILE.length][(x + (Math.floor((y - 14) / 14) % 2) * 12) % 24]
        c = t === 'a' ? PLASTER[1] : t === 'c' ? PLASTER[2] : PLASTER[0]
      } else if (y < 48) c = y === 42 ? '#8ea4c4' : y === 47 ? '#4a5d80' : '#6f86a8'
      else c = y === 48 ? WOOD.h : y === 53 ? WOOD.s : y === 52 ? WOOD.d : WOOD.b
      img.set(x, y, c)
    }
  for (let x = 2; x < w; x += 7) img.hline(x, x + 3, 3 + (x % 3), WOOD.m) // волокна сволока
  for (let x = 0; x < w; x += 12) img.rows(FRIEZE, x, 9, FRIEZE_PAL)
  for (const bx of joists) img.rows(JOIST, bx - 5, 0, { ...WOOD })
  for (const [x0, x1] of windows) drawWindow(img, x0, x1)
  if (door) {
    const [d0, d1] = door
    // Одвірок і масивна перекладина, проріз — прозорий (крізь нього видно двір).
    for (let y = 13; y < WALL_H; y++) for (let x = d0; x < d1; x++) img.d[(y * w + x) * 4 + 3] = 0
    img.rect(d0 - 3, 10, d1 - d0 + 6, 3, WOOD.b)
    img.hline(d0 - 3, d1 + 2, 10, WOOD.h)
    img.hline(d0 - 3, d1 + 2, 12, WOOD.s)
    for (const px of [d0 - 3, d1]) {
      img.rect(px, 13, 3, WALL_H - 13, WOOD.b)
      img.vline(px, 13, WALL_H - 1, WOOD.h)
      img.vline(px + 2, 13, WALL_H - 1, WOOD.s)
    }
    for (let x = d0 - 1; x <= d1; x += 4) img.set(x, 11, '#c8372d') // вишита облямівка над дверима
  }
  // Кути: де стіни сходяться, темніше (дві смуги рівного тону).
  for (const [x, a] of [[0, 0.3], [1, 0.15], [w - 1, 0.3], [w - 2, 0.15]]) img.vline(x, 9, WALL_H - 1, '#1a0e06', a)
  if (shade)
    for (let y = 0; y < WALL_H; y++) for (let x = 0; x < w; x++) if (img.alpha(x, y)) img.set(x, y, '#1a0e06', shade)
  return img
}

/**
 * Чотири стіни на одному аркуші: задня (з вікнами), ліва, права, передня (з дверима).
 * Бокові й передня — темніші: світло падає з вікон у задній стіні.
 */
function buildWalls(Img) {
  const back = wallStrip(Img, FLOOR.x1 - FLOOR.x0, {
    windows: WINDOWS.map((w) => [w.x0 - FLOOR.x0, w.x1 - FLOOR.x0]),
    joists: [32, 112, 192],
  })
  const side = FLOOR.y1 - FLOOR.y0
  const left = wallStrip(Img, side, { joists: [22, 65, 108], shade: 0.12 })
  const right = wallStrip(Img, side, { joists: [22, 65, 108], shade: 0.06 })
  const front = wallStrip(Img, FLOOR.x1 - FLOOR.x0, { door: [DOOR.x0 - FLOOR.x0, DOOR.x1 - FLOOR.x0], joists: [32, 192], shade: 0.18 })
  const sheet = new Img(back.w + side + 2, WALL_H * 2 + 2)
  const rects = {
    back: { x: 0, y: 0, w: back.w, h: WALL_H },
    front: { x: 0, y: WALL_H + 2, w: front.w, h: WALL_H },
    left: { x: back.w + 2, y: 0, w: side, h: WALL_H },
    right: { x: back.w + 2, y: WALL_H + 2, w: side, h: WALL_H },
  }
  for (const [k, im] of Object.entries({ back, front, left, right })) sheet.blit(im, rects[k].x, rects[k].y)
  return { image: sheet, rects, back }
}

/* ───────── Ще речі для хати (рівні 1–3) ───────── */

const T = { T: '#c8703a', t: '#8e4a24', y: '#e8a060' } // глина
/** Дві світлини в рамках: дідусь і подружжя. */
const PHOTO1 = ['gggggggg', 'gSSSSSSg', 'gSShhSSg', 'gSheehSg', 'gShhhhSg', 'gSSbbSSg', 'gSbbbbSg', 'gSbbbbSg', 'gggggggg']
const PHOTO2 = ['gggggggggg', 'gSSSSSSSSg', 'gShhSShhSg', 'gSeeSSeeSg', 'gSbbSSrrSg', 'gSbbSSrrSg', 'gggggggggg']
const PHOTO_PAL = { g: '#8b5d3b', S: '#d8c8a0', h: '#5a4030', e: '#e8c8a0', b: '#6a5040', r: '#8a3a30' }
/** Вішак-кілочки: бриль зі стрічкою, вишита торба, хустка. */
const PEG_RAIL = ['xxxxxxxxxxxxxxxxxxxxxxxxxx', 'XXXXXXXXXXXXXXXXXXXXXXXXXX', '...p.......p.......p......']
const HAT = ['...yyyy...', '..yYYYYy..', '.rrrrrrrr.', 'yYYYYYYYYy', '.yyyyyyyy.']
const BAG = ['..ss..', '.s..s.', 'WWWWWW', 'WrWWrW', 'WWrrWW', 'WrWWrW', 'WWWWWW', '.WWWW.']
const SCARF = ['RRRR', 'RyRR', 'RRRy', 'RRyR', '.RR.', '..R.']
const PEG_PAL = { x: '#b07a4c', X: '#6b4426', p: '#5b3a22', y: '#d9b45a', Y: '#f0d27a', r: '#c8372d', s: '#8b5d3b', W: '#f3eee2', R: '#c8372d' }
/** Кобза на стіні з червоною стрічкою. */
const KOBZA = [
  '....mm.....',
  '....hm.....',
  '....bm.....',
  '...rbmr....',
  '....bm.r...',
  '....bm.....',
  '....bm.....',
  '...hhhm....',
  '..hhbbbm...',
  '.hhbwbbbm..',
  '.hbbwbbbm..',
  'hbbbkkkbbm.',
  'hbbkkwkkbm.',
  'hbbbkwkbbm.',
  'hbbbbwbbbm.',
  'hbbbbwbbbm.',
  '.hbbbwbbm..',
  '..hbbbbm...',
  '...mmmm....',
]
const KOBZA_PAL = { h: '#e0b070', b: '#b8823c', m: '#7a5232', k: '#3b2a1f', w: '#f6f0d8', r: '#c8372d' }
/** Віночок із квітів і стрічок. */
const WREATH = [
  '...grRgYygbBg...',
  '..rRglyYgbBgpP..',
  '.gRg........Ppg.',
  '.yY..........gl.',
  '.Yyg........grR.',
  '..gYygrRgbBgpPg.',
  '...grRgYygbBg...',
  '.....RYBGPR.....',
  '.....RYBGPR.....',
  '.....RYBGPR.....',
  '.....RYB.PR.....',
  '.....R..B.P.....',
  '.....R....P.....',
]
const WREATH_PAL = { g: '#3f7d27', l: '#74bb44', r: '#c8372d', R: '#e2485a', y: '#e8a91a', Y: '#ffd23c', b: '#3a6fc0', B: '#5b8ef0', p: '#d0508a', P: '#f07ab0', G: '#5aa83e' }
/** Ходики: будиночок із циферблатом, маятник і шишки-гирі на ланцюжках. */
const CLOCK = [
  '.....hh.....',
  '....hbbh....',
  '...hbbbbh...',
  '..hbbbbbbh..',
  '..bWWWWWWb..',
  '..bWkWWkWb..',
  '..bWWkkWWb..',
  '..bWkWWWWb..',
  '..bWWWWWWb..',
  '..bbbbbbbb..',
  '..mbrrrrbm..',
  '...mmmmmm...',
  '....c..c.p..',
  '....c..c.p..',
  '....c..c.p..',
  '...ww.c..p..',
  '...ww.c.yyy.',
  '...ww.ww.y..',
  '...ww.ww....',
  '......ww....',
]
const CLOCK_PAL = { h: '#c79a62', b: '#8b5d3b', m: '#5b3a22', W: '#f6f0e2', k: '#2b1d16', r: '#c8372d', c: '#aaa196', p: '#c2922a', y: '#ffd860', w: '#6a5a40' }
/** Дзеркальце під вишитим рушником. */
const MIRROR = [
  'RWWRWWRWWRWWRW',
  'WWWWWWWWWWWWWW',
  'WRWhhhhhhhhWRW',
  'WWWhGGGGGGhWWW',
  'WRWhGgGGGGhWRW',
  'WWWhGGgGGGhWWW',
  'WRWhGGGgGGhWRW',
  'WWWhGGGGGGhWWW',
  'WRWhGGGGgGhWRW',
  'WWWhGGGGGGhWWW',
  'WRWhhhhhhhhWRW',
  'WWW........WWW',
  'RRR........RRR',
  'R.R........R.R',
]
const MIRROR_PAL = { R: '#c8372d', W: '#f6f0e2', h: '#8b5d3b', G: '#bfe0ee', g: '#ffffff' }

/** Дрова біля печі: торці полін пірамідкою. */
const LOGE = ['.ooo.', 'oLlLo', 'olmlo', 'oLlLo', '.ooo.']
const LOGE_PAL = { o: '#5b3a22', L: '#e0b878', l: '#c8985a', m: '#a07040' }
/** Мішки з зерном: зав'язаний і відкритий. */
const SACK = ['..nnnnn..', '..NrrrN..', '...rrr...', '..NNNNN..', '.NNNNNNN.', 'NNNNnNNNN', 'NNNNNNNNn', 'NNnNNNNNn', 'NNNNNNNnn', '.NNNNNnn.', '..nnnnn..']
const SACK_OPEN = ['.nnnnnnn.', 'nyyYyyYyn', 'nyYyyyyyn', 'NnnnnnnnN', 'NNNNNNNNN', 'NNNnNNNNn', 'NNNNNNNnn', '.NNNNNnn.', '..nnnnn..']
const SACK_PAL = { N: '#c8a86a', n: '#9a7a48', r: '#c8372d', y: '#e8c860', Y: '#fff0a0' }
/** Макітра й глечик. */
const MAKITRA = ['.TTTTTTT.', 'TtttttttT', 'TTTTTTTTT', '.TTyTTTt.', '..TTTTt..', '...ttt...']
const JUG2 = ['..tt..', '.tTTt.', '..TT..', '.TTTT.', 'TTyTTt', 'TTTTTt', 'TTTTtt', '.TTtt.', '..tt..']
/** Чоботи біля дверей. */
const BOOTS = ['.bbb..bbb...', '.bBb..bBb...', '.bBb..bBb...', '.bBb..bBb...', '.bBb..bBb...', '.bBbb.bBbb..', '.bBBbbbBBbb.', '.bbbbbbbbbb.']
/** Скринька з городиною: гарбуз, капуста, морква. */
const CRATE = ['xxxxxxxxxxxxxxxxxx', 'xhhhhhhhhhhhhhhhhx', 'xbbbbbbbbbbbbbbbbx', 'xmmmmmmmmmmmmmmmmx', 'xbbbbbbbbbbbbbbbbx', 'xbbbbbbbbbbbbbbbbx', 'xxxxxxxxxxxxxxxxxx']
const PUMPKIN_S = ['..n....', '.QPPp..', 'QPPPPp.', 'PPPPPp.', '.pppp..']
const CABBAGE_S = ['.vVVv.', 'vVaaVv', 'vaAAav', 'vVaaVv', '.vvvv.']
const CARROTS_S = ['l.l.l', 'OlOlO', 'OOOOO', '.O.O.']
const CRATE_PAL = { x: '#5b3a22', h: '#c79a62', b: '#a0714a', m: '#7a5232', n: '#6a7a2a', Q: '#ffb060', P: '#f08a2c', p: '#c45812', v: '#5f9e78', V: '#8cc49a', a: '#c4e290', A: '#eaf4bc', l: '#74bb44', O: '#f08a2c' }
/** Умивальник: дерев'яна підставка, миска, глечик і рушник. */
const WASHSTAND = [
  '..........tt....',
  '.........tTTt...',
  '..ccccccc.TT....',
  '.cBBBBBBBcTTt...',
  'hhhhhhhhhhhhhhhh',
  'bbbbbbbbbbbbbbbb',
  '.b.WWWWW.....b..',
  '.b.WrWrW.....b..',
  '.b.WWWWW.....b..',
  '.b.WrWrW.....b..',
  '.b.WWWWW.....b..',
  '.b.R.R.R.....b..',
  '.bbbbbbbbbbbbb..',
  '.b...........b..',
  '.b...........b..',
  '.m...........m..',
]
const WASH_PAL = { t: '#8e4a24', T: '#c8703a', c: '#aaa196', B: '#9ad0f0', h: '#c79a62', b: '#8b5d3b', m: '#5b3a22', W: '#f6f0e2', r: '#c8372d', R: '#c8372d' }
/** Маслобійка. */
const CHURN = ['....h.....', '....h.....', '....h.....', '..mmhmm...', '.mbbhbbm..', '.bhbbbbm..', '.IIIIIII..', '.bhbbbbm..', '.bhbbbbm..', '.bhbbbbm..', '.IIIIIII..', '.bhbbbbm..', '.bhbbbbm..', '..mmmmm...']
const CHURN_PAL = { h: '#c79a62', b: '#a0714a', m: '#6b4426', I: '#6f675c' }
/** Ящик із закрутками: огірки, помідори, варення. */
const JAR = ['.cc.', 'LggG', 'GgGG', 'GGgG', 'GGGG', '.GG.']
const JARS_CRATE = ['xxxxxxxxxxxxxxxxxxxx', 'xhhhhhhhhhhhhhhhhhhx', 'xbbbbbbbbbbbbbbbbbbx', 'xxxxxxxxxxxxxxxxxxxx']
/** Коромисло з відрами води. */
const YOKE = ['..hh..................hh..', '....hhh............hhh....', '.......hhhhhhhhhhhh.......']
const BUCKET = ['IIIIIII', 'IwwWwwI', '.bbbbb.', '.bhbbm.', '.IIIII.', '.bhbbm.', '.bbbbm.', '..mmm..']
const YOKE_PAL = { h: '#c79a62', c: '#aaa196', I: '#6f675c', w: '#9ad0f0', W: '#cfeaff', b: '#a0714a', m: '#6b4426' }
/** Алое в горщику. */
const ALOE = ['..g..g..', '.gG.gG..', '.gGgGg.g', '..gGGgG.', '...GGG..', '.TTTTTT.', '.tTTTTt.', '..tTTt..', '..tttt..']

/** Нові речі — сітки з тінню й контуром, як решта меблів. */
function extraSprites(Img) {
  const make = (w, h, layers, { contour = 1, grounded = true } = {}) => {
    const s = new Img(w + 2, h + 3)
    if (grounded) s.ellipse((w + 2) / 2, h + 1, w / 2 + 1, 2, '#1a0e06', 0.3)
    for (const [rows, x, y, pal] of layers) s.rows(rows, x + 1, y + 1, pal)
    return contour ? s.outline(K, contour) : s
  }
  const wall = (w, h, layers) => make(w, h, layers, { contour: 0.8, grounded: false })
  const pots = make(16, 9, [[JUG2, 0, 0, T], [MAKITRA, 7, 3, T]])
  const firewood = make(20, 14, [
    [LOGE, 5, 1, LOGE_PAL], [LOGE, 10, 1, LOGE_PAL],
    [LOGE, 3, 5, LOGE_PAL], [LOGE, 8, 5, LOGE_PAL], [LOGE, 13, 5, LOGE_PAL],
    [LOGE, 0, 9, LOGE_PAL], [LOGE, 5, 9, LOGE_PAL], [LOGE, 10, 9, LOGE_PAL], [LOGE, 15, 9, LOGE_PAL],
  ])
  const jarPal = (g, l) => ({ c: '#aaa196', L: '#e8f4f8', G: g, g: l })
  return {
    home_photos: wall(20, 10, [[PHOTO1, 0, 0, PHOTO_PAL], [PHOTO2, 10, 2, PHOTO_PAL]]),
    home_hat_pegs: wall(26, 13, [[PEG_RAIL, 0, 0, PEG_PAL], [HAT, -1, 3, PEG_PAL], [BAG, 9, 3, PEG_PAL], [SCARF, 18, 3, PEG_PAL]]),
    home_kobza: wall(11, 19, [[KOBZA, 0, 0, KOBZA_PAL]]),
    home_wreath: wall(16, 13, [[WREATH, 0, 0, WREATH_PAL]]),
    home_clock: wall(12, 20, [[CLOCK, 0, 0, CLOCK_PAL]]),
    home_mirror: wall(14, 14, [[MIRROR, 0, 0, MIRROR_PAL]]),
    home_firewood: firewood,
    home_sacks: make(19, 11, [[SACK_OPEN, 0, 2, SACK_PAL], [SACK, 10, 0, SACK_PAL]]),
    home_pots: pots,
    home_boots: make(12, 8, [[BOOTS, 0, 0, { b: '#2a201a', B: '#5a4a40' }]]),
    home_veg_crate: make(18, 11, [[PUMPKIN_S, 1, 0, CRATE_PAL], [CABBAGE_S, 7, 0, CRATE_PAL], [CARROTS_S, 13, 1, CRATE_PAL], [CRATE, 0, 4, CRATE_PAL]]),
    home_washstand: make(16, 16, [[WASHSTAND, 0, 0, WASH_PAL]]),
    home_churn: make(10, 14, [[CHURN, 0, 0, CHURN_PAL]]),
    home_jars: make(20, 9, [
      [JAR, 1, 0, jarPal('#5a8a3a', '#8ab85a')], [JAR, 6, 0, jarPal('#c8402a', '#e86a4a')],
      [JAR, 11, 0, jarPal('#e8a020', '#ffd060')], [JAR, 15, 0, jarPal('#5a8a3a', '#8ab85a')],
      [JARS_CRATE, 0, 5, CRATE_PAL],
    ]),
    home_yoke: make(26, 14, [[YOKE, 0, 0, YOKE_PAL], [['c', 'c', 'c'], 2, 3, YOKE_PAL], [['c', 'c', 'c'], 23, 3, YOKE_PAL], [BUCKET, 0, 6, YOKE_PAL], [BUCKET, 19, 6, YOKE_PAL]]),
    home_aloe: make(8, 9, [[ALOE, 0, 0, { ...T, g: '#74bb44', G: '#3f7d27' }]]),
  }
}

/**
 * @param {{ Img: any, hash: (x: number, y: number, s: number) => number }} h
 */
export function homeArt({ Img, hash }) {
  const { w: W, h: H } = HOME_MAP
  const { x0: FX0, x1: FX1, y0: FY0, y1: FY1 } = FLOOR

  /* ───── Фон ───── */
  const img = new Img(W, H)
  img.rect(0, 0, W, H, '#1a120d')

  // Підлога: дошки по 8 px різної довжини, стики вразбіг, прожилки, сучки й цвяхи на кінцях.
  const LENS = [44, 60, 52, 36, 68, 48]
  for (let row = 0; FY0 + row * 8 < FY1; row++) {
    const y = FY0 + row * 8
    let x = FX0 - ((row * 23) % 44)
    for (let k = 0; x < FX1; k++) {
      const len = LENS[(row * 4 + k) % LENS.length]
      const t = PLANKS[Math.floor(hash(row, k, 7) * PLANKS.length)]
      const grainRow = 2 + Math.floor(hash(row, k, 8) * 4)
      const g0 = 5 + Math.floor(hash(row, k, 9) * (len / 3))
      const g1 = g0 + 6 + Math.floor(hash(row, k, 10) * (len / 3))
      const knot = hash(row, k, 11) < 0.35 ? x + Math.floor(len * 0.65) : -1
      for (let dy = 0; dy < 8; dy++)
        for (let dx = 0; dx < len; dx++) {
          const px = x + dx
          const py = y + dy
          if (px < FX0 || px >= FX1 || py >= FY1) continue
          let c = dy === 0 ? t.h : dy === 7 ? SEAM : t.b
          if (dx === 0 && dy < 7) c = SEAM
          else if (dy === grainRow && dx >= g0 && dx < g1) c = t.g
          else if (dy === (grainRow + 3) % 6 + 1 && dx >= g1 - 4 && dx < g1 + 6) c = t.g
          if (knot >= 0 && dy >= 3 && dy <= 4 && (px === knot || px === knot + 1)) c = t.k
          if ((dx === 2 || dx === len - 3) && dy === 3) c = '#3b2a1f' // цвяхи
          img.set(px, py, c)
        }
      x += len
    }
  }

  // Стіни стоять у 3D (рушій ставить їх вертикально довкола підлоги) — тут лише «шапки»:
  // зріз зрубу довкола підлоги, який видно там, де стіну між камерою й кімнатою сховано.
  const CAP = 6
  const capRows = [WOOD.s, WOOD.H, WOOD.b, WOOD.m, WOOD.b, WOOD.d]
  for (let k = 0; k < CAP; k++) {
    img.hline(FX0 - CAP, FX1 + CAP - 1, FY0 - CAP + k, capRows[k]) // за задньою стіною
    img.hline(FX0 - CAP, FX1 + CAP - 1, FY1 + k, capRows[k]) // передня
    img.vline(FX0 - CAP + k, FY0 - CAP, FY1 + CAP - 1, capRows[k]) // ліва
    img.vline(FX1 + CAP - 1 - k, FY0 - CAP, FY1 + CAP - 1, capRows[k]) // права
  }
  // Сучки й стики колод на шапці, щоб не була пласкою.
  for (let x = FX0; x < FX1; x += 23) {
    img.set(x, FY0 - 3, WOOD.s)
    img.set(x + 11, FY1 + 2, WOOD.s)
  }
  // Поріг у передній шапці: камінь і трава надворі.
  img.rect(DOOR.x0, FY1, DOOR.x1 - DOOR.x0, CAP, '#aaa196')
  img.hline(DOOR.x0, DOOR.x1 - 1, FY1, '#cfc8bb')
  img.rect(DOOR.x0, FY1 + CAP, DOOR.x1 - DOOR.x0, H - FY1 - CAP, '#74bb44')
  for (const [x, y] of [[3, 1], [9, 3], [17, 0], [21, 2]]) img.set(DOOR.x0 + x, FY1 + CAP + y, '#559b33')

  // Тіні: від задньої стіни, біля бічних стін (смуги рівного тону, без градієнта).
  for (const [y, a] of [[FY0, 0.32], [FY0 + 1, 0.2], [FY0 + 2, 0.1]]) img.hline(FX0, FX1 - 1, y, '#1a0e06', a)
  for (const [dx, a] of [[0, 0.24], [1, 0.12]]) {
    img.vline(FX0 + dx, FY0, FY1 - 1, '#1a0e06', a)
    img.vline(FX1 - 1 - dx, FY0, FY1 - 1, '#1a0e06', a)
  }
  // Сонце з вікон: чіткі плями одного тону.
  for (const win of WINDOWS)
    for (let y = FY0 + 2; y < FY0 + 40; y++) {
      const shift = Math.round((y - FY0) * 0.5)
      for (let x = win.x0 + 3 + shift; x < win.x1 - 3 + shift; x++) {
        const edge = x === win.x0 + 3 + shift || x === win.x1 - 4 + shift
        img.set(x, y, '#ffe9b0', edge ? 0.08 : 0.16)
      }
    }
  // Тепло від печі на підлозі — два рівні тони.
  for (let y = 100; y < 140; y++)
    for (let x = 160; x < 232; x++) {
      const d = ((x - 196) / 34) ** 2 + ((y - 116) / 16) ** 2
      if (d < 0.45) img.set(x, y, '#ffb050', 0.12)
      else if (d < 1) img.set(x, y, '#ffb050', 0.06)
    }
  // Килимок біля дверей.
  img.rows(DOORMAT, DOOR.x0 - 2 + ((DOOR.x1 - DOOR.x0 + 4 - 24) >> 1), FY1 - 9, DOORMAT_PAL)

  /* ───── Меблі ───── */
  /** Спрайт із сітки; grounded — м'яка тінь під ним (напівпрозора, тож контур її не обводить). */
  const sprite = (rows, pal, contour = 1, grounded = false) => {
    const w = Math.max(...rows.map((r) => r.length))
    const s = new Img(w + 2, rows.length + 3)
    if (grounded) s.ellipse((w + 2) / 2, rows.length + 1, w / 2 + 1, 2, '#1a0e06', 0.3)
    s.rows(rows, 1, 1, pal)
    return contour ? s.outline(K, contour) : s
  }
  /** Кругла ткана доріжка з клаптиків: кільця кольорів (рівень 1, під столом і біля дверей). */
  const ragRug = () => {
    const rw = 52
    const rh = 26
    const s = new Img(rw, rh)
    const RINGS = ['#8e2a1f', '#c8372d', '#e9c56a', '#3a6fc0', '#f3eee2', '#c8372d', '#5aa83e', '#e9c56a', '#c8372d']
    for (let y = 0; y < rh; y++)
      for (let x = 0; x < rw; x++) {
        const d = Math.hypot((x + 0.5 - rw / 2) / (rw / 2), (y + 0.5 - rh / 2) / (rh / 2))
        if (d > 1) continue
        const ring = Math.min(RINGS.length - 1, Math.floor((1 - d) * RINGS.length * 1.1))
        // Стібки між кільцями: кожна друга точка трохи темніша — видно плетіння.
        const stitch = (x + y) % 3 === 0 && Math.floor((1 - d) * RINGS.length * 1.1 * 2) % 2 === 0
        s.set(x, y, stitch ? '#6e1f18' : RINGS[ring])
      }
    return s
  }
  /** Стіл: скатертина + речі зверху. */
  const table = (lamp) => {
    const s = sprite(tableRows(), TABLE_PAL, 1, true)
    s.rows(LOAF, 17, 5, PROP_PAL)
    s.rows(SALT, 29, 6, PROP_PAL)
    s.rows(JUG, 8, 4, PROP_PAL)
    if (lamp) s.rows(LAMP, 33, 1, PROP_PAL)
    return s
  }
  const bed = sprite(bedRows(), BED_PAL, 1, true)

  const sprites = {
    home_bed: bed,
    home_table: table(false),
    home_table_3: table(true),
    home_chest: sprite(CHEST, CHEST_PAL, 1, true),
    home_rag_rug: ragRug(),
    home_geraniums: sprite(GERANIUMS, GERANIUM_PAL, 0.8),
    home_garlic: sprite(GARLIC, BRAID_PAL, 0.8),
    home_peppers: sprite(PEPPERS, BRAID_PAL, 0.8),
    home_icon: sprite(ICON, ICON_PAL, 0.7),
  }
  Object.assign(sprites, extraSprites(Img))
  return { image: img, sprites, walls: buildWalls(Img) }
}
