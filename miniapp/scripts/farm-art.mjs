/**
 * Город: культури за стадіями росту, грядки, бур'ян, комора городника, дощувач, лежанка для псів,
 * а також іконки врожаю й пакетики насіння для рюкзака.
 *
 * Класичний піксель-арт тим самим пікселем, що й увесь острів (1 px арту = 1 px світу):
 * кожен спрайт — намальована вручну сітка символів, 3–5 тонів на матеріал, без дизеру,
 * світло зверху зліва, контур — темний (як у мандрівника, кущів і рюкзачних іконок).
 *
 * Модуль не має власного полотна — генератор (gen-island-art.mjs) передає свій клас Img.
 */

import { CROPS } from '../../telegram-bot/src/data/crops.js'

const K = '#2b1d16' // контур — той самий, що в усього світу

/* ───────── Палітри (символ → колір) ───────── */

/** Листя: від світлого до тіні, як LEAF у генераторі. */
const LEAF = { L: '#9ad861', l: '#74bb44', g: '#559b33', G: '#3f7d27', k: '#2c5c1c' }
/** Земля на горбику й біля коренеплодів. */
const DIRT = { z: '#9c6c44', s: '#7a5232', S: '#5a3a22' }

const PAL = {
  radish: { ...LEAF, ...DIRT, y: '#c8846a', R: '#e2485a', r: '#b52e40', q: '#7c1c2c', p: '#ff9aa4', e: '#c8405a', W: '#f3eee2' },
  carrot: { ...LEAF, ...DIRT, y: '#d8c48a', O: '#f08a2c', o: '#d0621a', n: '#a2420f', h: '#ffb25a' },
  beet: { ...LEAF, ...DIRT, y: '#a8705a', B: '#b03a74', b: '#802252', v: '#4e1232', m: '#d868a2', e: '#c8304a' },
  tomato: { ...LEAF, ...DIRT, y: '#e8d8a0', X: '#b07a4c', x: '#7a5232', c: '#efe2b8', T: '#e44a2e', t: '#b42a1a', u: '#7a1a10', w: '#ff9a7a', Y: '#ffd23c', o: '#e0a018' },
  cabbage: { ...DIRT, y: '#8a6a50', V: '#a8d8a0', v: '#72b080', w: '#4f8e64', W: '#336a4a', A: '#eaf4bc', a: '#c4e290', c: '#98c86a', C: '#6ea24c' },
  strawberry: { ...LEAF, ...DIRT, y: '#e8b090', R: '#e8384a', r: '#b01e30', p: '#ff8a96', d: '#ffe680', F: '#fbfaf4', f: '#f2c12e' },
  sunflower: { ...LEAF, ...DIRT, y: '#3a3430', Y: '#ffd23c', i: '#ffe98a', a: '#f0a818', o: '#c87810', D: '#6e4418', d: '#4a2a10', e: '#2e1808', h: '#a07030' },
  pumpkin: { ...LEAF, ...DIRT, y: '#efe2b0', P: '#f08a2c', p: '#d06818', q: '#a04a10', Q: '#ffb060', Y: '#ffd23c', o: '#e09a18', n: '#6a7a2a' },
}

/* ───────── Спільні частини ───────── */

/** Насінинки в землі (стадія 0). y — колір насіння культури. */
const MOUND = ['...zzzz...', '.zzsyszzs.', 'zsysssysss', '.SSSSSSSS.']
/** Паросток із двома сім'ядолями (стадія 1). */
const SPROUT = ['lL...Ll', 'gll.llg', '.ggGgg.', '...G...', '..sGs..']

/** Листок праворуч від стебла — для соняшника (ліворуч — дзеркально). */
const LEAF_R = ['..lL.', 'GglLl', '..gg.']
const BIGLEAF_R = ['..lLl.', 'GglLLl', '.ggllg', '...gg.']
const mirror = (rows) => rows.map((r) => [...r].reverse().join(''))

/* ───────── Культури: кадри [w, h, шари [рядки, x, y]] і який кадр на якій стадії ───────── */

