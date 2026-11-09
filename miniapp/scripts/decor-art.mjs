/**
 * Нові речі для пісочниці в хатинці — окремий аркуш home-decor.png (спрайти hd_*).
 * Той самий підхід, що й у home-art.mjs: намальовані вручну сітки символів, тим самим пікселем,
 * що й увесь острів; 3–5 тонів на матеріал, світло зверху зліва, темний контур, м'яка тінь.
 * Регулярні частини (дошки, смуги, візерунок килима) складено з повторів — щоб ширини сходились.
 */

const K = '#2b1d16'
const rep = (ch, n) => ch.repeat(n)

/* ───────── Палітри ───────── */

const WOOD = { s: '#3b2a1f', d: '#5b3a22', m: '#6b4426', b: '#8b5d3b', H: '#b07a4c', h: '#c79a62' }
const CLOTH = { W: '#f6f0e2', w: '#d9ccb2', R: '#c8372d', r: '#8e2a1f', k: '#2b1d16', Y: '#ffd23c', y: '#c49a32', G: '#3f7d27', g: '#74bb44', B: '#3a6fc0', l: '#9fc4f0' }
const METAL = { c: '#aaa196', C: '#6f675c' }

/* ───────── Меблі ───────── */

/** Ткацький верстат: рама, нитки основи, бердо, натканий рушник із червоним узором. */
function loomRows() {
  const side = (mid) => `.sbs${mid}sbs.`
  const warp = side(rep('W.', 11))
  return [
    `.${rep('s', 28)}.`,
    `s${rep('h', 28)}s`,
    `s${rep('b', 28)}s`,
    warp, warp, warp, warp, warp,
    side(rep('m', 22)),
    warp, warp, warp,
    side(rep('W', 22)),
    side(`${rep('WRRW', 5)}WR`),
    side(`${rep('RkkR', 5)}Rk`),
    side(`${rep('WRRW', 5)}WR`),
    side(rep('W', 22)),
    side(`${rep('WWYW', 5)}WW`),
    side(rep('W', 22)),
    side(rep('b', 22)),
    side(rep('m', 22)),
    side(rep('.', 22)),
    side(rep('.', 22)),
    `.sms${rep('.', 22)}sms.`,
  ]
}

/** Колиска на полозках: подушечка й червона ковдрочка. */
const CRADLE = [
  `..${rep('s', 18)}..`,
  `.s${rep('h', 18)}s.`,
  `shbWWWW${rep('R', 12)}bhs`,
  `shbWwwW${rep('RW', 6)}bhs`,
  `shbWWWW${rep('R', 12)}bhs`,
  `shbwwww${rep('r', 12)}bhs`,
  `s${rep('b', 20)}s`,
  `.s${rep('m', 18)}s.`,
  `..s.s${rep('.', 12)}s.s..`,
  `sb${rep('.', 18)}bs`,
  `.s${rep('b', 18)}s.`,
]

/** Комод із трьома шухлядами й латунними ручками. */
const DRESSER = (() => {
  const drawer = `sb${rep('H', 10)}yy${rep('H', 10)}bs`
  const shade = `sb${rep('b', 22)}bs`
  const sep = `s${rep('m', 24)}s`
  return [`.${rep('s', 24)}.`, `s${rep('h', 24)}s`, `s${rep('H', 24)}s`, sep, drawer, shade, sep, drawer, shade, sep, drawer, shade, `s${rep('d', 24)}s`, `.s${rep('.', 22)}s.`]
})()
const VASE = ['.R.Y.p.', 'RYR.pYp', '.R.g.p.', '..ggg..', '..lBl..', '.lBBBl.', '.BBlBB.', '.BBBBB.', '..BBB..']
const DOILY = [`.${rep('W', 11)}.`, 'W.W.W.W.W.W.W']

/** Розписна шафа: дві дверцята з филенками й квітами. */
const WARDROBE = (() => {
  const plain = `sG${rep('E', 9)}kk${rep('E', 9)}Gs`
  const tb = `sGE${rep('e', 7)}EkkE${rep('e', 7)}EGs`
  const sideRow = `sGEe${rep('E', 5)}eEkkEe${rep('E', 5)}eEGs`
  const knob = `sGEe${rep('E', 5)}eykkye${rep('E', 5)}eEGs`
  return [
    `..${rep('s', 20)}..`,
    `.s${rep('h', 20)}s.`,
    `s${rep('b', 22)}s`,
    `s${rep('m', 22)}s`,
    plain,
    tb,
    ...Array(9).fill(sideRow),
    knob,
    ...Array(11).fill(sideRow),
    tb,
    plain,
    `s${rep('m', 22)}s`,
    `s${rep('d', 22)}s`,
    `.s${rep('.', 20)}s.`,
  ]
})()
const FLOWER5 = ['.R.', 'RYR', '.R.', '.g.', 'gGg']

