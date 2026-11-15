/**
 * Каменедробарка (server/src/game/cutter-def.js → STONE_CRUSHER; викликає scripts/gen-island-art.mjs).
 * Пара до рибообробні (scripts/fishhut-art.mjs) — того ж розміру й з тим самим жолобом праворуч, щоб стрічки
 * до них клались однаково. Усе — кодом, у палітрі хати:
 *  - ліворуч дерев'яний бункер на ніжках, з каменем — сюди стрічка від шахти скидає камінь;
 *  - посередині залізна щокова дробарка: темна паща з двома зубчастими щелепами, заклепки, маховик згори;
 *  - праворуч мотор (лампа: зелена — є струм) і жолоб, з якого визирає те, що було в породі
 *    (скло, мідна монета, срібло) — сюди під'єднують стрічку далі (port: dx 20, dy −4).
 * Кадри: stone_crusher — без струму; _on — під струмом, стоїть; _on_0 / _on_1 — дробить
 * (щелепи розходяться й сходяться, маховик крутиться, летить пил) — DECO_GEOM.stone_crusher.anim.
 * Якір — низ по центру, «ніжки» 4×2 клітинки (32×16 px).
 */

const K = '#2b1d16'
const WOOD = { dark: '#3f2816', lo: '#5b3a22', mid: '#8b5d3b', hi: '#b07a4c', pale: '#c79a62', light: '#e2bb84' }
const IRON = { hi: '#a9b2b7', mid: '#717a80', lo: '#474e54', dark: '#33393e' }
const COPPER = { hi: '#f6b277', mid: '#dc8445', lo: '#ad5f2b' }
const STONE = { hi: '#d2cdc3', mid: '#a19a8f', lo: '#716b63', dark: '#4c4842' }
const RUST = '#8a4a2a'
const DUST = '#e9e2d2'

export const CRUSHER_W = 52
export const CRUSHER_H = 50