const CROP_ART = {
  radish: {
    frames: [
      [10, 4, [[MOUND, 0, 0]]],
      [7, 5, [[SPROUT, 0, 0]]],
      [11, 7, [[['..L.....L..', '.lLl...lLl.', '.glLl.lLlg.', '..ggleGlg..', '...GeeeG...', '...rRRRr...', '..srRpRrs..'], 0, 0]]],
      [
        13,
        11,
        [[[
          '.L.........L.',
          'lLl..L.L..lLl',
          'glLl.lLl.lLlg',
          '.gglLgLglLgg.',
          '..GgegGgegG..',
          '....eeGee....',
          '....rRRRr....',
          '...rRpRRRr...',
          '...rRppRRr...',
          '...qrRRRrq...',
          '..sSqrrrqSs..',
        ], 0, 0]],
      ],
    ],
    stage: [0, 1, 2, 3],
  },
  carrot: {
    frames: [
      [10, 4, [[MOUND, 0, 0]]],
      [7, 5, [[SPROUT, 0, 0]]],
      [9, 7, [[['.L..L..L.', 'lLl.L.lLl', '.lgLlLgl.', '..lgLgl..', '...gGg...', '....G....', '...sGs...'], 0, 0]]],
      [11, 9, [[['.L...L...L.', 'lLl.lLl.lLl', '.lLl.L.lLl.', 'lgLlLlLlLgl', '.lglgLglgl.', '..lgGlGgl..', '...gGGGg...', '....GGG....', '...shOhs...'], 0, 0]]],
      [
        13,
        11,
        [[[
          'L....L....L..',
          'lL..lLl..lL.L',
          '.lL.lLl.lLlLl',
          'LlLl.L.lLl.l.',
          'lglLlLlLlgLl.',
          '.lglgLlLglgl.',
          '..lgGlGlGgl..',
          '...gGGGGGg...',
          '....GGGGG....',
          '...ohOOOho...',
          '..soOOOOOos..',
        ], 0, 0]],
      ],
    ],
    stage: [0, 1, 2, 3, 4],
  },
  beet: {
    frames: [
      [10, 4, [[MOUND, 0, 0]]],
      [7, 5, [[['lL...Ll', 'gll.llg', '.ggegg.', '...e...', '..ses..'], 0, 0]]],
      [11, 7, [[['...gl.lg...', '..glLeLlg..', '.glLlelLlg.', '..ggGeGgg..', '....eee....', '....bBb....', '...sbBbs...'], 0, 0]]],
      [13, 9, [[['..lL.....Ll..', '.glLl...lLlg.', '.gleLl.lLelg.', '..gGelLleGg..', '...gGeLeGg...', '....GeeeG....', '.....eee.....', '....bBBBb....', '...sbBmBbs...'], 0, 0]]],
      [
        13,
        12,
        [[[
          '.lL.......Ll.',
          'glLl..L..lLlg',
          'gleLl.lL.lLeg',
          '.glLel.lLelg.',
          '..gGeLlLeGg..',
          '...gGeeeGg...',
          '....GeeeG....',
          '....bBBBb....',
          '...bBmmBBb...',
          '...bBmBBBb...',
          '...vbBBBbv...',
          '..svvbbbvvs..',
        ], 0, 0]],
      ],
    ],
    stage: [0, 1, 2, 3, 4],
  },
  tomato: (() => {
    // Кущ в'ється довкола кілочка (стовпці 7–8), «ccc» — шпагат.
    const young = [
      '.......Xx...',
      '.......Xx...',
      '.......Xx...',
      '.......Xx...',
      '.......Xx...',
      '....L..Xx...',
      '...lLl.Xx...',
      '..lLglGXxL..',
      '...lgGccclL.',
      '....GGlXxg..',
      '..lLlGgXx...',
      '...lgGGXx...',
      '.....G.Xx...',
      '.....G.Xx...',
    ]
    const tall = [
      '.......Xx....',
      '.......Xx....',
      '.....L.Xx....',
      '....lLlXxL...',
      '...lLgGXxLl..',
      '....gGcccgl..',
      '..L..GlXx....',
      '.lLl.GGXxlL..',
      '.lgLlGgXxLgl.',
      '..lgGgcccgl..',
      '....GG.XxGl..',
      '..lLlGGXx....',
      '.lLglGgXxL...',
      '..lgGGcccLl..',
      '....GG.Xxgl..',
      '.....G.Xx....',
      '..lL.G.Xx....',
      '..lgGG.Xx....',
      '.....G.Xx....',
      '.....G.Xx....',
    ]
    const FLOWER = ['.Y.', 'YoY', '.Y.']
    const FRUIT = ['.GG.', 'wTTT', 'TTTt', '.tu.']
    const GREEN = ['.GG.', 'Llll', 'lllg', '.gg.']
    return {
      frames: [
        [10, 4, [[MOUND, 0, 0]]],
        [7, 5, [[SPROUT, 0, 0]]],
        [12, 14, [[young, 0, 0]]],
        [13, 20, [[tall, 0, 0]]],
        [13, 20, [[tall, 0, 0], [FLOWER, 1, 5], [FLOWER, 9, 8], [FLOWER, 1, 12]]],
        [14, 20, [[tall, 0, 0], [FRUIT, 0, 6], [FRUIT, 9, 9], [FRUIT, 1, 13], [GREEN, 9, 3]]],
      ],
      stage: [0, 1, 2, 3, 4, 5],
    }
  })(),
  cabbage: {
    frames: [
      [10, 4, [[MOUND, 0, 0]]],
      [7, 5, [[['vV...Vv', 'wvv.vvw', '.wwWww.', '...W...', '..sWs..'], 0, 0]]],
      [9, 6, [[['..vV.Vv..', '.vVvwvVv.', 'vVwvvvwVv', '.wvvwvvw.', '..wWWWw..', '...WWW...'], 0, 0]]],
      [13, 9, [[['...vVV.VVv...', '..vVvvwvvVv..', '.vVwvaAavwVv.', 'vVvwaAaacwvVv', 'vwvwacaaCwvwv', '.wvwCaccCwvw.', '..wwwCCCwww..', '...WWwwwWW...', '.....WWW.....'], 0, 0]]],
      [
        15,
        12,
        [[[
          '...vVV...VVv...',
          '..vVvvV.VvvVv..',
          '.vVvwaAAAawvVv.',
          'vVvwaAAAaaawvVv',
          'vvwaAAaAaacawvv',
          'Vvwaaaaacaccwvv',
          'vwwcaacacaCCwwv',
          '.wwcCacaccCCww.',
          '.vwwCCcccCCwwv.',
          '..vwwCCCCCwwv..',
          '...WWwwwwwWW...',
          '.....WWWWW.....',
        ], 0, 0]],
      ],
    ],
    stage: [0, 1, 2, 3, 3, 4],
  },
  strawberry: (() => {
    const leaves = [
      '...lLl.lLl...',
      '..lLglLlgLl..',
      '.lLgGlGlGgLl.',
      'lLlgGGlGGglLl',
      '.lggGGGGGggl.',
      '..gGG.G.GGg..',
      '...G..G..G...',
    ]
    const FLOWER = ['.F.', 'FfF', '.F.']
    const BERRY = ['.G.', 'pRR', 'RdR', '.r.']
    const UNRIPE = ['.G.', 'LlL', 'lll', '.g.']
    return {
      frames: [
        [10, 4, [[MOUND, 0, 0]]],
        [7, 5, [[SPROUT, 0, 0]]],
        [9, 6, [[['..lLl.lL.', '.lLglLlgl', 'lLgGlGGgl', '.lgGGGgl.', '..G.G.G..', '....G....'], 0, 0]]],
        [13, 8, [[leaves, 0, 1], [FLOWER, 0, 0], [FLOWER, 9, 1], [FLOWER, 5, 4]]],
        [13, 10, [[leaves, 0, 0], [BERRY, 0, 4], [BERRY, 4, 6], [BERRY, 9, 5], [UNRIPE, 7, 2]]],
      ],
      stage: [0, 1, 2, 3, 4],
    }
  })(),
  sunflower: (() => {
    /** Стебло (2 px) висотою h із листками на заданих висотах — по черзі ліворуч і праворуч. */
    const plant = (w, h, leaves, big = false) => {
      const cx = Math.floor(w / 2) - 1
      const layers = [[Array.from({ length: h }, () => '.'.repeat(cx) + 'gG'), 0, 0]]
      const R = big ? BIGLEAF_R : LEAF_R
      leaves.forEach((y, i) => {
        if (i % 2) layers.push([R, cx + 1, y])
        else layers.push([mirror(R), cx + 1 - R[0].length, y])
      })
      return layers
    }
    const TOP = ['.lL.Ll.', 'lLgGgLl', '..gGg..']
    const BUD = ['.GgG.', 'GlLlG', 'GLllg', '.GgG.']
    const HEAD = [
      '....i.Y.i....',
      '..iYY.YiYY...',
      '.YYaYYYYaYYi.',
      '.YYdDDDDdYYa.',
      'iYdDhDhDDdYY.',
      'YYDhDDDhDDYYi',
      'aYdDDhDDhdYYa',
      '.YYdDDhDdYYo.',
      '.aYYddddYYao.',
      '..oaYYYYYao..',
      '...o.aYa.o...',
    ]
    const W = 15
    return {
      frames: [
        [10, 4, [[MOUND, 0, 0]]],
        [7, 5, [[SPROUT, 0, 0]]],
        [W, 12, [[TOP, 4, 0], ...plant(W, 12, [5, 8])]],
        [W, 22, [[TOP, 4, 0], ...plant(W, 22, [5, 9, 13, 17], true)]],
        [W, 28, [[BUD, 5, 0], ...plant(W, 28, [8, 12, 16, 20, 23], true)]],
        [W, 32, [...plant(W, 32, [11, 15, 19, 23, 27], true), [HEAD, 1, 0]]],
      ],
      stage: [0, 1, 2, 3, 4, 5],
    }
  })(),
  pumpkin: (() => {
    const vine = [
      '...lLl.....lLl...',
      '..lLglL...lLglL..',
      '.lLgGgLl.lLgGgLl.',
      '..lgGGgl.lgGGgl..',
      '.GG.gGGlLlGGg.GG.',
      'G..GGGGgLgGGGG..G',
      'GG....GGGGG....GG',
    ]
    const FLOWER = ['.Y.', 'YoY', 'oYo']
    const GREEN = ['...n..', '.lLll.', 'lLlllg', '.gggg.']
    const RIPE = [
      '.....nn.....',
      '..QPPpnPPp..',
      '.QPPpPPpPPq.',
      'QPPpPPPpPPpq',
      'PPPpPPPpPPpq',
      'pPPpPPPpPpqq',
      '.ppqppPqpqq.',
      '..qqqqqqqq..',
    ]
    return {
      frames: [
        [10, 4, [[MOUND, 0, 0]]],
        [7, 5, [[SPROUT, 0, 0]]],
        [13, 7, [[['..lLl...lLl..', '.lLglL.lLglL.', 'lLgGgl.lgGgLl', '.lgGGl.lGGgl.', '..gGGGGGGGg..', '.....GGG.....', '......G......'], 0, 0]]],
        [17, 7, [[vine, 0, 0]]],
        [17, 8, [[vine, 0, 1], [FLOWER, 7, 0]]],
        [17, 9, [[vine, 0, 0], [GREEN, 6, 5]]],
        [17, 11, [[vine, 0, 0], [RIPE, 3, 3]]],
      ],
      stage: [0, 1, 2, 3, 4, 5, 6],
    }
  })(),
}