/** Крісло-гойдалка з червоною подушкою. */
const ROCKER = [
  `...${rep('s', 12)}...`,
  `..s${rep('h', 12)}s..`,
  ...Array(6).fill(`..s${rep('b.', 6)}s..`),
  `..s${rep('h', 12)}s..`,
  `.s${rep('R', 14)}s.`,
  `.s${rep('R', 14)}s.`,
  `.s${rep('r', 14)}s.`,
  ...Array(3).fill(`.sb${rep('.', 12)}bs.`),
  `sb${rep('.', 14)}bs`,
  `s${rep('b', 16)}s`,
  `.${rep('s', 16)}.`,
]

/** Годинник із маятником у високому корпусі. */
const FLOOR_CLOCK = [
  '...ssssss...',
  '..shhhhhhs..',
  '.shbbbbbbhs.',
  `s${rep('b', 10)}s`,
  `sb${rep('W', 8)}bs`,
  'sbWWWkWWWWbs',
  'sbWkWkkWWkbs',
  'sbWWWWkWWWbs',
  `sb${rep('W', 8)}bs`,
  `s${rep('m', 10)}s`,
  ...Array(6).fill('sblLLcLLLlbs'),
  'sblLyyyLLlbs',
  'sblLyYyLLlbs',
  'sblLyyyLLlbs',
  `s${rep('m', 10)}s`,
  ...Array(3).fill(`s${rep('b', 10)}s`),
  `.s${rep('d', 8)}s.`,
  '.ss......ss.',
]

/** Письмовий стіл із шухлядою. */
const DESK = [
  `.${rep('s', 22)}.`,
  `s${rep('h', 22)}s`,
  ...Array(5).fill(`s${rep('b', 22)}s`),
  `s${rep('m', 22)}s`,
  `sb${rep('H', 9)}yy${rep('H', 9)}bs`,
  `s${rep('d', 22)}s`,
  ...Array(4).fill(`.sb${rep('.', 18)}bs.`),
  `.ss${rep('.', 18)}ss.`,
]
const BOOK = ['WWWWkWWWW', 'WkkWkWkkW', 'wwwwkwwww']
const INK = ['.k.', 'kBk', 'kkk']
const QUILL = ['....W', '...W.', '..W..', '.k...']
const CANDLE = ['.Y.', '.o.', '.W.', '.W.', '.W.', 'ccc']

/** Грамофон: латунна труба-квітка на скриньці з ручкою, на столику. */
const GRAMOPHONE = [
  `.....${rep('y', 8)}.....`,
  `...yy${rep('Y', 8)}yy...`,
  `..yYY${rep('k', 8)}YYy..`,
  `..yY${rep('k', 10)}Yy..`,
  `..yYY${rep('k', 8)}YYy..`,
  `...yy${rep('Y', 8)}yy...`,
  '.....yyYYYYyy.....',
  '.......yYYy.......',
  '........yy........',
  '........yy........',
  `...${rep('s', 12)}...`,
  `..s${rep('h', 12)}s..`,
  `..s${rep('b', 12)}s..`,
  `..s${rep('b', 12)}scc`,
  `..s${rep('m', 12)}s..`,
  `..${rep('s', 14)}..`,
  `.${rep('s', 16)}.`,
  `s${rep('h', 16)}s`,
  `s${rep('b', 16)}s`,
  ...Array(4).fill(`.sb${rep('.', 12)}bs.`),
  `.ss${rep('.', 12)}ss.`,
]

/** Швейна машинка з золотим розписом на столі з кованою підніжкою. */
const SEWING = [
  `..${rep('k', 11)}.......`,
  '.kKKyKKKKKKKKk......',
  '.kKKKKKKKKKKKKk.....',
  '.kKk.......kKKk.....',
  '.kKk.......kKKk.....',
  '.kKk.......kKyKk....',
  '.ccc.......kKKKk....',
  '..c........kkkkk....',
  `.${rep('s', 18)}.`,
  `s${rep('h', 18)}s`,
  `s${rep('b', 18)}s`,
  `s${rep('m', 18)}s`,
  `.C${rep('.', 16)}C.`,
  `.C${rep('.', 16)}C.`,
  `.C..${rep('C', 12)}..C.`,
  `.CC${rep('.', 14)}CC.`,
]

