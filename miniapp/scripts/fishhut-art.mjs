/**
 * Рибальська хата (викликає scripts/gen-island-art.mjs): fish_hut_<рівень> і fish_hut_<рівень>_on.
 *
 * Основа — хата з еталонного аркуша (public/game/walk/ETALON DESIGN.png, «Workshops & Production», четверта):
 * вирізана в art/fish-hut/etalon-crop.png і переведена в піксель гри скриптом pixelize.py:
 *
 *   python scripts/pixelize.py art/fish-hut/etalon-crop.png art/fish-hut/base.png --size 64x76 --tol 38 --outline --main 0.3
 *
 * Тут докладаємо кодом те, що робить її нашою:
 *  - мотор у залізному кожусі ліворуч (хата електрична) з лампочкою: зелена — є струм (_on), темна — нема;
 *  - ліхтар під стріхою — світить, коли хата ловить;
 *  - дерев'яний жолоб праворуч на помості — сюди під'єднається конвеєр (DECO_GEOM.fish_hut.port, FISH_HUT.port);
 *  - 2 рівень: бочка з уловом і рятувальний буй; 3 рівень: прапор на даху, другий мотор і повна скриня.
 *
 * Якір спрайта — низ по центру: полотно W×H, основа стоїть посередині.
 */

const K = '#2b1d16'
const WOOD = { dark: '#3f2816', lo: '#5b3a22', mid: '#8b5d3b', hi: '#b07a4c', pale: '#c79a62', light: '#e2bb84' }
const IRON = { hi: '#a9b2b7', mid: '#717a80', lo: '#474e54', dark: '#33393e' }
const COPPER = { hi: '#f6b277', mid: '#dc8445', lo: '#ad5f2b' }
const FISH = { hi: '#d9e6ef', mid: '#9fb4c4', lo: '#6d8496', fin: '#e07a4a' }
const LAMP = { hi: '#fff6c4', mid: '#ffd35a', lo: '#c98a1c' }

export const HUT_W = 80
export const HUT_H = 78
/** Де на полотні стоїть основа (64×76). */
const BX = (HUT_W - 64) / 2
const BY = HUT_H - 76

/**
 * @param {{ Img: any, base: any }} h base — art/fish-hut/base.png як Img
 */