/* ───────── Грядки, бур'ян, ятка, дощувач, лежанка ───────── */

/** Скопана грядка 16×16: три борозни (гребінь, схил, западина) і кілька грудочок. */
const SOIL = [
  '.zzzzzzzzzzzzzz.',
  'zhzzzhzzzzzhzzzs',
  'zssssssssssssssS',
  'sSSsSSSSsSSSSsSS',
  'SddSdddSSddddSdS',
  'zzzhzzzzzzhzzzzs',
  'zssssssssssssssS',
  'sSSSsSSSSSsSSSSS',
  'SdddSddddSdddSdS',
  'zzzzzzhzzzzzzhzs',
  'zssssssssssssssS',
  'sSSsSSSSSsSSSsSS',
  'SddSdddSSdddSddS',
  'zzzzhzzzzzzzzzzs',
  'sssssssssssssssS',
  '.SSSSSSSSSSSSSS.',
]
const SOIL_DRY = { h: '#b08052', z: '#9c6c44', s: '#7a5232', S: '#5a3a22', d: '#4a2e1a' }
const SOIL_WET = { h: '#6e4c30', z: '#5e4028', s: '#4a3020', S: '#3a2416', d: '#2a1a10' }
/** Відблиски води на вологій землі. */
const GLINTS = [[3, 1], [11, 5], [6, 9], [13, 13]]