/** Кошик із клубками й спицями. */
const YARN = ['...c.....c....', '..RRc...BcB...', '.RrRRR.BBbBB..', '.RRRrRYYBBBb..', rep('n', 14), rep('nN', 7), rep('Nn', 7), rep('nN', 7), `.${rep('Nn', 6)}.`, `..${rep('n', 10)}..`]

/** Лимонне деревце в діжці. */
const LEMON = [
  '.....gggg.....',
  '...ggLLgggg...',
  '..gLLgggYgGg..',
  '.gLggYYgggGGg.',
  '.gggggYggYgGg.',
  'gLgGgggggYYgGg',
  'ggYgGggGgYgGGg',
  '.gYYggGGgggGg.',
  '.ggGgGGgGGGGg.',
  '..gGGGGGGGGg..',
  '....GGGGGG....',
  '......mm......',
  '......mm......',
  '......mm......',
  `..${rep('s', 10)}..`,
  `..s${rep('hH', 4)}s..`,
  `..s${rep('C', 8)}s..`,
  `..s${rep('Hb', 4)}s..`,
  `..s${rep('bH', 4)}s..`,
  `..s${rep('C', 8)}s..`,
  `...s${rep('b', 6)}s...`,
  '....ssssss....',
]

/** Дідух — сніп у глиняному горщику, перев'язаний червоною стрічкою. */
const DIDUKH = [
  '.n..n.n.n..n..',
  '.Nn.NnNnN.nN..',
  'nNNnNNNNNNNNn.',
  '.NNNNNNNNNNN..',
  '..NNNnNnNNN...',
  '...NnNNNnN....',
  '....NNNNN.....',
  '....NnNnN.....',
  '....RRRRR.....',
  '...RrRYRrR....',
  '....RRRRR.....',
  ...Array(5).flatMap(() => ['....NnNnN.....', '....nNnNn.....']),
  '...NnNnNnN....',
  '..nNnNnNnNn...',
  '...TTTTTTT....',
  '...tTTTTTt....',
  '....ttttt.....',
]

/** Лялька-мотанка на ослінчику: червона хустка, вишита сорочка, зелена спідниця. */
const MOTANKA = [
  '...RRRR...',
  '..RrRRrR..',
  '..RWWWWR..',
  '..RWWWWR..',
  '...RRRR...',
  '..WWWWWW..',
  '.WWRWWRWW.',
  'WWWWRRWWWW',
  '.WRWWWWRW.',
  '..YYYYYY..',
  '..GGGGGG..',
  '.GgGGGGgG.',
  '.GGGGGGGG.',
  rep('h', 10),
  '.b......b.',
  '.b......b.',
]

/* ───────── Килими ───────── */

/** Довга смугаста доріжка з торочками. */
function runnerRows() {
  const bands = ['R', 'R', 'k', 'G', 'G', 'Y', 'R', 'R', 'W', 'B', 'B', 'W']
  const rows = [rep('w.', 7)]
  for (let i = 0; i < 42; i++) rows.push(`r${rep(bands[i % bands.length], 12)}r`)
  rows.push(rep('w.', 7))
  return rows
}

/** Гуцульський килим: ромби на червоному полі, темна облямівка, торочки. */
function kilimRows() {
  const W = 34
  const H = 24
  const rows = [rep('w.', W / 2)]
  for (let y = 0; y < H; y++) {
    let row = ''
    for (let x = 0; x < W; x++) {
      if (x < 2 || x >= W - 2 || y < 2 || y >= H - 2) row += x === 1 || x === W - 2 || y === 1 || y === H - 2 ? 'Y' : 'r'
      else {
        const d = Math.abs(((x - 2) % 8) - 4) + Math.abs(((y - 2) % 8) - 4)
        row += d === 4 ? 'k' : d === 2 ? 'Y' : d === 0 ? 'G' : 'R'
      }
    }
    rows.push(row)
  }
  rows.push(rep('w.', W / 2))
  return rows
}

/* ───────── На стіну ───────── */