/** @param {{ Img: any }} h */
export function stoneCrusherArt({ Img }) {
  const H = CRUSHER_H

  /** Камінчик 3×2 з відблиском. */
  function pebble(img, x, y, big = false) {
    img.rect(x, y, big ? 4 : 3, 2, STONE.mid)
    img.hline(x, x + (big ? 2 : 1), y, STONE.hi)
    img.set(x + (big ? 3 : 2), y + 1, STONE.lo)
    if (big) img.hline(x + 1, x + 3, y + 2, STONE.lo)
  }

  /** Дощатий поміст під усім (як у рибообробні). */
  function deck(img, x0, x1, y) {
    img.rect(x0, y, x1 - x0 + 1, 4, WOOD.mid)
    img.hline(x0, x1, y, WOOD.light)
    img.hline(x0, x1, y + 3, WOOD.dark)
    for (let x = x0 + 3; x < x1; x += 4) img.vline(x, y + 1, y + 2, WOOD.lo)
    for (const x of [x0 + 1, (x0 + x1) >> 1, x1 - 1]) img.vline(x, y + 4, y + 5, WOOD.dark)
  }

  /** Бункер ліворуч: дощата лійка на ніжках, згори — купа каменю. full — з каменем. */
  function hopper(img, x, y, full) {
    // Ніжки до помосту.
    img.vline(x + 2, y + 12, y + 19, WOOD.dark)
    img.vline(x + 3, y + 12, y + 19, WOOD.lo)
    img.vline(x + 11, y + 12, y + 19, WOOD.dark)
    // Лійка: вгорі 15 px, донизу звужується до 7.
    for (let j = 0; j < 12; j++) {
      const inset = Math.floor(j / 3)
      const x0 = x + inset
      const x1 = x + 14 - inset
      img.hline(x0, x1, y + j, j % 4 === 0 ? WOOD.lo : WOOD.mid)
      img.set(x0, y + j, WOOD.pale)
      img.set(x1, y + j, WOOD.dark)
    }
    // Залізні обручі.
    img.hline(x, x + 14, y + 1, IRON.mid)
    img.hline(x + 2, x + 12, y + 8, IRON.mid)
    img.set(x + 3, y + 8, IRON.hi)
    img.set(x + 1, y + 1, IRON.hi)
    // Горловина — у паща дробарки праворуч.
    img.rect(x + 11, y + 9, 5, 3, IRON.lo)
    img.hline(x + 11, x + 15, y + 9, IRON.mid)
    if (full) {
      // Купа каменю над краєм.
      img.ellipse(x + 7.5, y + 0.5, 6.5, 2.6, STONE.lo)
      pebble(img, x + 2, y - 2, true)
      pebble(img, x + 7, y - 3)
      pebble(img, x + 10, y - 1)
      pebble(img, x + 5, y)
    } else {
      img.hline(x + 1, x + 13, y, '#2a1a10')
    }
  }

  /** Маховик з 4 спицями; turn — повернутий на 45°. */
  function flywheel(img, cx, cy, turn) {
    img.ellipse(cx, cy, 7, 7, IRON.lo)
    img.ellipse(cx, cy, 5.6, 5.6, '#2a2f33')
    const spokes = turn
      ? [
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ]
      : [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
    for (const [dx, dy] of spokes) for (let r = 1; r <= 5; r++) img.set(cx - 0.5 + dx * r * (turn ? 0.72 : 1), cy - 0.5 + dy * r * (turn ? 0.72 : 1), IRON.mid)
    // Обід з відблиском зверху-зліва.
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      const x = cx - 0.5 + Math.cos(a) * 6.4
      const y = cy - 0.5 + Math.sin(a) * 6.4
      img.set(x, y, a > Math.PI * 1.05 && a < Math.PI * 1.7 ? IRON.hi : IRON.mid)
    }
    img.rect(cx - 1, cy - 1, 2, 2, COPPER.mid)
    img.set(cx - 1, cy - 1, COPPER.hi)
  }

  /** Корпус дробарки: залізна коробка з пащею; open — щелепи розійшлися, crushing — між ними камінь. */
  function body(img, x, y, open, crushing) {
    const w = 20
    const h = 22
    img.rect(x, y, w, h, IRON.mid)
    img.hline(x, x + w - 1, y, IRON.hi)
    img.vline(x, y, y + h - 1, IRON.hi)
    img.hline(x, x + w - 1, y + h - 1, IRON.dark)
    img.vline(x + w - 1, y + 1, y + h - 1, IRON.lo)
    // Посилена кромка згори і стики плит.
    img.rect(x + 1, y + 1, w - 2, 2, IRON.lo)
    img.hline(x + 1, x + w - 2, y + 1, IRON.hi)
    img.vline(x + 10, y + 3, y + 5, IRON.lo)
    // Заклепки по кутах.
    for (const [rx, ry] of [
      [2, 4],
      [w - 3, 4],
      [2, h - 3],
      [w - 3, h - 3],
    ]) {
      img.set(x + rx, y + ry, IRON.hi)
      img.set(x + rx + 1, y + ry + 1, IRON.dark)
    }
    // Іржаві патьоки під пащею.
    img.vline(x + 6, y + 17, y + 19, RUST, 0.6)
    img.vline(x + 13, y + 18, y + 20, RUST, 0.5)
    // Паща.
    const mx = x + 4
    const my = y + 6
    const mw = 12
    const mh = 11
    img.rect(mx, my, mw, mh, '#14100d')
    img.hline(mx, mx + mw - 1, my, IRON.dark)
    // Нерухома щелепа ліворуч: зубчаста плита.
    for (let j = 0; j < mh; j++) {
      const t = j % 3 === 1 ? 4 : 3
      img.hline(mx, mx + t - 1, my + j, j % 3 === 1 ? IRON.hi : IRON.lo)
    }
    // Рухома щелепа праворуч: розходиться (open) і сходиться.
    const gap = open ? 4 : 1
    const jx = mx + 3 + gap
    for (let j = 0; j < mh; j++) {
      // Внизу щелепи ближче — щока клином.
      const lean = Math.floor((mh - 1 - j) / 5)
      const x0 = jx + 1 + lean
      img.hline(x0, mx + mw - 1, my + j, j % 3 === 1 ? IRON.mid : IRON.lo)
      img.set(x0, my + j, j % 3 === 1 ? IRON.hi : IRON.mid)
    }
    if (crushing) {
      // Камінь між щелепами й крихти, що сиплються.
      if (open) pebble(img, mx + 4, my + 2, true)
      else {
        img.set(mx + 3, my + 3, STONE.hi)
        img.set(mx + 4, my + 4, STONE.mid)
      }
      img.set(mx + 4, my + mh - 2, STONE.mid)
      img.set(mx + 5, my + mh - 1, STONE.lo)
      img.set(mx + 3, my + mh, '#9bd3f0')
      img.set(mx + 6, my + mh, COPPER.mid)
    }
    // Табличка з молотом — щоб читалося «дробарка».
    img.rect(x + 7, y + 18, 6, 3, WOOD.light)
    img.hline(x + 8, x + 11, y + 19, K)
    img.vline(x + 9, y + 19, y + 20, K)
  }

  /** Жолоб праворуч (як у рибообробні), з нього визирає видобуте: скло, мідь, срібло. */
  function chute(img, x, y) {
    img.rect(x, y, 10, 7, WOOD.mid)
    img.hline(x, x + 9, y, WOOD.light)
    img.hline(x, x + 9, y + 6, WOOD.dark)
    img.vline(x, y, y + 6, WOOD.pale)
    for (let i = x + 3; i < x + 9; i += 3) img.vline(i, y + 1, y + 5, WOOD.lo)
    img.rect(x + 6, y + 2, 4, 3, '#1b120c')
    img.vline(x + 5, y + 1, y + 5, IRON.mid)
    img.hline(x + 5, x + 9, y + 1, IRON.hi)
    img.hline(x + 5, x + 9, y + 5, IRON.lo)
    img.set(x + 7, y + 3, '#9bd3f0')
    img.set(x + 8, y + 3, '#d8f0ff')
    img.set(x + 9, y + 2, COPPER.hi)
    img.set(x + 9, y + 4, '#e8eef2')
    img.set(x + 7, y + 4, STONE.mid)
    img.vline(x + 2, y + 7, y + 8, WOOD.dark)
    img.vline(x + 8, y + 7, y + 8, WOOD.dark)
  }

  /** Мотор над жолобом: залізний кожух, мідна обмотка, лампочка (зелена — є струм), пас до маховика. */
  function motor(img, x, y, on) {
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
    img.vline(x + 5, y + 7, y + 9, '#3a3a3a')
    img.vline(x + 1, y + 7, y + 9, '#2b2b2b')
  }

  /** Хмарки пилу, поки дробить. */
  function dust(img, x, y, phase) {
    const puffs = phase ? [[0, 0], [5, -3], [-3, -5]] : [[2, -2], [-2, -1], [4, -6]]
    for (const [dx, dy] of puffs) {
      img.ellipse(x + dx, y + dy, 2.2, 1.6, DUST, 0.55)
      img.set(x + dx - 1, y + dy - 1, '#ffffff', 0.5)
    }
  }

  /** state: idle / open / shut (щелепи під час дроблення); on — є струм. */
  function crusher(state, on = state !== 'idle') {
    const img = new Img(CRUSHER_W, CRUSHER_H)
    const cx = CRUSHER_W / 2
    const busy = state !== 'idle'
    img.ellipse(cx, H - 3, 22, 3.5, '#0b2010', 0.25)
    // Маховик позаду корпусу, праворуч угорі.
    flywheel(img, cx + 9, H - 33, state === 'shut')
    // Пас від мотора до маховика.
    for (let i = 0; i <= 10; i++) img.set(cx + 10 + i * 0.6, H - 33 + i * 1.3, '#2b2b2b')
    deck(img, 2, CRUSHER_W - 4, H - 8)
    body(img, cx - 9, H - 30, state === 'open', busy)
    hopper(img, 1, H - 28, busy || state === 'idle')
    // Жолоб: отвір на клітинці port (dx 20 від якоря, нижній ряд) — як у рибообробні.
    chute(img, cx + 15, H - 9)
    motor(img, cx + 15, H - 18, on)
    // Крихти, що з пащі сиплються на поміст і далі в жолоб.
    pebble(img, cx + 9, H - 10)
    if (busy) dust(img, cx - 2, H - 31, state === 'open')
    img.outline(K, 0.9)
    return img
  }

  return {
    stone_crusher: crusher('idle', false),
    stone_crusher_on: crusher('idle', true),
    stone_crusher_on_0: crusher('open'),
    stone_crusher_on_1: crusher('shut'),
  }
}