const WEEDS = [
  '..l......L....',
  '.lL..l..lLl...',
  '.lg.lL...lg.L.',
  '..gGlg.l.gG.l.',
  '.L.Gg.lLlGg.g.',
  'lLlGG.lgGG.lL.',
  '.gGGGlgGGGggl.',
  '..oGGGGoGGGG..',
  '.oOo.GG.oOo...',
]
const WEED_PAL = { ...LEAF, o: '#6a6660', O: '#aaa69e', Y: '#ffd83a', F: '#fbfaf4' }

const STAND = [
  '..RRWWRRWWRRWWRRWWRRWW..',
  '.RRWWRRWWRRWWRRWWRRWWRR.',
  'RRWWRRWWRRWWRRWWRRWWRRWW',
  'rrwwrrwwrrwwrrwwrrwwrrww',
  '.r.w.r.w.r.w.r.w.r.w.r..',
  '.X....................X.',
  '.X....................X.',
  '.X..PP.PP.PP.PP.PP.PP.X.',
  '.X..11.22.33.44.55.66.X.',
  '.X..11.22.33.44.55.66.X.',
  '.XhhhhhhhhhhhhhhhhhhhhX.',
  'xHHHHHHHHHHHHHHHHHHHHHHx',
  '.xxxxxxxxxxxxxxxxxxxxxx.',
  '.X.nNNn..........nNNn.X.',
  '.XnNNNNn..cccc..nNNNNnX.',
  '.XnNNNNn..cLlc..nNNNNnX.',
  '.XnNNNNn..cccc..nNNNNnX.',
  '.X.nnnn....xx....nnnn.X.',
]
const STAND_PAL = {
  R: '#d9493a', r: '#a8281f', W: '#f6f0e2', w: '#d8cdb4',
  X: '#8b5d3b', x: '#5b3a22', H: '#b07a4c', h: '#c79a62',
  P: '#f0deb0',
  1: '#c22a42', 2: '#d0621a', 3: '#4f9056', 4: '#e8a91a', 5: '#b01e30', 6: '#76204c',
  N: '#b8985e', n: '#8a6c3c', c: '#b07a4c', L: '#74bb44', l: '#3f7d27',
}