const PLATE = ['..wwww..', '.wBBBBw.', 'wBWYYWBw', 'wBYRRYBw', 'wBYRRYBw', 'wBWYYWBw', '.wBBBBw.', '..wwww..']
const VIOLIN = [
  '...mm......',
  '..mms....c.',
  '...ms...Wc.',
  ...Array(6).fill('...ks...Wc.'),
  '..hHHh..Wc.',
  '.hHHHHh.Wc.',
  '.hHkkHh.Wc.',
  '..hHkHh.Wc.',
  '..hHkHh.Wc.',
  '.hHHkHHhWc.',
  'hHHkkkHHhc.',
  'hHfHHHfHhc.',
  'hHHHHHHHh..',
  '.hHHHHHh...',
  '..hhhhh....',
  '....m......',
]
const CANDLE_SHELF = [
  '...Y......Y......Y....',
  '..YoY....YoY....YoY...',
  '...W......W......W....',
  '...W......W......W....',
  '...W......W......W....',
  '..cyc....cyc....cyc...',
  rep('h', 22),
  rep('b', 22),
  `.m${rep('.', 18)}m.`,
  `..m${rep('.', 16)}m..`,
]
const EMBROIDERY = (() => {
  const inner = [
    '..............',
    '....rr..rr....',
    '...rRRrrRRr...',
    '...rRRRRRRr...',
    '....rRRRRr....',
    '.....rRRr.....',
    '......rr......',
    '..g...gg...g..',
    '.ggg.gGGg.ggg.',
    '..g..gGGg..g..',
    '.....gGGg.....',
    '..............',
  ].map((r) => r.replaceAll('.', 'W'))
  return [rep('s', 18), `s${rep('h', 16)}s`, ...inner.map((r) => `sh${r}bs`), `s${rep('b', 16)}s`, rep('s', 18)]
})()
const MAP = (() => {
  const inner = [
    'SSSSSSSSSSSSSSSSSSSSSS',
    'SSgGGgSSSSSSSSSSSSkSSS',
    'SgGGGGgSSRSRSRSSSkYkSS',
    'SSgGGgSSRSSSSSSRSSkSSS',
    'SSSgSSSRSSSSSSSSRSSSSS',
    'SSSSSSRSSSSSSSSSSRSSSS',
    'SSSSSSRSSSSgGgSSSSRSSS',
    'SSSSSSSRSSgGGGgSSSSXSS',
    'SSgGgSSSRRgGGGgSSSgGgS',
    'SgGGGgSSSSSgGgSSSgGGGg',
    'SSgGgSSSSSSSSSSSSSgGgS',
    'SSSSSSSSSSSSSSSSSSSSSS',
  ]
  return [`.p${rep('P', 20)}p.`, `p${rep('P', 22)}p`, ...inner.map((r) => `P${r}P`), `p${rep('P', 22)}p`, `.p${rep('P', 20)}p.`]
})()
const PIKE = [
  `...${rep('s', 20)}...`,
  `.ss${rep('h', 20)}ss.`,
  ...Array(6).fill(`sh${rep('b', 22)}hs`),
  `.s${rep('m', 22)}s.`,
  `...${rep('s', 20)}...`,
]
const PIKE_FISH = ['.......GgG.........G', '.GGGGGGGGGGGGGGGG.GG', 'GkLLgLLgLLgLLgLLGGG.', 'GWWWWWWWWWWWWWWWGGG.', '.GWWWWWWWWWWWWGG.GG.']
const HORSESHOE = ['.CC...CC.', 'CcC...CcC', 'CkC...CkC', 'CcC...CcC', 'CkC...CkC', 'CcCC.CCcC', '.CcCCCcC.', '..CCCCC..', '...RRR...', '..R.R.R..']
const WALL_LAMP = ['...gg...', '..gGGg..', '..gYYg..', '.gGYoGg.', '.gGGGGg.', '..gGGg..', '.yyyyyy.', '.yBBBBy.', '.yBlBBy.', '..yyyy..', '...yy...', 'mmmyymmm', '.m....m.', 'mm....mm']

/**
 * @param {{ Img: any }} h — клас полотна генератора
 * @returns {Record<string, any>} спрайти hd_* для аркуша home-decor.png
 */
