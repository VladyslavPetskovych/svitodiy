/**
 * Електрика й лісосмуга на рідному острові (викликає scripts/gen-island-art.mjs):
 *  - вітряк windmill_0…5 — кадри обертання крил (4 крила, 15° на кадр: шість кадрів — чверть оберту,
 *    далі цикл повторюється без шва). Рушій гортає їх за DECO_GEOM.windmill.anim.
 *  - посаджене дерево: tree_plant_0 (горбик з насіниною), tree_plant_1 (паросток),
 *    tree_young_<порода> (деревце) — далі сервер перетворює його на справжнє дерево (nodes.js).
 *  - акумулятор battery_0…3 (скільки банок світиться — стільки заряду) і електропіч furnace_off / furnace_on.
 *  - електроверстат e_bench_off / e_bench_on і сонячна панель solar_panel_deco.
 *  - іконки для рюкзака: copper_ingot, bare_wire, tree_seed, battery, glass, iron_ingot,
 *    quartz, obsidian, silicon_wafer, insulated_wire, solar_panel (public/game/items/<id>.png).
 */

const K = '#2b1d16'
const WOOD = { dark: '#3f2816', lo: '#5b3a22', mid: '#8b5d3b', hi: '#b07a4c', pale: '#c79a62', light: '#e2bb84' }
const STONE = { grout: '#5e574f', lo: '#6f675c', a: '#9c9488', b: '#aaa196', c: '#b8b0a3', hi: '#cfc8bb' }
const ROOF = { dark: '#5e2216', lo: '#7a2e1f', mid: '#a8432b', hi: '#cf6a43', light: '#e88f5c' }
const CLOTH = { hi: '#fbf4e2', mid: '#ece0c0', lo: '#cdbb92' }
const COPPER = { glint: '#ffe6c8', hi: '#f6b277', mid: '#dc8445', lo: '#ad5f2b', dark: '#70391b' }
const IRON = { hi: '#a9b2b7', mid: '#717a80', lo: '#474e54' }
const LAMP = { hi: '#fff6c4', mid: '#ffd35a' }
const SOIL = { dark: '#4a2f1b', lo: '#5a3a22', mid: '#7a5232', hi: '#94683f' }

/** Кадрів обертання крил вітряка. */
export const WINDMILL_FRAMES = 6

/**
 * @param {{ Img: any, hash: (x: number, y: number, s: number) => number, canopy: Function, shadow: Function, LEAF: string[] }} h
 */