const SPRINKLER = ['.b.b.b.', '..YYY..', '.YyYYy.', '..yyy..', '...Y...', '...y...', '...Y...', '...y...', '..sss..', '.sssss.']
const SPRINKLER_PAL = { b: '#9ad0f0', Y: '#ffd860', y: '#c2922a', s: '#7a5232' }

const DOG_BED = [
  '....wWwWwWwWwWwWwW....',
  '..wWwWwWwWwWwWwWwWwW..',
  '.wWwPPPPRRRRRRRRRRwWw.',
  'wWwPPPPPPRRxRRRxRRRwWw',
  'wWPPPPPPpRxRxRxRxRRRWw',
  'wWwPPPPppRRxRRRxRRRRWw',
  'wWwRPpppRRRRRRRRRRRRWw',
  'wWwRRRRRRxRRRxRRRxRRWw',
  'wWwRRRRRxRxRxRxRxRxRWw',
  'wWwRRRRRRxRRRxRRRxRRWw',
  '.wWwrrrrrrrrrrrrrrrwW.',
  '..wWwWwWwWwWwWwWwWwW..',
  '....wWwWwWwWwWwWwW....',
]
const DOG_BED_PAL = { w: '#8b5d3b', W: '#b07a4c', P: '#f3eee2', p: '#cbc2b0', R: '#c8372d', r: '#8e2a1f', x: '#f3eee2' }