export function fishHutArt({ Img, base }) {
  /** Мотор у кожусі: залізна коробка, мідна обмотка у віконці, шків з пасом до хати, лампочка. */
  function motor(img, x, y, on, big) {
    const w = big ? 13 : 11
    // Кожух.
    img.rect(x, y, w, 9, IRON.mid)
    img.hline(x, x + w - 1, y, IRON.hi)
    img.vline(x, y, y + 8, IRON.hi)
    img.hline(x, x + w - 1, y + 8, IRON.lo)
    img.vline(x + w - 1, y + 1, y + 8, IRON.lo)
    // Ребра охолодження.
    for (let i = x + 2; i < x + w - 2; i += 2) img.vline(i, y + 1, y + 2, IRON.lo)
    // Віконце з мідною обмоткою.
    img.rect(x + 2, y + 4, w - 4, 3, COPPER.lo)
    for (let i = x + 2; i < x + w - 2; i++) img.set(i, y + 4 + (i % 2), COPPER.hi)
    if (big) img.rect(x + 2, y + 4, 1, 3, COPPER.mid)
    // Шків праворуч і пас, що йде вгору, до лебідки невода.
    img.ellipse(x + w + 1.5, y + 5.5, 2.5, 2.5, IRON.lo)
    img.set(x + w + 1, y + 5, IRON.hi)
    img.vline(x + w + 3, y - 6, y + 4, '#3a3a3a')
    // Ніжки.
    img.rect(x + 1, y + 9, 2, 2, IRON.dark)
    img.rect(x + w - 3, y + 9, 2, 2, IRON.dark)
    // Лампочка: зелена — є струм.
    img.rect(x + w - 3, y + 1, 2, 2, on ? '#7cf07a' : '#5a2416')
    if (on) img.set(x + w - 3, y + 1, '#d8ffd0')
    // Кабель під землю (туди, де клітинка хати).
    img.vline(x + 3, y + 9, y + 11, '#2b2b2b')
  }

  /** Ліхтар під стріхою: скло жовте, коли світить. */
  function lantern(img, x, y, on) {
    img.vline(x + 1, y - 3, y - 1, K)
    img.rect(x, y, 3, 1, IRON.lo)
    img.rect(x, y + 1, 3, 3, on ? LAMP.mid : '#4b4f57')
    if (on) {
      img.set(x + 1, y + 2, LAMP.hi)
      for (const [dx, dy] of [[-1, 2], [3, 2], [1, 5]]) img.set(x + dx, y + dy, LAMP.mid, 0.35)
    }
    img.rect(x, y + 4, 3, 1, IRON.lo)
  }

  /** Жолоб для конвеєра: дерев'яний короб, отвір дивиться праворуч, мідна рамка-гніздо. */
  function chute(img, x, y) {
    img.rect(x, y, 10, 8, WOOD.mid)
    img.hline(x, x + 9, y, WOOD.light)
    img.hline(x, x + 9, y + 7, WOOD.dark)
    img.vline(x, y, y + 7, WOOD.pale)
    for (let i = x + 3; i < x + 9; i += 3) img.vline(i, y + 1, y + 6, WOOD.lo)
    // Отвір і рамка.
    img.rect(x + 6, y + 2, 4, 4, '#1b120c')
    img.vline(x + 5, y + 1, y + 6, COPPER.mid)
    img.hline(x + 5, x + 9, y + 1, COPPER.hi)
    img.hline(x + 5, x + 9, y + 6, COPPER.lo)
    // Риб'ячий хвостик в отворі — хата «видає» звідси.
    img.set(x + 8, y + 3, FISH.mid)
    img.set(x + 9, y + 3, FISH.hi)
    img.set(x + 9, y + 4, FISH.fin)
    // Опора у воду.
    img.vline(x + 2, y + 8, y + 9, WOOD.dark)
    img.vline(x + 8, y + 8, y + 9, WOOD.dark)
  }

  /** Бочка з уловом: хвости стирчать догори. */
  function fishBarrel(img, x, y) {
    img.rect(x, y + 2, 7, 7, WOOD.mid)
    img.vline(x, y + 2, y + 8, WOOD.hi)
    img.vline(x + 6, y + 2, y + 8, WOOD.lo)
    img.hline(x, x + 6, y + 4, IRON.lo)
    img.hline(x, x + 6, y + 7, IRON.lo)
    img.hline(x, x + 6, y + 2, WOOD.dark)
    for (const [dx, c] of [[1, FISH.hi], [3, FISH.mid], [5, FISH.hi]]) {
      img.vline(x + dx, y, y + 1, c)
      img.set(x + dx - 1, y - 1, FISH.fin)
      img.set(x + dx + 1, y - 1, FISH.fin)
    }
  }

  /** Рятувальний буй: червоно-біле кільце на кілочку. */
  function buoy(img, x, y) {
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2
      img.set(x + Math.cos(t) * 3, y + Math.sin(t) * 3, Math.floor(a / 2) % 2 ? '#f1ece0' : '#c8452f')
    }
    img.set(x, y - 4, WOOD.dark)
  }

  /** Прапор на даху: синьо-жовтий. */
  function flag(img, x, y) {
    img.vline(x, y, y + 11, WOOD.dark)
    img.set(x, y - 1, '#ffd23c')
    img.rect(x + 1, y, 8, 3, '#2f6fd6')
    img.rect(x + 1, y + 3, 8, 3, '#ffd23c')
    img.set(x + 8, y + 5, '#e0b42a')
  }

  /** Скриня з уловом на помості. */
  function crate(img, x, y) {
    img.rect(x, y, 9, 5, WOOD.hi)
    img.hline(x, x + 8, y, WOOD.light)
    img.hline(x, x + 8, y + 4, WOOD.lo)
    img.vline(x + 4, y + 1, y + 3, WOOD.mid)
    for (let i = x + 1; i < x + 8; i += 2) {
      img.set(i, y - 1, i % 4 === 1 ? FISH.hi : FISH.mid)
      img.set(i + 1, y - 1, FISH.lo)
    }
    img.set(x + 2, y - 2, FISH.fin)
    img.set(x + 6, y - 2, FISH.fin)
  }

  function hut(level, on) {
    const img = new Img(HUT_W, HUT_H)
    // Тінь на воді під помостом.
    img.ellipse(HUT_W / 2, HUT_H - 3, 30, 4, '#0b2010', 0.25)
    if (level >= 3) flag(img, BX + 11, BY + 1)
    img.blit(base, BX, BY)
    // Мотор ліворуч, біля помосту.
    motor(img, BX - 7, BY + 57, on, level >= 3)
    if (level >= 3) motor(img, BX - 7, BY + 45, on, false)
    lantern(img, BX + 29, BY + 35, on)
    // Жолоб праворуч: його отвір — гніздо конвеєра (port: dx 28, dy −8 від якоря).
    chute(img, HUT_W / 2 + 20, HUT_H - 13)
    if (level >= 2) {
      fishBarrel(img, BX + 46, BY + 60)
      buoy(img, BX + 60, BY + 44)
    }
    if (level >= 3) crate(img, BX + 22, BY + 66)
    img.outline(K, 0.9)
    // Світло ліхтаря — м'яке гало поверх контуру.
    if (on) for (const [dx, dy] of [[-2, 2], [4, 2], [1, -1], [1, 6]]) img.set(BX + 29 + dx, BY + 35 + dy, LAMP.hi, 0.25)
    return img
  }

  const sprites = {}
  for (let l = 1; l <= 3; l++) {
    sprites[`fish_hut_${l}`] = hut(l, false)
    sprites[`fish_hut_${l}_on`] = hut(l, true)
  }
  return sprites
}

