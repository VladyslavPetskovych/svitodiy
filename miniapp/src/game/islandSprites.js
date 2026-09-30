/**
 * Піксельні спрайти будівель острова — у палітрі home.webp.
 * Кожен спрайт — рядки символів (символ = піксель, «.» — прозорий).
 * Координати на острові — у пікселях home.webp (900×900), якір — низ по центру.
 */

/** Розмір «пікселя» спрайта в пікселях home.webp — як дрібні деталі на самій картинці. */
export const ART_PX = 5

export const PALETTE = {
  K: '#3b2a22', // контур
  R: '#b5452d', // черепиця / червоний
  r: '#7e2c1f',
  Y: '#ffd35a', // світло у вікні
  y: '#fff2a8',
  W: '#efe9dc', // побілка
  w: '#cfc6b3',
  S: '#b8b2a6', // камінь
  s: '#8f887c',
  d: '#5e574f',
  B: '#5b3a22', // темне дерево
  b: '#8b5d3b', // дерево
  L: '#c79a62', // світле дерево
  G: '#3d7a26', // зелень
  g: '#6bb03a',
  l: '#9bd35a',
  M: '#6b4426', // земля
  m: '#4e3019',
  O: '#e8892d', // гарбуз
  o: '#b8621b',
  U: '#2f6fd0', // прапор
  u: '#ffd23c',
  P: '#e86b9a', // квіти
  C: '#7d8a94', // метал
}

/** Полотно: stamp() накладає фрагменти, grow() додає місце зверху. */
function canvas(w, h) {
  const rows = Array.from({ length: h }, () => Array(w).fill('.'))
  return {
    rows,
    stamp(lines, x, y) {
      lines.forEach((line, dy) => {
        ;[...line].forEach((ch, dx) => {
          const row = rows[y + dy]
          if (ch !== '.' && row && x + dx >= 0 && x + dx < w) row[x + dx] = ch
        })
      })
      return this
    },
    done: () => rows.map((r) => r.join('')),
  }
}

/* ───────── Маяк: з кожним рівнем вищий, на 3-му — яскравий вогонь ───────── */

function lighthouse(level) {
  const tower = 5 + 4 * level
  const top = [
    '......KKK......',
    '.....KRRRK.....',
    '....KRRRRrK....',
    '....KKKKKKK....',
    level >= 3 ? '....KyYyYyK....' : '....KYKYKYK....',
    level >= 3 ? '....KYyYyYK....' : '....KYYYYYK....',
    '...KKKKKKKKK...',
  ]
  const body = Array.from({ length: tower }, (_, i) => {
    const red = Math.floor(i / 3) % 2 === 1
    const [c, sh] = red ? ['R', 'r'] : ['W', 'w']
    if (i === 2) return `....K${c}KYK${sh}K....`
    if (i === tower - 2) return `....K${c}KKK${sh}K....`
    if (i === tower - 1) return `....K${c}KKK${sh}K....`
    return `....K${c}${c}${c}${c}${sh}K....`
  })
  const rocks = ['..dsSSsSSSsSd..', '.dsSsSSsdSSsSd.', 'ddsdsdddsdsddsd']
  const all = [...top, ...body, ...rocks]
  return canvas(15, all.length).stamp(all, 0, 0).done()
}

/* ───────── Город: грядки, далі паркан і капуста, потім гарбузи й опудало ───────── */

function garden(level) {
  const c = canvas(16, 10)
  c.stamp(['.l.l.l.l.l.l.l..', 'gGgGgGgGgGgGgGg.', 'MMMMMMMMMMMMMMM.', 'mmmmmmmmmmmmmmm.'], 0, 6)
  if (level >= 2) {
    c.stamp(['..gG..gG..gG....', '.gGGg.gGGggGGg..', 'MMMMMMMMMMMMMMM.'], 0, 3)
    c.stamp(['L', 'b', 'b', 'b', 'b', 'b'], 15, 4)
    c.stamp(['LLLL', 'bbbb'], 12, 5)
  }
  if (level >= 3) {
    c.stamp(['.G..', 'OoOO', 'OOoO'], 1, 7)
    c.stamp(['.G.', 'OOo', 'oOO'], 9, 7)
    c.stamp(['..LLL..', '..KyK..', 'bbRRRbb', '...R...', '...b...', '...b...'], 4, 0)
  }
  return c.done()
}

/* ───────── Майстерня на палях: курінь → комин і бочка → флюгер-прапор ───────── */