/* ───────── Іконки для рюкзака (≈16–20 px, як решта предметів) ───────── */

const ICONS = {
  radish: [
    '....L......L....',
    '...lLl..L.lLl...',
    '...glLl.lLlLg...',
    '....gglLlLgg....',
    '.....GeGeGG.....',
    '......eee.......',
    '.....rRRRRr.....',
    '....rRpRRRRr....',
    '...rRppRRRRRr...',
    '...rRpRRRRRRr...',
    '...rRRRRRRRrq...',
    '...qrRRRRRrrq...',
    '....qrrRrrrq....',
    '.....qqrrqq.....',
    '.......WW.......',
    '........W.......',
    '........W.......',
  ],
  carrot: [
    '...........L..L.',
    '..........lL.lL.',
    '..........lgLlg.',
    '.........L.gGg.L',
    '........lLlGGlLl',
    '.........gGGGgl.',
    '........hOOGg...',
    '.......hOOOoG...',
    '......hOOOoo....',
    '......OOnOo.....',
    '.....hOOOon.....',
    '....hOOOoo......',
    '....OOnOo.......',
    '...hOOOon.......',
    '...OOOoo........',
    '..hOOon.........',
    '..OOon..........',
    '.hOon...........',
    '.On.............',
  ],
  beet: [
    '...lL.....Ll....',
    '..glLl...lLlg...',
    '..gleLl.lLelg...',
    '...gGeLlLeGg....',
    '....gGeeeGg.....',
    '......eee.......',
    '.....bBBBb......',
    '....bBmmBBb.....',
    '...bBmmBBBBb....',
    '...bBmBBBBBb....',
    '...bBBBBBBBv....',
    '...vbBBBBBbv....',
    '....vbBBBbv.....',
    '.....vvbvv......',
    '.......v........',
    '.......v........',
  ],
  tomato: [
    '......n.........',
    '.....GnG........',
    '...GGgnGGG......',
    '..wTTGGGTTTT....',
    '.wTTTTTTTTTTt...',
    '.wTTTTTTTTTTt...',
    'wTTTTTTTTTTTtt..',
    'TTTTTTTTTTTTtt..',
    'TTTTTTTTTTTttt..',
    'tTTTTTTTTTTttu..',
    '.tTTTTTTTTttu...',
    '.ttTTTTTTttuu...',
    '..uttttttuuu....',
    '....uuuuuu......',
  ],
  cabbage: [
    '...vVV....VVv...',
    '..vVvvVvvVvvVv..',
    '.vVvwaAAAAawvVv.',
    'vVvwaAAAAAaawvVv',
    'vvwaAAaAAaacawvv',
    'Vvwaaaaaacaccwvv',
    'vwwcaacaacaCCwwv',
    'vwwcCacaacCCCwwv',
    '.wwcCacccCCCww..',
    '.vwwCCcccCCwwv..',
    '..vwwCCCCCwwv...',
    '...WWwwwwwWW....',
    '.....WWWWW......',
  ],
  strawberry: [
    '......n.....',
    '...GG.n.GG..',
    '..GlGGGGGlG.',
    '..pRRGlGRRR.',
    '.pRRdRRRdRRr',
    '.pRRRRRRRRRr',
    '.RRdRRdRRdRr',
    '.RRRRRRRRRrr',
    '..RRdRRdRRr.',
    '..RRRRRRRrr.',
    '...rRdRRrr..',
    '...rRRRrr...',
    '....rrrr....',
    '.....rr.....',
  ],
  sunflower: [
    '.....i..Y..i.....',
    '...iYY.YiY.YYi...',
    '..YYaYYYYYYYaYY..',
    '.iYYYdDDDDDdYYYi.',
    '.YYYdDhDDhDDdYYY.',
    'iYYdDhDDDDhDDdYYi',
    'YYYDDDhDhDDDhDYYY',
    'aYYdDhDDDDhDDdYYa',
    '.YYdDDDhDDDhDdYY.',
    '.aYYdDDDDhDDdYYa.',
    '.oaYYddddddYYao..',
    '..oaYYYaYYYYao...',
    '...oo.aYa.aoo....',
    '.....o..o..o.....',
  ],
  pumpkin: [
    '.......nn.........',
    '......nn..lL......',
    '..QQPpnPPpgLl.....',
    '.QPPPpPPPpPPq.....',
    'QPPPpPPPPpPPPq....',
    'QPPPpPPPPpPPPpq...',
    'PPPPpPPPPpPPPpq...',
    'PPPPpPPPPpPPPpqq..',
    'pPPPpPPPPpPPPpqq..',
    'pPPPpPPPPpPPpqqq..',
    '.pPPqpPPPqpPpqq...',
    '..pqqppPpqqpqq....',
    '...qqqqqqqqqq.....',
  ],
}
const STEM = { n: '#5a7a2a' }
const ICON_PAL = {
  radish: PAL.radish,
  carrot: PAL.carrot,
  beet: PAL.beet,
  tomato: { ...PAL.tomato, ...STEM },
  cabbage: PAL.cabbage,
  strawberry: { ...PAL.strawberry, ...STEM },
  sunflower: PAL.sunflower,
  pumpkin: PAL.pumpkin,
}