/** Іконка електромотора для рюкзака: залізний корпус з ребрами, мідна обмотка, вал і клеми. */
export function motorIcon(Img) {
  const img = new Img(18, 18)
  // Корпус-циліндр збоку.
  for (let y = 4; y <= 13; y++)
    for (let x = 2; x <= 12; x++) {
      const u = (y - 4) / 9
      img.set(x, y, u < 0.2 ? IRON.hi : u < 0.7 ? IRON.mid : IRON.lo)
    }
  for (let x = 3; x <= 11; x += 2) img.vline(x, 5, 12, IRON.lo, 0.6)
  // Мідна обмотка у вікні.
  img.rect(5, 7, 5, 4, COPPER.mid)
  for (let x = 5; x <= 9; x++) img.set(x, 7 + (x % 2), COPPER.hi)
  img.hline(5, 9, 10, COPPER.lo)
  // Торець і вал.
  img.ellipse(13, 8.5, 2, 4.5, IRON.mid)
  img.vline(13, 5, 12, IRON.hi)
  img.hline(15, 17, 8, IRON.hi)
  img.hline(15, 17, 9, IRON.lo)
  // Ніжки й клеми з дротами.
  img.rect(3, 14, 2, 2, IRON.dark)
  img.rect(10, 14, 2, 2, IRON.dark)
  img.rect(4, 2, 2, 2, '#d8432c')
  img.rect(8, 2, 2, 2, '#2b2b2b')
  return img.outline(K, 0.9)
}