export function decorArt({ Img }) {
  /** Спрайт із шарів [рядки, x, y, палітра]; grounded — м'яка тінь під ним. */
  const make = (layers, { grounded = true, contour = 1 } = {}) => {
    let w = 0
    let h = 0
    for (const [rows, x, y] of layers) {
      w = Math.max(w, x + Math.max(...rows.map((r) => r.length)))
      h = Math.max(h, y + rows.length)
    }
    const s = new Img(w + 2, h + (grounded ? 3 : 2))
    if (grounded) s.ellipse((w + 2) / 2, h + 1, w / 2 + 1, 2, '#1a0e06', 0.3)
    for (const [rows, x, y, pal] of layers) s.rows(rows, x + 1, y + 1, pal)
    return contour ? s.outline(K, contour) : s
  }
  const wall = (layers) => make(layers, { grounded: false, contour: 0.8 })
  const flat = (layers) => make(layers, { grounded: false, contour: 0.6 })

  const P = { ...WOOD, ...CLOTH, ...METAL }
  const plate = (B, R, Y) => ({ w: '#f6f0e2', W: '#fbfaf4', B, R, Y })

  return {
    hd_loom: make([[loomRows(), 0, 0, P]]),
    hd_cradle: make([[CRADLE, 0, 0, P]]),
    hd_dresser: make([[DRESSER, 0, 9, { ...P, y: '#ffd860' }], [DOILY, 6, 9, P], [VASE, 9, 0, { ...P, p: '#d0508a', L: '#cfe7f0' }]]),
    hd_wardrobe: make([[WARDROBE, 0, 0, { ...P, E: '#3f7a6a', e: '#5a9a88', G: '#2a5a4a', y: '#ffd860' }], [FLOWER5, 4, 8, P], [FLOWER5, 15, 8, P], [FLOWER5, 4, 20, P], [FLOWER5, 15, 20, P]]),
    hd_rocking_chair: make([[ROCKER, 0, 0, P]]),
    hd_floor_clock: make([[FLOOR_CLOCK, 0, 0, { ...P, l: '#b07a4c', L: '#9ec8d8', y: '#c2922a', Y: '#ffd860' }]]),
    hd_desk: make([[DESK, 0, 4, { ...P, y: '#ffd860' }], [BOOK, 3, 5, P], [INK, 13, 6, P], [QUILL, 14, 2, P], [CANDLE, 19, 0, { ...P, o: '#f08a2c' }]]),
    hd_gramophone: make([[GRAMOPHONE, 0, 0, { ...P, y: '#a87a1a', Y: '#e8b83a' }]]),
    hd_sewing_machine: make([[SEWING, 0, 0, { ...P, K: '#3a3a40', k: '#1a1a20', y: '#e8b83a' }]]),
    hd_yarn_basket: make([[YARN, 0, 0, { ...P, n: '#b08a3a', N: '#d9b45a', b: '#2a5aa8', r: '#8e2a1f' }]]),
    hd_lemon_tree: make([[LEMON, 0, 0, { ...P, g: '#559b33', L: '#9ad861', G: '#3f7d27', Y: '#ffe14a' }]]),
    hd_didukh: make([[DIDUKH, 0, 0, { ...P, n: '#c49a32', N: '#e9c56a', T: '#c8703a', t: '#8e4a24' }]]),
    hd_motanka: make([[MOTANKA, 0, 0, P]]),
    hd_runner: flat([[runnerRows(), 0, 0, P]]),
    hd_kilim: flat([[kilimRows(), 0, 0, P]]),
    hd_plates: wall([
      [PLATE, 0, 0, plate('#3a6fc0', '#c8372d', '#ffd23c')],
      [PLATE, 9, 0, plate('#c8372d', '#3a6fc0', '#ffd23c')],
      [PLATE, 18, 0, plate('#3f7d27', '#c8372d', '#ffd23c')],
    ]),
    hd_violin: wall([[VIOLIN, 0, 0, { ...P, H: '#c8783a', h: '#8e4a24', W: '#f6f0e2' }]]),
    hd_candle_shelf: wall([[CANDLE_SHELF, 0, 0, { ...P, o: '#f08a2c', y: '#c2922a', c: '#e8b83a' }]]),
    hd_embroidery: wall([[EMBROIDERY, 0, 0, P]]),
    hd_island_map: wall([[MAP, 0, 0, { P: '#e8d4a0', p: '#c8a868', S: '#9cc4d8', g: '#74bb44', G: '#3f7d27', R: '#c8372d', X: '#c8372d', k: '#5b3a22', Y: '#ffd23c' }]]),
    hd_pike_trophy: wall([[PIKE, 0, 0, P], [PIKE_FISH, 3, 2, { G: '#5a7a3a', L: '#8ab05a', g: '#3f5a2a', W: '#e0e4c0', k: '#1a1a20' }]]),
    hd_horseshoe: wall([[HORSESHOE, 0, 0, { ...P, C: '#6f675c', c: '#aaa196', k: '#2b2b30' }]]),
    hd_wall_lamp: wall([[WALL_LAMP, 0, 0, { ...P, g: '#b8d0d8', G: '#e8f4f8', y: '#c2922a', o: '#f08a2c', B: '#3a6fc0', l: '#9fc4f0' }]]),
  }
}