/** Пакетик насіння: паперовий конверт із загнутим краєм, кольорова смуга й маленький урожай. */
const PACKET = [
  '.1212121212121.',
  '111111111111112',
  '233333333333332',
  '111111111111112',
  '111111111111112',
  '111111111111112',
  '111111111111112',
  '111111111111112',
  '111111111111112',
  '111111111111112',
  '111111111111112',
  '111111111111112',
  '444444444444445',
  '464464464464465',
  '444444444444445',
  '22222222222222.',
]
/** Мініатюра врожаю на пакетику. */
const MINI = {
  radish: ['..L.L..', '.lLlLl.', '..eGe..', '.rRRRr.', 'rRpRRRr', 'rRRRRRq', '.qrrrq.', '...W...'],
  carrot: ['.....lL.', '....lLg.', '...hOG..', '..hOo...', '.hOo....', '.On.....', 'O.......'],
  beet: ['.lL.Ll.', '.gleLg.', '..eee..', '.bBBBb.', 'bBmBBBb', 'bBBBBBv', '.vbbbv.', '...v...'],
  tomato: ['...n...', '.GGnGG.', 'wTTTTTt', 'TTTTTTt', 'TTTTTtu', '.tTTtu.', '..uuu..'],
  cabbage: ['.vV.Vv.', 'vVaAawV', 'vaAaacv', 'wcacCCw', '.wCCCw.', '..WWW..'],
  strawberry: ['..GnG..', '.pRRRr.', '.RdRdR.', '.RRRRr.', '..RdR..', '...r...'],
  sunflower: ['.iY.Yi.', 'YYdDdYY', 'YdDhDdY', 'YdhDDdY', 'aYdddYa', '.oaYao.'],
  pumpkin: ['....n....', '.QPpnPp..', 'QPPpPPpq.', 'PPPpPPpq.', 'pPPpPPpq.', '.pqqqqq..'],
}
const BAND = {
  radish: ['#c22a42', '#8e1c2e'],
  carrot: ['#d0621a', '#a2420f'],
  beet: ['#802252', '#4e1232'],
  tomato: ['#c6301f', '#8a1c10'],
  cabbage: ['#4f9056', '#336a4a'],
  strawberry: ['#b01e30', '#7a1220'],
  sunflower: ['#e8a91a', '#b87810'],
  pumpkin: ['#d86818', '#a04a10'],
}