/**
 * Рибообробня (server/src/game/cutter-def.js): менша хата з тієї ж текстури, що й рибальська, — основу
 * art/fish-hut/base.png зменшуємо «модою» (у кожному квадратику — найчастіший колір, тож палітра не каламутніє).
 * Докладаємо кодом:
 *  - ліворуч дерев'яне корито — сюди стрічка привозить рибу;
 *  - спереду колода-плаха з тесаком: fish_cutter — порожня, тесак встромлений; fish_cutter_on_0/1 — риба на пласі,
 *    тесак угорі / внизу (кадри гортаються, поки на столі є риба — DECO_GEOM.fish_cutter.anim);
 *  - праворуч унизу жолоб із кісточкою й оком — сюди під'єднують стрічку далі (port: dx 20, dy −4).
 * Якір — низ по центру, «ніжки» 4×2 клітинки (32×16 px).
 */
export const CUTTER_W = 52
export const CUTTER_H = 50

/** Зменшити картинку в k разів «модою»: найчастіший непрозорий колір квадратика, прозоре — якщо його більшість. */
function shrink(Img, src, k) {
  const w = Math.round(src.w / k)
  const h = Math.round(src.h / k)
  const out = new Img(w, h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const count = new Map()
      let solid = 0
      let all = 0
      for (let sy = Math.floor(y * k); sy < Math.min(src.h, Math.floor((y + 1) * k)); sy++)
        for (let sx = Math.floor(x * k); sx < Math.min(src.w, Math.floor((x + 1) * k)); sx++) {
          all++
          const i = (sy * src.w + sx) * 4
          if (src.d[i + 3] < 128) continue
          solid++
          // Близькі відтінки — в один кошик, щоб «мода» не розсипалась на шум.
          const key = ((src.d[i] >> 3) << 10) | ((src.d[i + 1] >> 3) << 5) | (src.d[i + 2] >> 3)
          const c = count.get(key) ?? { n: 0, r: src.d[i], g: src.d[i + 1], b: src.d[i + 2] }
          c.n++
          count.set(key, c)
        }
      if (solid * 2 < all) continue
      let best = null
      for (const c of count.values()) if (!best || c.n > best.n) best = c
      out.set(x, y, '#' + [best.r, best.g, best.b].map((v) => v.toString(16).padStart(2, '0')).join(''))
    }
  return out
}