function workshop(level) {
  const c = canvas(18, 17)
  c.stamp(
    [
      '...KKKKKKKKKKK....',
      '..KBbBbBbBbBbBK...',
      '.KBbBbBbBbBbBbBK..',
      '..KLLLLLLLLLLLK...',
      '..KLKKLLLLKYYLK...',
      '..KLKKLLLLKYYLK...',
      '..KLKKLLLLLLLLK...',
      '.BBBBBBBBBBBBBBBB.',
      '..B.....B......B..',
      '..B.....B......B..',
    ],
    0,
    7
  )
  if (level >= 2) {
    c.stamp(['.ss.', 'KddK', 'KsdK'], 10, 5)
    c.stamp(['KbbK', 'bLLb', 'KbbK'], 14, 11)
  }
  if (level >= 3) {
    c.stamp(['KUUU', 'KUUU', 'Kuuu', 'Kuuu', 'K...', 'K...', 'K...'], 2, 0)
    c.stamp(['.CC', 'CCC'], 6, 12)
  }
  return c.done()
}

/* ───────── Прикраси до хатинки й причалу з картинки ───────── */

const FLOWER_BOX = ['.P.u.P.', 'gGgGgGg', 'bbbbbbb']
const LANTERN = ['.K.', 'KYK', 'KyK', '.K.', '.B.', '.B.']
const FLAG = ['KUUUU', 'KUUUU', 'Kuuuu', 'Kuuuu', 'K....', 'K....', 'K....']
const POST_LANTERN = ['KYK', 'KyK', '.B.', '.B.']
const SAILBOAT = [
  '.....K.......',
  '.....KW......',
  '.....KWW.....',
  '.....KWWW....',
  '.....KRRRR...',
  '.....KWWWWW..',
  '.....K.......',
  'BbbbbbbbbbbB.',
  '.BbbbbbbbbB..',
  '..BBBBBBBB...',
]
const SIGN = ['.KKKKK.', '.KLLLK.', '.KLKLK.', '.KKKKK.', '...B...', '...B...']

/**
 * Що намалювати для будівлі на рівні: список спрайтів з позиціями.
 * reflect — віддзеркалити у воді (стоїть на воді, як човен на картинці).
 * @returns {{ rows: string[], x: number, y: number, reflect?: boolean }[]}
 */
export function buildingSprites(id, level) {
  switch (id) {
    case 'house':
      return [
        ...(level >= 2
          ? [
              { rows: FLOWER_BOX, x: 429, y: 492 },
              { rows: LANTERN, x: 506, y: 492 },
            ]
          : []),
        ...(level >= 3 ? [{ rows: FLAG, x: 470, y: 408 }] : []),
      ]
    case 'pier':
      return [
        ...(level >= 2
          ? [
              { rows: POST_LANTERN, x: 393, y: 562 },
              { rows: POST_LANTERN, x: 545, y: 562 },
            ]
          : []),
        ...(level >= 3 ? [{ rows: SAILBOAT, x: 292, y: 614, reflect: true }] : []),
      ]
    case 'lighthouse':
      return level > 0 ? [{ rows: lighthouse(level), x: 205, y: 600, reflect: true }] : []
    case 'garden':
      return level > 0 ? [{ rows: garden(level), x: 612, y: 552 }] : []
    case 'workshop':
      return level > 0 ? [{ rows: workshop(level), x: 745, y: 603, reflect: true }] : []
    default:
      return []
  }
}

/** Де будівля на острові: центр (зона дотику, підпис, ділянка) і top — над дахом, для бульбашки врожаю. */
export const BUILDING_SPOTS = {
  house: { x: 460, y: 440, top: 390 },
  pier: { x: 470, y: 580, top: 545 },
  lighthouse: { x: 205, y: 540, top: 460 },
  garden: { x: 612, y: 520, top: 495 },
  workshop: { x: 745, y: 560, top: 510 },
}

/** Порожня ділянка: табличка на скелі / на палях / на латці землі. */
export function plotSprite(id) {
  const { x, y } = BUILDING_SPOTS[id]
  switch (id) {
    case 'lighthouse':
      return { rows: canvas(15, 9).stamp(SIGN, 4, 0).stamp(['..dsSSsSSSsSd..', '.dsSsSSsdSSsSd.', 'ddsdsdddsdsddsd'], 0, 6).done(), x, y: 600, reflect: true }
    case 'workshop':
      return { rows: canvas(18, 9).stamp(SIGN, 5, 0).stamp(['.BBBBBBBBBBBBBBBB.', '..B.....B......B..', '..B.....B......B..'], 0, 6).done(), x, y: 603, reflect: true }
    default:
      return { rows: canvas(12, 8).stamp(SIGN, 2, 0).stamp(['.MMMMMMMMMM.', 'mMmMmMmMmMmm'], 0, 6).done(), x, y: y + 32 }
  }
}