/**
 * @param {{ Img: any }} h — клас полотна генератора
 */
export function farmArt({ Img }) {
  /** Зібрати спрайт із шарів-сіток; contour — темний контур довкола силуету. */
  const draw = (w, h, pal, layers, contour = 0.9) => {
    const img = new Img(w, h)
    for (const [rows, x, y] of layers) img.rows(rows, x, y, pal)
    return contour ? img.outline(K, contour) : img
  }
  /** Те саме, але з полем 1 px під контур. */
  const framed = (w, h, pal, layers) => draw(w + 2, h + 2, pal, layers.map(([r, x, y]) => [r, x + 1, y + 1]))

  const sprites = {}
  const meta = {}
  for (const c of CROPS) {
    const art = CROP_ART[c.id]
    const drawn = art.frames.map(([w, h, layers]) => framed(w, h, PAL[c.id], layers))
    for (let s = 0; s <= c.stages; s++) sprites[`crop_${c.id}_${s}`] = drawn[art.stage[s] ?? art.stage.at(-1)]
    meta[c.id] = c.stages + 1
  }

  sprites.soil_dry = draw(16, 16, SOIL_DRY, [[SOIL, 0, 0]], 0)
  const wet = draw(16, 16, SOIL_WET, [[SOIL, 0, 0]], 0)
  for (const [x, y] of GLINTS) wet.set(x, y, '#8aa4b8')
  sprites.soil_wet = wet

  // Ще не скопана ділянка: ледь помітні кутики.
  const mark = new Img(16, 16)
  for (const [x, y, dx, dy] of [[0, 0, 1, 1], [15, 0, -1, 1], [0, 15, 1, -1], [15, 15, -1, -1]])
    for (let k = 0; k < 3; k++) {
      mark.set(x + dx * k, y, '#f6f0d8', 0.5)
      if (k) mark.set(x, y + dy * k, '#f6f0d8', 0.5)
    }
  sprites.plot_mark = mark

  sprites.weeds_0 = framed(14, 9, WEED_PAL, [[WEEDS, 0, 0]])
  sprites.weeds_1 = framed(14, 9, WEED_PAL, [[mirror(WEEDS), 0, 0], [['.F.', 'FYF', '.F.'], 3, 0]])
  sprites.weeds_2 = framed(14, 11, WEED_PAL, [[WEEDS, 0, 2], [['.Y.', 'YYY', '.Y.'], 9, 0]])
  sprites.seed_stand = framed(24, 18, STAND_PAL, [[STAND, 0, 0]])
  sprites.sprinkler = framed(7, 10, SPRINKLER_PAL, [[SPRINKLER, 0, 0]])
  sprites.home_dog_bed = draw(22, 13, DOG_BED_PAL, [[DOG_BED, 0, 0]], 0.6)

  /** Окремі PNG для рюкзака: crop_<id>.png і seed_<id>.png. */
  const items = {}
  for (const c of CROPS) {
    const rows = ICONS[c.id]
    const w = Math.max(...rows.map((r) => r.length))
    items[`crop_${c.id}`] = framed(w, rows.length, ICON_PAL[c.id], [[rows, 0, 0]])
    const mini = MINI[c.id]
    const mw = Math.max(...mini.map((r) => r.length))
    const [band, bandLo] = BAND[c.id]
    const packetPal = { ...ICON_PAL[c.id], 1: '#e8cf9c', 2: '#b8945a', 3: '#cca872', 4: band, 5: bandLo, 6: '#f8ebc8' }
    items[`seed_${c.id}`] = framed(15, 16, packetPal, [[PACKET, 0, 0], [mini, Math.floor((15 - mw) / 2), 4]])
  }
  return { sprites, items, meta }
}