/** @param {{ Img: any, base: any }} h base — art/fish-hut/base.png як Img */
export function fishCutterArt({ Img, base }) {
  const small = shrink(Img, base, 1.75)
  const BONE = { hi: '#f4efe2', lo: '#c9bfa8' }
  const BLOOD = '#b8432f'

  /** Корито для риби ліворуч: низький ящик, у ньому хвіст. */
  function trough(img, x, y, full) {
    img.rect(x, y, 9, 5, WOOD.mid)
    img.hline(x, x + 8, y, WOOD.light)
    img.hline(x + 1, x + 7, y + 1, '#2a1a10')
    img.hline(x, x + 8, y + 4, WOOD.dark)
    img.vline(x, y, y + 4, WOOD.pale)
    img.vline(x + 4, y + 2, y + 3, WOOD.lo)
    if (full) {
      img.hline(x + 2, x + 5, y + 1, FISH.mid)
      img.set(x + 6, y + 1, FISH.hi)
      img.set(x + 1, y, FISH.fin)
    }
    img.vline(x + 1, y + 5, y + 6, WOOD.dark)
    img.vline(x + 7, y + 5, y + 6, WOOD.dark)
  }

  /** Плаха — зріз колоди з кільцями. */
  function block(img, x, y) {
    img.ellipse(x + 6, y + 6.5, 6.5, 2.6, WOOD.lo)
    img.rect(x, y + 3, 13, 4, WOOD.mid)
    img.hline(x, x + 12, y + 6, WOOD.dark)
    for (let i = x + 2; i < x + 12; i += 3) img.vline(i, y + 4, y + 5, WOOD.lo)
    img.ellipse(x + 6.5, y + 2.5, 6.5, 2.6, WOOD.light)
    img.ellipse(x + 6.5, y + 2.5, 4, 1.5, WOOD.pale)
    img.ellipse(x + 6.5, y + 2.5, 1.6, 0.8, WOOD.hi)
  }

  /** Дощатий поміст під усім: на ньому корито, плаха й жолоб — одна споруда, а не розкидані речі. */
  function deck(img, x0, x1, y) {
    img.rect(x0, y, x1 - x0 + 1, 4, WOOD.mid)
    img.hline(x0, x1, y, WOOD.light)
    img.hline(x0, x1, y + 3, WOOD.dark)
    for (let x = x0 + 3; x < x1; x += 4) img.vline(x, y + 1, y + 2, WOOD.lo)
    for (const x of [x0 + 1, (x0 + x1) >> 1, x1 - 1]) img.vline(x, y + 4, y + 5, WOOD.dark)
  }

  /** Тесак: up — занесений над плахою, інакше — встромлений лезом у плаху. */
  function cleaver(img, x, y, up) {
    if (up) {
      // Темна облямівка — щоб лезо читалося на тлі стіни хатинки.
      img.rect(x + 4, y - 15, 8, 7, K)
      img.rect(x + 8, y - 9, 4, 5, K)
      img.vline(x + 9, y - 9, y - 5, WOOD.dark)
      img.vline(x + 10, y - 9, y - 5, WOOD.mid)
      img.rect(x + 5, y - 14, 6, 5, IRON.mid)
      img.hline(x + 5, x + 10, y - 14, IRON.hi)
      img.vline(x + 5, y - 14, y - 10, '#e6edf0')
      img.set(x + 9, y - 13, IRON.lo)
      return
    }
    img.rect(x + 4, y - 3, 6, 4, IRON.mid)
    img.hline(x + 4, x + 9, y - 3, IRON.hi)
    img.hline(x + 4, x + 9, y + 1, '#e6edf0')
    img.set(x + 8, y - 2, IRON.lo)
    img.hline(x + 10, x + 14, y - 2, WOOD.dark)
    img.hline(x + 10, x + 14, y - 1, WOOD.mid)
  }

  /** Риба на пласі: цільна чи розрубана навпіл з бризками. */
  function fishOn(img, x, y, cut) {
    if (!cut) {
      img.hline(x + 1, x + 7, y, FISH.mid)
      img.hline(x + 2, x + 6, y - 1, FISH.hi)
      img.hline(x + 2, x + 6, y + 1, FISH.lo)
      img.set(x + 7, y - 1, '#1b1410')
      img.set(x, y - 1, FISH.fin)
      img.set(x, y + 1, FISH.fin)
      return
    }
    img.hline(x, x + 3, y, FISH.mid)
    img.hline(x + 1, x + 2, y - 1, FISH.hi)
    img.set(x - 1, y - 1, FISH.fin)
    img.set(x - 1, y + 1, FISH.fin)
    img.hline(x + 5, x + 8, y, FISH.mid)
    img.hline(x + 6, x + 7, y - 1, FISH.hi)
    img.set(x + 8, y - 1, '#1b1410')
    img.set(x + 4, y, BLOOD)
    for (const [dx, dy] of [[2, -3], [6, -3], [4, -4]]) img.set(x + dx, y + dy, BONE.hi)
  }

  /** Жолоб праворуч (як у хати, але з нього визирають кісточка й око). */
  function chute(img, x, y) {
    img.rect(x, y, 10, 7, WOOD.mid)
    img.hline(x, x + 9, y, WOOD.light)
    img.hline(x, x + 9, y + 6, WOOD.dark)
    img.vline(x, y, y + 6, WOOD.pale)
    for (let i = x + 3; i < x + 9; i += 3) img.vline(i, y + 1, y + 5, WOOD.lo)
    img.rect(x + 6, y + 2, 4, 3, '#1b120c')
    img.vline(x + 5, y + 1, y + 5, COPPER.mid)
    img.hline(x + 5, x + 9, y + 1, COPPER.hi)
    img.hline(x + 5, x + 9, y + 5, COPPER.lo)
    // Кісточка й риб'яче око — «нутрощі» йдуть звідси.
    img.hline(x + 7, x + 9, y + 3, BONE.hi)
    img.set(x + 7, y + 2, BONE.lo)
    img.set(x + 7, y + 4, BONE.lo)
    img.set(x + 9, y + 2, '#d8e8f0')
    img.vline(x + 2, y + 7, y + 8, WOOD.dark)
    img.vline(x + 8, y + 7, y + 8, WOOD.dark)
  }

  /** Відерце з нутрощами біля плахи. */
  function pail(img, x, y) {
    img.rect(x, y, 5, 5, IRON.mid)
    img.vline(x, y, y + 4, IRON.hi)
    img.vline(x + 4, y, y + 4, IRON.lo)
    img.hline(x, x + 4, y, IRON.dark)
    img.set(x + 1, y - 1, BONE.hi)
    img.set(x + 3, y - 1, BLOOD)
    img.set(x + 2, y - 1, FISH.lo)
  }

  /** state: idle — порожньо; up / down — риба на пласі, тесак угорі / внизу. */
  /** Електромотор тесака й транспортера над жолобом: залізний кожух, мідна обмотка, лампочка (зелена — є струм). */
  function cutterMotor(img, x, y, on) {
    img.rect(x, y, 10, 7, IRON.mid)
    img.hline(x, x + 9, y, IRON.hi)
    img.vline(x, y, y + 6, IRON.hi)
    img.hline(x, x + 9, y + 6, IRON.lo)
    img.vline(x + 9, y + 1, y + 6, IRON.lo)
    for (let i = x + 2; i < x + 8; i += 2) img.vline(i, y + 1, y + 2, IRON.lo)
    img.rect(x + 2, y + 3, 5, 2, COPPER.lo)
    for (let i = x + 2; i < x + 7; i++) img.set(i, y + 3 + (i % 2), COPPER.hi)
    img.rect(x + 7, y + 1, 2, 2, on ? '#7cf07a' : '#5a2416')
    if (on) img.set(x + 7, y + 1, '#d8ffd0')
    // Пас униз — до валика жолоба; кабель ліворуч у землю.
    img.vline(x + 5, y + 7, y + 9, '#3a3a3a')
    img.vline(x + 1, y + 7, y + 9, '#2b2b2b')
  }

  /** state: idle / up / down (тесак); on — є струм (лампа мотора). */
  function cutter(state, on = state !== 'idle') {
    const img = new Img(CUTTER_W, CUTTER_H)
    const cx = CUTTER_W / 2
    img.ellipse(cx, CUTTER_H - 3, 22, 3.5, '#0b2010', 0.25)
    // Хатинка трохи ліворуч від центру: праворуч лишається місце плахі й жолобу.
    img.blit(small, cx - Math.round(small.w / 2) - 3, CUTTER_H - small.h - 2)
    deck(img, 2, CUTTER_W - 4, CUTTER_H - 8)
    trough(img, 1, CUTTER_H - 12, state !== 'idle')
    block(img, cx - 3, CUTTER_H - 13)
    if (state === 'idle') cleaver(img, cx - 3, CUTTER_H - 11, false)
    else {
      fishOn(img, cx - 1, CUTTER_H - 11, state === 'down')
      cleaver(img, cx - 3, CUTTER_H - 11, state === 'up')
    }
    pail(img, cx - 9, CUTTER_H - 8)
    // Жолоб: отвір на клітинці port (dx 20 від якоря, нижній ряд).
    chute(img, cx + 15, CUTTER_H - 9)
    cutterMotor(img, cx + 15, CUTTER_H - 18, on)
    img.outline(K, 0.9)
    return img
  }

  return {
    fish_cutter: cutter('idle', false),
    fish_cutter_on: cutter('idle', true),
    fish_cutter_on_0: cutter('up'),
    fish_cutter_on_1: cutter('down'),
  }
}