export function powerArt({ Img, hash, canopy, shadow, LEAF }) {
  /* ───────── Вітряк ───────── */

  const W = 58
  const H = 86
  const CX = 29 // вісь башти
  const HUB = { x: 29, y: 28 } // маточина крил
  const BASE_Y = 80 // низ кам'яного цоколя

  /** Башта-«смок»: восьмигранна, звужується догори; обшита горизонтальними дошками. */
  function tower(img) {
    const top = 30
    const bot = 66
    for (let y = top; y <= bot; y++) {
      const k = (y - top) / (bot - top)
      const half = Math.round(9 + k * 6) // 9 угорі → 15 унизу
      const x0 = CX - half
      const x1 = CX + half
      const board = (y - top) % 3 === 2 // нижній край дошки — тінь
      for (let x = x0; x <= x1; x++) {
        const u = (x - x0) / (x1 - x0) // 0 — лівий край, 1 — правий
        // Грані восьмикутника: ліва освітлена, середні — рівні, права — в тіні.
        let c = u < 0.18 ? WOOD.light : u < 0.5 ? WOOD.pale : u < 0.82 ? WOOD.hi : WOOD.mid
        if (board) c = u < 0.18 ? WOOD.pale : u < 0.5 ? WOOD.hi : u < 0.82 ? WOOD.mid : WOOD.lo
        // Сучки й нерівності на дошках.
        if (!board && hash(x, y, 91) < 0.05) c = u < 0.5 ? WOOD.hi : WOOD.mid
        img.set(x, y, c)
      }
      // Ребра граней — темніші стовпи.
      for (const u of [0.18, 0.5, 0.82]) img.set(Math.round(x0 + u * (x1 - x0)), y, WOOD.lo)
      img.set(x0, y, WOOD.mid)
      img.set(x1, y, WOOD.dark)
    }
    // Маленьке віконце з теплим світлом і хрестовиною.
    img.rect(CX - 2, 38, 5, 5, WOOD.dark)
    img.rect(CX - 1, 39, 3, 3, LAMP.mid)
    img.set(CX - 1, 39, LAMP.hi)
    img.vline(CX, 39, 41, WOOD.lo)
    img.hline(CX - 1, CX + 1, 40, WOOD.lo)
    img.hline(CX - 2, CX + 2, 43, WOOD.light) // підвіконня
  }

  /** Галерея довкола башти: настил на кронштейнах і поручні. */
  function gallery(img) {
    const y = 52
    // Кронштейни під настилом.
    for (const x of [CX - 16, CX - 8, CX + 8, CX + 16]) {
      img.set(x, y + 2, WOOD.lo)
      img.set(x + (x < CX ? 1 : -1), y + 3, WOOD.lo)
    }
    img.rect(CX - 19, y, 39, 2, WOOD.mid)
    img.hline(CX - 19, CX + 19, y, WOOD.hi)
    img.hline(CX - 19, CX + 19, y + 1, WOOD.lo)
    // Поручні: стовпчики й перила.
    for (let x = CX - 19; x <= CX + 19; x += 4) img.vline(x, y - 5, y - 1, WOOD.lo)
    img.vline(CX + 19, y - 5, y - 1, WOOD.lo)
    img.hline(CX - 19, CX + 19, y - 5, WOOD.pale)
    img.hline(CX - 19, CX + 19, y - 3, WOOD.mid, 0.8)
  }

  /** Кам'яний цоколь: тесані камені з розшивкою, згори — дерев'яний брус. */
  function plinth(img) {
    const y0 = 66
    for (let y = y0; y <= BASE_Y; y++) {
      const half = 17 + Math.floor((y - y0) / 7)
      for (let x = CX - half; x <= CX + half; x++) {
        const row = Math.floor((y - y0) / 4)
        const off = row % 2 ? 3 : 0
        const seamX = (x + off - CX + 40) % 7 === 0
        const seamY = (y - y0) % 4 === 3
        const u = (x - (CX - half)) / (2 * half)
        const tone = hash(Math.floor((x + off) / 7), row, 33)
        let c = tone < 0.33 ? STONE.a : tone < 0.66 ? STONE.b : STONE.c
        if (u > 0.78) c = tone < 0.5 ? STONE.lo : STONE.a
        if (u < 0.12) c = STONE.hi
        if (seamX || seamY) c = STONE.grout
        img.set(x, y, c)
      }
    }
    // Брус-поріг між каменем і деревом.
    img.rect(CX - 17, y0 - 1, 35, 2, WOOD.lo)
    img.hline(CX - 17, CX + 17, y0 - 1, WOOD.mid)
    // Мох біля землі.
    for (let x = CX - 19; x <= CX + 19; x++) if (hash(x, 3, 57) < 0.35) img.set(x, BASE_Y, '#5f9b3a')
  }

  /** Двері з аркою, лампочка над ними — вітряк сам себе й освітлює. */
  function door(img) {
    const x0 = CX - 4
    const y0 = 62
    img.rect(x0 - 1, y0 - 1, 10, BASE_Y - y0 + 1, WOOD.dark) // одвірок
    img.rect(x0, y0, 8, BASE_Y - y0, WOOD.mid)
    img.hline(x0 + 1, x0 + 6, y0 - 1, WOOD.mid) // арка
    img.hline(x0 + 2, x0 + 5, y0 - 2, WOOD.dark)
    img.vline(x0 + 4, y0, BASE_Y - 1, WOOD.lo) // дві стулки
    img.vline(x0, y0, BASE_Y - 1, WOOD.hi)
    for (const y of [y0 + 3, y0 + 12]) img.hline(x0 + 1, x0 + 6, y, IRON.lo) // завіси
    img.set(x0 + 5, y0 + 8, '#ffd35a') // клямка
    // Лампочка на кронштейні.
    img.hline(CX - 1, CX + 1, y0 - 5, IRON.lo)
    img.set(CX, y0 - 4, IRON.mid)
    img.rect(CX - 1, y0 - 3, 3, 2, LAMP.mid)
    img.set(CX, y0 - 3, LAMP.hi)
    // Сходинка.
    img.rect(x0 - 2, BASE_Y, 12, 2, STONE.c)
    img.hline(x0 - 2, x0 + 9, BASE_Y + 1, STONE.lo)
  }

  /** Генератор біля цоколя: залізна скринька з мідною обмоткою, кабель іде в землю. */
  function dynamo(img) {
    const x0 = CX + 18
    const y0 = 70
    img.rect(x0, y0, 7, 9, IRON.mid)
    img.hline(x0, x0 + 6, y0, IRON.hi)
    img.vline(x0 + 6, y0, y0 + 8, IRON.lo)
    img.hline(x0, x0 + 6, y0 + 8, IRON.lo)
    // Обмотка — мідні смужки.
    for (const y of [y0 + 2, y0 + 4, y0 + 6]) img.hline(x0 + 1, x0 + 4, y, y === y0 + 4 ? COPPER.hi : COPPER.mid)
    // Блискавка ⚡ на кришці.
    img.set(x0 + 3, y0 - 2, '#ffd35a')
    img.set(x0 + 2, y0 - 1, '#ffd35a')
    img.set(x0 + 4, y0 - 1, '#ffd35a')
    // Вал від башти до генератора й кабель у землю.
    img.hline(CX + 15, x0 - 1, y0 + 3, IRON.lo)
    for (const [x, y] of [[x0 + 7, y0 + 6], [x0 + 8, y0 + 7], [x0 + 8, y0 + 8], [x0 + 9, y0 + 9], [x0 + 10, y0 + 9]]) img.set(x, y, COPPER.lo)
  }

  /** Ковпак: заокруглений, крит гонтом, з флюгером на шпилі; позаду — хвіст-«віялка». */
  function cap(img) {
    const top = 15
    const bot = 31
    // Хвіст (віялка позаду ковпака) визирає праворуч.
    for (let k = 0; k < 4; k++) img.vline(CX + 13 + k, 25 - k, 29 + k, k % 2 ? WOOD.mid : WOOD.pale)
    img.hline(CX + 12, CX + 17, 30, WOOD.lo)
    for (let y = top; y <= bot; y++) {
      const k = (y - top) / (bot - top)
      // Купол: ширшає донизу за колом, унизу — рівний звис.
      const half = Math.round(Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k))) * 13)
      for (let x = CX - half; x <= CX + half; x++) {
        const u = (x - (CX - half)) / Math.max(1, 2 * half)
        const shingle = (y - top) % 3 === 2 || ((x + ((Math.floor((y - top) / 3) % 2) * 2)) % 4 === 0 && (y - top) % 3 === 0)
        let c = u < 0.25 ? ROOF.light : u < 0.6 ? ROOF.hi : u < 0.85 ? ROOF.mid : ROOF.lo
        if (shingle) c = u < 0.6 ? ROOF.mid : ROOF.lo
        if (y === bot) c = ROOF.dark
        img.set(x, y, c)
      }
    }
    // Карниз ковпака.
    img.hline(CX - 14, CX + 14, bot + 1, WOOD.lo)
    // Шпиль і флюгер-півник.
    img.vline(CX, top - 6, top - 1, IRON.lo)
    img.set(CX, top - 7, '#ffd35a')
    img.rows(['.XX.', 'XXXX', '..X.'], CX - 1, top - 6, { X: IRON.mid })
  }

  /**
   * Крила: чотири махи з решіткою й полотном, повернуті на кут a.
   * Кожен піксель перевіряємо в системі координат маху (u — уздовж, v — поперек),
   * тож на будь-якому куті крило лишається чітким піксель-артом без розмиття.
   */
  function sails(img, a) {
    const R = 27 // довжина маху
    const r0 = 6 // полотно починається від маточини
    const width = 7 // ширина полотна
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < img.w; x++) {
        const dx = x + 0.5 - HUB.x
        const dy = y + 0.5 - HUB.y
        for (let k = 0; k < 4; k++) {
          const t = a + (k * Math.PI) / 2
          const cs = Math.cos(t)
          const sn = Math.sin(t)
          const u = dx * cs + dy * sn
          const v = -dx * sn + dy * cs
          if (u < 0 || u > R) continue
          // Спис (вал маху) — по центру, трохи ширший біля маточини.
          if (Math.abs(v) <= (u < 10 ? 1.1 : 0.75)) {
            img.set(x, y, u < 10 ? WOOD.lo : WOOD.mid)
            break
          }
          if (u < r0 || v <= 0 || v > width) continue
          // Рама полотна: поперечки кожні 4 px і зовнішня рейка.
          const rung = Math.abs(((u - r0) % 4) - 0) < 0.85
          const rail = v > width - 1
          const mid = Math.abs(v - width / 2) < 0.5
          if (rail || u > R - 1) img.set(x, y, WOOD.lo)
          else if (rung) img.set(x, y, WOOD.mid)
          else if (mid) img.set(x, y, CLOTH.lo)
          else {
            // Полотно надуте вітром: світліше біля списа, тінь до краю.
            img.set(x, y, v < 2.2 ? CLOTH.hi : v < width - 2 ? CLOTH.mid : CLOTH.lo)
          }
          break
        }
      }
  }

  /** Маточина: залізна шайба з болтами поверх крил. */
  function hub(img) {
    img.ellipse(HUB.x, HUB.y, 3.2, 3.2, IRON.lo)
    img.ellipse(HUB.x - 0.4, HUB.y - 0.4, 2.2, 2.2, IRON.mid)
    img.set(HUB.x - 1, HUB.y - 1, IRON.hi)
    img.set(HUB.x, HUB.y, '#2f3438')
  }

  function windmillFrame(f) {
    const img = new Img(W, H)
    shadow(img, CX + 2, BASE_Y + 1, 24, 4.5)
    tower(img)
    plinth(img)
    door(img)
    gallery(img)
    dynamo(img)
    cap(img)
    // Крила — найближче до глядача: поверх ковпака й галереї.
    sails(img, (f / WINDMILL_FRAMES) * (Math.PI / 2) + 0.35)
    hub(img)
    return img.outline(K, 0.9)
  }

  /* ───────── Посаджене дерево ───────── */

  /** Горбик свіжої землі (якір — низ по центру, 16 px завширшки). */
  function mound(img, cx, y) {
    img.ellipse(cx, y - 2, 7, 2.6, SOIL.mid)
    img.ellipse(cx - 1, y - 3, 5, 1.6, SOIL.hi)
    for (const [dx, dy] of [[-5, -1], [4, -1], [2, -3], [-3, -2]]) img.set(cx + dx, y + dy, SOIL.lo)
    img.hline(cx - 6, cx + 6, y - 1, SOIL.lo)
  }

  function plant0() {
    const img = new Img(18, 12)
    shadow(img, 9, 10, 8, 1.6, 0.18)
    mound(img, 9, 11)
    // Насінина визирає з землі й кілочок-мітка поруч.
    img.ellipse(9, 7, 1.6, 1.3, '#9a6234')
    img.set(8, 6, '#d39a5c')
    img.vline(14, 2, 9, WOOD.pale)
    img.set(14, 2, '#7fb04a')
    img.set(15, 3, '#7fb04a')
    return img.outline(K, 0.75)
  }

  function plant1() {
    const img = new Img(18, 18)
    shadow(img, 9, 16, 8, 1.6, 0.18)
    mound(img, 9, 17)
    // Паросток: стеблинка й два листочки.
    img.vline(9, 7, 14, '#5c9432')
    img.rows(['GG...GG', 'gGG.GGg', '.gG.Gg.'], 6, 5, { G: LEAF[1], g: LEAF[3] })
    img.set(7, 5, LEAF[0])
    img.set(10, 5, LEAF[0])
    img.set(9, 6, LEAF[0])
    return img.outline('#1e3a12', 0.85)
  }

  /** Молоде деревце кожної породи — щоб ще до зрілості було видно, що виросте. */
  function young(kind) {
    const img = new Img(22, 32)
    shadow(img, 11, 30, 8, 2)
    mound(img, 11, 31)
    if (kind === 'pine') {
      img.rect(10, 22, 2, 8, WOOD.mid)
      const PINE = ['#9ad861', '#5fa043', '#3f7f37', '#2d6230', '#1e4626']
      for (const [top, half, hgt] of [[3, 4, 8], [9, 6, 8], [15, 8, 9]])
        for (let y = 0; y < hgt; y++) {
          const w = Math.round(1 + (half * y) / (hgt - 1))
          for (let x = -w; x <= w; x++) {
            const u = (x + w) / (2 * w + 1)
            img.set(11 + x, top + y, PINE[y === hgt - 1 ? 4 : u < 0.25 ? 1 : u < 0.6 ? 2 : u < 0.85 ? 3 : 4])
          }
        }
      return img.outline('#16301b')
    }
    if (kind === 'birch') {
      img.rect(10, 15, 2, 15, '#efe9dc')
      img.vline(11, 15, 29, '#cfc6b3')
      for (const y of [18, 23, 27]) img.set(10, y, '#3b2a22')
      canopy(img, [[11, 10, 7], [6, 13, 4], [16, 13, 4]], ['#c8e67a', '#9fd05a', '#79b543', '#5c9432', '#43722a'], 61)
      return img.outline('#22421a')
    }
    img.rect(10, 16, 3, 14, WOOD.mid)
    img.vline(10, 16, 29, WOOD.lo)
    canopy(img, [[11, 10, 8], [5, 13, 5], [17, 13, 5]], LEAF, 63)
    return img.outline('#1e3a12')
  }

  /* ───────── Гевея (каучукове дерево) ───────── */

  const HEVEA_LEAF = ['#7cc45e', '#3f9442', '#2a7436', '#1d572b', '#12401f']
  const BARK = { hi: '#b3a690', mid: '#8d806b', lo: '#665b4b', dark: '#463e33' }

  /** Гладкий сіро-бурий стовбур гевеї з легкими поперечними кільцями. */
  function heveaTrunk(img, cx, top, bot, w) {
    for (let y = top; y <= bot; y++) {
      const flare = y > bot - 4 ? bot - 4 - y + 1 : 0 // розширення біля коріння
      const x0 = cx - Math.floor(w / 2) + Math.min(0, flare)
      const x1 = cx + Math.ceil(w / 2) - 1 - Math.min(0, flare)
      for (let x = x0; x <= x1; x++) {
        const u = (x - x0) / Math.max(1, x1 - x0)
        img.set(x, y, u < 0.25 ? BARK.hi : u < 0.7 ? BARK.mid : BARK.lo)
      }
      img.set(x1, y, BARK.dark)
      if (hash(cx, y, 77) < 0.12) img.hline(x0 + 1, x1 - 1, y, BARK.lo, 0.6)
    }
  }

  /**
   * Доросла гевея: високий стовбур із підсочкою — косим надрізом, з якого латекс стікає в чашку,
   * прив'язану до стовбура. full — у чашці біліє латекс (є що зібрати).
   */
  function rubberTree(full) {
    const img = new Img(44, 72)
    shadow(img, 22, 68, 16, 4)
    heveaTrunk(img, 22, 28, 69, 6)
    img.rect(16, 67, 3, 2, BARK.mid)
    img.rect(26, 67, 3, 2, BARK.lo)
    // Гілки: стовбур розходиться рогаткою на три — між пучками крони їх видно.
    const limb = (x0, y0, x1, y1) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
      for (let k = 0; k <= n; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / n)
        const y = Math.round(y0 + ((y1 - y0) * k) / n)
        img.set(x, y, BARK.mid)
        img.set(x + 1, y, BARK.lo)
      }
    }
    limb(21, 30, 11, 18)
    limb(23, 30, 33, 17)
    limb(22, 30, 22, 12)
    // Крона — три окремі пучки глянцевого темного листя, а не одна «куля».
    canopy(
      img,
      [
        [11, 17, 7], [6, 22, 5], [15, 22, 5],
        [33, 16, 7], [38, 21, 5], [29, 21, 5],
        [22, 9, 7], [17, 5, 5], [27, 5, 5],
      ],
      HEVEA_LEAF,
      71
    )
    // Глянець: світлі риски на верхніх листках.
    for (const [x, y] of [[8, 13], [9, 13], [30, 12], [31, 12], [19, 4], [20, 4], [24, 2], [13, 19], [35, 18]]) img.tint(x, y, '#c8f09a', 0.9)
    // Звислі довгасті листочки під пучками.
    for (const [x, y] of [[4, 27], [9, 28], [15, 27], [29, 26], [34, 27], [39, 25], [18, 15], [26, 15]]) {
      img.set(x, y, HEVEA_LEAF[3])
      img.set(x, y + 1, HEVEA_LEAF[4])
    }
    // Насіннєві коробочки.
    for (const [x, y] of [[12, 24], [32, 23], [24, 14]]) {
      img.set(x, y, '#8aa043')
      img.set(x + 1, y, '#667a32')
    }
    // Підсочка: косий надріз, свіжа світла кора, латекс тече жолобком.
    for (let k = 0; k < 6; k++) {
      img.set(19 + k, 44 + Math.round(k * 0.7), '#efe4c8')
      img.set(19 + k, 45 + Math.round(k * 0.7), BARK.dark)
    }
    img.set(24, 49, '#9aa3a8') // носик
    img.hline(19, 25, 51, '#6b4426') // стрічка
    // Чашка (половинка кокоса).
    img.rect(20, 52, 7, 5, '#7a4a24')
    img.hline(20, 26, 52, '#a8693a')
    img.hline(21, 25, 56, '#5b3a22')
    img.set(20, 53, '#a8693a')
    if (full) {
      img.rect(21, 52, 5, 2, '#fbf7ec')
      img.set(25, 53, '#e6dcc4')
      img.set(24, 50, '#fbf7ec') // крапля латексу
    } else img.set(24, 50, '#f3ecda', 0.7)
    return img.outline('#10301a')
  }

  /** Молода гевея — стрункий прутик з кількома пучками листя. */
  function rubberYoung() {
    const img = new Img(22, 36)
    shadow(img, 11, 34, 8, 2)
    mound(img, 11, 35)
    heveaTrunk(img, 11, 16, 33, 2)
    canopy(img, [[11, 10, 7], [5, 14, 4], [17, 14, 4], [11, 4, 4]], HEVEA_LEAF, 73)
    return img.outline('#16361a')
  }

  /* ───────── Іконки ───────── */

  /** Мідний злиточок: трапеція в три чверті — верх, лицьова грань і бік, відблиск. */
  function copperIngot() {
    const img = new Img(22, 14)
    // G — відблиск, H — верхня грань, M — лицьова, L — тінь і клеймо, D — бік праворуч.
    img.rows(
      [
        '.....GGGGGGGGGG.....',
        '....GHHHHHHHHHHD....',
        '...HHHHWWHHHHHHDD...',
        '..HHHHHHHHHHHHHHDD..',
        '.MMMMMMMMMMMMMMMMDD.',
        '.MMMMMLLLLLLMMMMMDDD',
        'MMMMMMMLMMLMMMMMMMDD',
        'MMMMMMMLLLLMMMMMMMDD',
        'MMMMMMMMMMMMMMMMMMDD',
        'LLLLLLLLLLLLLLLLLLLD',
      ],
      1,
      2,
      { G: COPPER.glint, W: '#fff4e6', H: COPPER.hi, M: COPPER.mid, L: COPPER.lo, D: COPPER.dark }
    )
    return img.outline(K, 0.9)
  }

  /** Моток голого дроту: кілька мідних петель і вільний кінчик. */
  function bareWire() {
    const img = new Img(22, 20)
    const ring = (cx, cy, rx, ry, col, back) => {
      for (let k = 0; k < 64; k++) {
        const t = (k / 64) * Math.PI * 2
        const x = Math.round(cx + Math.cos(t) * rx)
        const y = Math.round(cy + Math.sin(t) * ry)
        const front = Math.sin(t) > 0
        if (front === !back) img.set(x, y, Math.cos(t) < -0.3 ? COPPER.hi : Math.cos(t) > 0.5 ? COPPER.lo : col)
      }
    }
    // Задні половини петель — темніші, передні — поверх.
    for (const dx of [0, 2, 4]) ring(9 + dx, 10, 6, 6, COPPER.dark, true)
    for (const dx of [0, 2, 4]) ring(9 + dx, 10, 6, 6, COPPER.mid, false)
    // Кінчик, що стирчить праворуч угору.
    for (const [x, y] of [[18, 7], [19, 6], [19, 5], [20, 4]]) img.set(x, y, COPPER.mid)
    img.set(20, 3, COPPER.glint)
    // Відблиски.
    for (const [x, y] of [[5, 7], [7, 5], [9, 5]]) img.set(x, y, COPPER.glint)
    return img.outline(K, 0.85)
  }

  /** Насінина дерева: жолудь у капелюшку з паростком-листочком. */
  function treeSeed() {
    const img = new Img(16, 18)
    img.ellipse(7.5, 11.5, 4.6, 5, '#b07038')
    img.ellipse(6.6, 10.6, 2.6, 3.2, '#d39a5c')
    img.set(5, 9, '#f3c98e')
    img.set(5, 10, '#f3c98e')
    img.set(8, 16, '#7a4a24')
    // Капелюшок із лусочками.
    img.ellipse(7.5, 7, 5.2, 2.6, '#6b4426')
    for (const [x, y] of [[4, 6], [6, 7], [8, 6], [10, 7], [5, 8], [9, 8]]) img.set(x, y, '#8b5d3b')
    img.vline(7, 3, 5, '#5b3a22')
    // Листочок-паросток.
    img.rows(['..gg', '.gGg', 'gG..'], 8, 1, { g: LEAF[2], G: LEAF[0] })
    return img.outline(K, 0.9)
  }

  /** Каучук: брила-кулька натурального каучуку, бурштинова, з глянцем і слідами пальців. */
  function rubber() {
    const img = new Img(18, 16)
    img.ellipse(9, 9, 7.5, 6.2, '#9a5f2a')
    img.ellipse(8, 8, 5.6, 4.6, '#c47f3c')
    img.ellipse(7, 7, 3.2, 2.4, '#e2a862')
    img.set(5, 6, '#fde2b8')
    img.set(6, 5, '#fde2b8')
    // Тінь знизу і «складка» — каучук м'який.
    img.hline(5, 13, 14, '#6e3f1c')
    img.hline(10, 14, 11, '#8a5226')
    img.set(12, 9, '#8a5226')
    // Крапля латексу згори — ще свіжий.
    img.set(11, 2, '#fbf7ec')
    img.set(11, 3, '#efe8d6')
    return img.outline(K, 0.9)
  }

  /** Насінина гевеї: глянцева овальна, плямиста — як справжнє насіння каучуконоса. */
  function rubberSeed() {
    const img = new Img(16, 14)
    img.ellipse(8, 7.5, 6.4, 5, '#a9824f')
    for (let y = 2; y < 13; y++)
      for (let x = 1; x < 15; x++)
        if (img.alpha(x, y) && hash(Math.floor(x / 2), Math.floor(y / 2), 81) < 0.38) img.set(x, y, '#5a3a20')
    img.hline(3, 13, 12, '#4a2f19')
    img.set(5, 4, '#f3dcae')
    img.set(6, 4, '#f3dcae')
    img.set(5, 5, '#d8b98a')
    return img.outline(K, 0.9)
  }

  /* ───────── Акумулятор ───────── */

  /**
   * Акумуляторна шафка на кам'яній плиті: залізний корпус, три скляні банки спереду
   * (світиться стільки, скільки заряду — level 0…3), мідні клеми згори, кабель іде в землю.
   */
  function battery(level) {
    const img = new Img(24, 27)
    shadow(img, 12, 25, 10, 2)
    // Кам'яна плита.
    img.rect(2, 23, 20, 3, STONE.b)
    img.hline(2, 21, 23, STONE.hi)
    img.hline(2, 21, 25, STONE.lo)
    for (const x of [7, 14]) img.set(x, 24, STONE.grout)
    // Корпус: лівий бік світлий, правий у тіні, заклепки по кутах.
    img.rect(4, 7, 16, 16, IRON.mid)
    img.vline(4, 7, 22, IRON.hi)
    img.vline(5, 8, 21, IRON.hi, 0.5)
    img.vline(19, 7, 22, IRON.lo)
    img.vline(18, 8, 22, IRON.lo, 0.5)
    img.hline(4, 19, 22, IRON.lo)
    for (const [x, y] of [[5, 8], [18, 8], [5, 21], [18, 21]]) img.set(x, y, '#cfd6da')
    // Кришка з мідним кантом.
    img.rect(3, 5, 18, 2, IRON.lo)
    img.hline(3, 20, 5, IRON.hi)
    img.hline(4, 19, 7, COPPER.mid)
    // Клеми: «+» червона, «−» темна.
    img.rect(7, 2, 3, 3, COPPER.mid)
    img.hline(7, 9, 2, COPPER.glint)
    img.rect(7, 1, 3, 1, '#d8432c')
    img.rect(14, 2, 3, 3, COPPER.mid)
    img.hline(14, 16, 2, COPPER.glint)
    img.rect(14, 1, 3, 1, '#2b2b2b')
    // Скляні банки: темне скло, рідина світиться зеленим, коли банка заряджена.
    for (let i = 0; i < 3; i++) {
      const x = 7 + i * 4
      img.rect(x - 1, 10, 4, 10, '#1b2430')
      const lit = i < level
      for (let y = 11; y <= 18; y++) {
        img.set(x, y, lit ? (y < 13 ? '#d8ffd0' : '#7cf07a') : '#2c3a48')
        img.set(x + 1, y, lit ? (y < 13 ? '#b6ffa8' : '#4fc95a') : '#24303c')
      }
      img.set(x, 11, lit ? '#ffffff' : '#46586a') // відблиск на склі
    }
    // Блискавка на табличці.
    img.rows(['.Y', 'YY', 'Y.'], 11, 20, { Y: '#ffd35a' })
    // Кабель з правого боку — у землю.
    img.vline(21, 9, 24, COPPER.lo)
    img.set(21, 8, COPPER.mid)
    img.set(20, 8, COPPER.mid)
    return img.outline(K, 0.9)
  }

  /* ───────── Електропіч ───────── */

  const BRICK = { mortar: '#6f6458', dark: '#5a2416', lo: '#7d3622', mid: '#a04b2c', hi: '#c26a43' }

  /** Цегляна піч-купол на кам'яному цоколі, залізні дверцята з віконцем, димар і щиток із лампочкою. */
  function furnace(on) {
    const img = new Img(36, 42)
    shadow(img, 18, 40, 16, 2.5)
    // Цоколь.
    for (let y = 35; y <= 39; y++)
      for (let x = 2; x <= 33; x++) {
        const tone = hash(Math.floor(x / 5), y, 41)
        img.set(x, y, (x + (y % 2 ? 2 : 0)) % 5 === 0 ? STONE.grout : tone < 0.5 ? STONE.b : STONE.a)
      }
    img.hline(2, 33, 35, STONE.hi)
    img.hline(2, 33, 39, STONE.lo)
    // Цегляний корпус і купол.
    const brick = (x, y) => {
      const row = Math.floor(y / 3)
      const seamY = y % 3 === 2
      const seamX = (x + (row % 2 ? 3 : 0)) % 6 === 0
      if (seamY || seamX) return BRICK.mortar
      const t = hash(Math.floor((x + (row % 2 ? 3 : 0)) / 6), row, 17)
      return t < 0.3 ? BRICK.lo : t < 0.8 ? BRICK.mid : BRICK.hi
    }
    for (let y = 8; y <= 34; y++)
      for (let x = 4; x <= 31; x++) {
        // Купол: зверху округлий.
        if (y < 18) {
          const dx = (x + 0.5 - 18) / 14
          const dy = (y + 0.5 - 18) / 10
          if (dx * dx + dy * dy > 1) continue
        }
        let c = brick(x, y)
        if (x < 7) c = c === BRICK.mortar ? c : BRICK.hi // освітлений лівий бік
        if (x > 28) c = c === BRICK.mortar ? BRICK.dark : BRICK.lo // тінь праворуч
        img.set(x, y, c)
      }
    // Димар — залізна труба з ободом.
    img.rect(22, 1, 4, 10, IRON.mid)
    img.vline(22, 1, 10, IRON.hi)
    img.vline(25, 1, 10, IRON.lo)
    img.rect(21, 0, 6, 2, IRON.lo)
    img.hline(21, 26, 0, IRON.hi)
    // Арка під дверцята.
    for (let y = 19; y <= 34; y++)
      for (let x = 10; x <= 25; x++) {
        if (y < 23) {
          const dx = (x + 0.5 - 18) / 8
          const dy = (y + 0.5 - 23) / 4
          if (dx * dx + dy * dy > 1) continue
        }
        img.set(x, y, BRICK.dark)
      }
    // Дверцята.
    img.rect(12, 23, 12, 11, IRON.lo)
    img.rect(12, 23, 12, 1, IRON.hi)
    img.vline(12, 23, 33, IRON.mid)
    for (const [x, y] of [[13, 24], [22, 24], [13, 32], [22, 32]]) img.set(x, y, IRON.hi)
    img.rect(20, 29, 3, 1, COPPER.mid) // ручка
    // Віконце: увімкнена — жар світиться, вимкнена — темна з кількома жаринками.
    const glow = on ? ['#fff3b0', '#ffd35a', '#ff9a3c', '#ff5a1f'] : ['#3a2a22', '#2b1d16', '#2b1d16', '#2b1d16']
    for (let y = 25; y <= 28; y++) for (let x = 14; x <= 21; x++) img.set(x, y, glow[Math.min(3, Math.abs(y - 26) + (Math.abs(x - 17.5) > 2.5 ? 1 : 0))])
    if (!on) for (const [x, y] of [[15, 28], [19, 27], [17, 28]]) img.set(x, y, '#a8432b')
    // Відблиск жару на цоколі.
    if (on) for (let x = 12; x <= 23; x++) img.set(x, 35, '#ffb36a', 0.55)
    // Щиток на боці: залізна скринька, мідна обмотка, лампочка (зелена — є енергія, червона — немає).
    img.rect(29, 22, 6, 8, IRON.mid)
    img.hline(29, 34, 22, IRON.hi)
    img.vline(34, 22, 29, IRON.lo)
    for (const y of [25, 27]) img.hline(30, 33, y, COPPER.mid)
    img.rect(31, 23, 2, 1, on ? '#7cf07a' : '#ff5a46')
    img.vline(32, 30, 36, COPPER.lo) // кабель у землю
    return img.outline(K, 0.9)
  }

  /* ───────── Іконки електрики ───────── */

  /** Злиток у три чверті (той самий обрис, що в мідного) — з іншою палітрою. */
  function ingot(pal) {
    const img = new Img(22, 14)
    img.rows(
      [
        '.....GGGGGGGGGG.....',
        '....GHHHHHHHHHHD....',
        '...HHHHWWHHHHHHDD...',
        '..HHHHHHHHHHHHHHDD..',
        '.MMMMMMMMMMMMMMMMDD.',
        '.MMMMMLLLLLLMMMMMDDD',
        'MMMMMMMLMMLMMMMMMMDD',
        'MMMMMMMLLLLMMMMMMMDD',
        'MMMMMMMMMMMMMMMMMMDD',
        'LLLLLLLLLLLLLLLLLLLD',
      ],
      1,
      2,
      pal
    )
    return img.outline(K, 0.9)
  }

  /** Акумулятор для рюкзака: банка з клемами й зеленим зарядом. */
  function batteryIcon() {
    const img = new Img(18, 20)
    img.rect(3, 5, 12, 14, IRON.mid)
    img.vline(3, 5, 18, IRON.hi)
    img.vline(14, 5, 18, IRON.lo)
    img.hline(3, 14, 18, IRON.lo)
    img.rect(5, 8, 8, 8, '#1b2430')
    img.rect(6, 11, 6, 4, '#4fc95a')
    img.hline(6, 11, 11, '#b6ffa8')
    img.rows(['.Y.', 'YY.', '.YY', '.Y.'], 7, 9, { Y: '#ffd35a' })
    img.rect(4, 2, 3, 3, COPPER.mid)
    img.rect(4, 1, 3, 1, '#d8432c')
    img.rect(11, 2, 3, 3, COPPER.mid)
    img.rect(11, 1, 3, 1, '#2b2b2b')
    img.hline(3, 14, 5, COPPER.mid)
    return img.outline(K, 0.9)
  }

  /** Скло: прозора блакитна пластина з відблиском. */
  function glassIcon() {
    const img = new Img(18, 18)
    for (let y = 2; y <= 15; y++)
      for (let x = 2; x <= 15; x++) {
        const edge = x === 2 || y === 2 || x === 15 || y === 15
        img.set(x, y, edge ? '#6fa9c4' : (x + y) % 9 < 1 ? '#e9fbff' : y < 7 ? '#cdeefa' : '#a9dcf0')
      }
    // Діагональні відблиски.
    for (let k = 0; k < 6; k++) {
      img.set(5 + k, 10 - k, '#ffffff')
      img.set(9 + k, 13 - k, '#f2fdff')
    }
    img.vline(15, 3, 15, '#4f88a3')
    img.hline(3, 15, 15, '#4f88a3')
    return img.outline(K, 0.7)
  }

  /* ───────── Електроверстат ───────── */

  /**
   * Дерев'яний стіл із залізною стільницею: лещата зліва, паяльна станція з екранчиком і котушка
   * дроту справа. Увімкнений (є енергія в мережі) — екран світиться зеленим і паяльник жевріє.
   */
  function eBench(on) {
    const img = new Img(36, 32)
    shadow(img, 18, 30, 16, 2.5)
    // Ніжки й поперечка.
    for (const x of [4, 29]) {
      img.rect(x, 17, 3, 13, WOOD.mid)
      img.vline(x, 17, 29, WOOD.hi)
      img.vline(x + 2, 17, 29, WOOD.lo)
    }
    img.rect(6, 24, 24, 2, WOOD.lo)
    img.hline(6, 29, 24, WOOD.mid)
    // Полиця під стільницею з ящиком інструментів.
    img.rect(9, 20, 10, 4, IRON.lo)
    img.hline(9, 18, 20, IRON.hi)
    img.rect(13, 21, 2, 1, COPPER.mid)
    // Стільниця: дерево під залізною плитою.
    img.rect(2, 15, 32, 3, WOOD.pale)
    img.hline(2, 33, 17, WOOD.lo)
    img.rect(2, 13, 32, 2, IRON.mid)
    img.hline(2, 33, 13, IRON.hi)
    for (const x of [4, 12, 24, 31]) img.set(x, 14, '#cfd6da') // заклепки
    // Лещата зліва.
    img.rect(4, 9, 6, 4, IRON.lo)
    img.rect(4, 8, 6, 1, IRON.hi)
    img.rect(6, 6, 2, 2, IRON.mid)
    img.hline(3, 10, 11, '#33393e')
    // Паяльна станція: корпус, екран, ручка-регулятор.
    img.rect(15, 4, 10, 9, IRON.mid)
    img.vline(15, 4, 12, IRON.hi)
    img.vline(24, 4, 12, IRON.lo)
    img.hline(15, 24, 4, IRON.hi)
    const scr = on ? ['#d8ffd0', '#7cf07a'] : ['#2c3a48', '#24303c']
    img.rect(16, 5, 6, 4, scr[1])
    img.hline(16, 21, 5, scr[0])
    if (on) img.rows(['G.G.GG', '.GG.G.'], 16, 7, { G: '#2d6b18' }) // «графік» напруги
    img.rect(22, 10, 2, 2, COPPER.mid)
    img.set(17, 11, on ? '#7cf07a' : '#ff5a46') // лампочка живлення
    // Паяльник на підставці: жало жевріє, коли є струм.
    img.vline(27, 6, 12, IRON.lo)
    img.vline(28, 3, 9, '#2b2b2b')
    img.set(28, 2, on ? '#ffb36a' : IRON.mid)
    img.set(28, 1, on ? '#fff3b0' : IRON.hi)
    // Котушка мідного дроту справа.
    img.rect(30, 9, 4, 4, COPPER.mid)
    img.hline(30, 33, 9, COPPER.glint)
    img.vline(31, 9, 12, COPPER.lo)
    img.vline(33, 9, 12, COPPER.dark)
    // Кабель у землю.
    img.vline(33, 18, 29, COPPER.lo)
    return img.outline(K, 0.9)
  }

  /* ───────── Сонячна панель ───────── */

  const CELL_BLUE = { frame: '#c9d2d8', dark: '#173a6b', mid: '#24569a', hi: '#3c7cc8', glint: '#bfe3ff' }

  /** Похила панель з комірками на залізній стійці; по діагоналі — відблиск сонця. */
  function solarDeco() {
    const img = new Img(34, 30)
    shadow(img, 16, 28, 14, 2.5)
    // Стійка й опори.
    img.rect(14, 16, 4, 12, IRON.mid)
    img.vline(14, 16, 27, IRON.hi)
    img.vline(17, 16, 27, IRON.lo)
    img.rect(8, 26, 16, 2, IRON.lo)
    img.hline(8, 23, 26, IRON.hi)
    // Панель — паралелограм: верх зсунутий праворуч (нахил до сонця).
    const top = 2
    const bot = 18
    for (let y = top; y <= bot; y++) {
      const shift = Math.round(((bot - y) / (bot - top)) * 3)
      const x0 = 2 + shift
      const x1 = 27 + shift
      for (let x = x0; x <= x1; x++) {
        const edge = y === top || y === bot || x === x0 || x === x1
        const u = x - x0
        const v = y - top
        const seam = u % 5 === 0 || v % 4 === 0
        let c = edge ? CELL_BLUE.frame : seam ? CELL_BLUE.dark : v < 6 ? CELL_BLUE.hi : CELL_BLUE.mid
        // Відблиск — діагональна смуга.
        if (!edge && !seam && Math.abs(u - v * 1.6 - 6) < 1.5) c = CELL_BLUE.glint
        img.set(x, y, c)
      }
    }
    img.hline(6, 29, top, '#eef3f6')
    // Коробка з'єднань і кабель у землю.
    img.rect(18, 19, 4, 3, '#2b2b2b')
    img.vline(21, 22, 27, COPPER.lo)
    return img.outline(K, 0.9)
  }

  /* ───────── Нові іконки ───────── */

  /** Кварц: друза з трьох рожево-білих кристалів. */
  function quartzIcon() {
    const img = new Img(18, 18)
    const crystal = (cx, top, h, w) => {
      for (let y = top; y < top + h; y++) {
        const half = y < top + 3 ? (y - top) * (w / 3) : w
        for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) img.set(x, y, y < top + 2 ? '#ffffff' : x < cx ? '#fbe9f2' : '#e3b8cf')
        img.set(Math.round(cx), y, '#ffffff')
      }
    }
    crystal(5, 5, 10, 1.5)
    crystal(13, 6, 9, 1.5)
    crystal(9, 1, 14, 2)
    img.rect(3, 14, 12, 2, '#9c8a96')
    img.hline(3, 14, 14, '#c2b0bc')
    return img.outline(K, 0.8)
  }

  /** Обсидіан: чорний глянцевий уламок із фіолетовими відблисками. */
  function obsidianIcon() {
    const img = new Img(18, 18)
    img.rows(
      [
        '.....DDDD.......',
        '....DMMMHD......',
        '...DMMHHPMD.....',
        '..DMMMHPMMMD....',
        '.DMMMMMMMMMMD...',
        'DMMMLMMMMMHMMD..',
        'DMMLLMMMMHPMMMD.',
        'DMMLLLMMMMMMMMMD',
        '.DMMLLMMMMMMMMD.',
        '..DMMLLMMMMMMD..',
        '...DDMMMMMMDD...',
        '.....DDDDDD.....',
      ],
      1,
      3,
      { D: '#120c1a', M: '#2a2236', L: '#1c1626', H: '#6c5a92', P: '#c7b2f0' }
    )
    return img.outline(K, 0.6)
  }

  /** Кремнієва пластина: сіро-синій диск із сіткою чипів і зрізом-«пласкою» внизу. */
  function waferIcon() {
    const img = new Img(18, 18)
    for (let y = 1; y <= 15; y++)
      for (let x = 1; x <= 16; x++) {
        const dx = x - 8.5
        const dy = y - 8.5
        if (dx * dx + dy * dy > 56) continue
        const grid = x % 3 === 0 || y % 3 === 0
        img.set(x, y, grid ? '#5f6f86' : dx + dy < -2 ? '#b9c6d8' : '#8796ad')
      }
    for (let k = 0; k < 4; k++) img.set(4 + k, 6 - k, '#eef3fa')
    return img.outline(K, 0.8)
  }

  /** Ізольований дріт: моток у червоній і чорній ізоляції з мідними кінчиками. */
  function insulatedWireIcon() {
    const img = new Img(18, 18)
    for (let k = 0; k < 3; k++) {
      const r = 6 - k * 0.6
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const x = 9 + Math.cos(a) * r + k * 0.6
        const y = 9 + Math.sin(a) * (r * 0.75)
        img.set(x, y, k % 2 ? '#2b2b2b' : '#d8432c')
      }
    }
    img.hline(13, 15, 13, '#d8432c')
    img.hline(16, 17, 13, COPPER.hi)
    img.hline(2, 4, 5, '#2b2b2b')
    img.hline(0, 1, 5, COPPER.hi)
    return img.outline(K, 0.8)
  }

  /** Сонячна панель для рюкзака: синя сітка комірок у світлій рамці. */
  function solarIcon() {
    const img = new Img(18, 18)
    for (let y = 2; y <= 14; y++)
      for (let x = 1; x <= 16; x++) {
        const edge = x === 1 || y === 2 || x === 16 || y === 14
        const seam = (x - 1) % 5 === 0 || (y - 2) % 4 === 0
        let c = edge ? CELL_BLUE.frame : seam ? CELL_BLUE.dark : y < 6 ? CELL_BLUE.hi : CELL_BLUE.mid
        if (!edge && !seam && Math.abs(x - (y - 2) * 1.3 - 4) < 1) c = CELL_BLUE.glint
        img.set(x, y, c)
      }
    img.rect(7, 15, 4, 2, IRON.mid)
    return img.outline(K, 0.9)
  }

  const sprites = {}
  sprites.e_bench_off = eBench(false)
  sprites.e_bench_on = eBench(true)
  sprites.solar_panel_deco = solarDeco()
  for (let f = 0; f < WINDMILL_FRAMES; f++) sprites[`windmill_${f}`] = windmillFrame(f)
  for (let l = 0; l <= 3; l++) sprites[`battery_${l}`] = battery(l)
  sprites.furnace_off = furnace(false)
  sprites.furnace_on = furnace(true)
  sprites.tree_plant_0 = plant0()
  sprites.tree_plant_1 = plant1()
  for (const kind of ['oak', 'birch', 'pine']) sprites[`tree_young_${kind}`] = young(kind)

  sprites.rubber_young = rubberYoung()
  sprites.rubber_tree = rubberTree(false)
  sprites.rubber_tree_full = rubberTree(true)

  const items = {
    copper_ingot: copperIngot(),
    bare_wire: bareWire(),
    tree_seed: treeSeed(),
    rubber: rubber(),
    rubber_seed: rubberSeed(),
    battery: batteryIcon(),
    glass: glassIcon(),
    iron_ingot: ingot({ G: '#f4f7f9', W: '#ffffff', H: IRON.hi, M: IRON.mid, L: IRON.lo, D: '#33393e' }),
    quartz: quartzIcon(),
    obsidian: obsidianIcon(),
    silicon_wafer: waferIcon(),
    insulated_wire: insulatedWireIcon(),
    solar_panel: solarIcon(),
  }
  return { sprites, items }
}
