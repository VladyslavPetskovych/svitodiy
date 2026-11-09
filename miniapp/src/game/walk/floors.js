import { FLOOR } from './home.js'

/**
 * Підлога в хатинці: візерунок (дошки, паркет, кахлі…) × колір. Спільне для генератора арту
 * (scripts/floor-art.mjs малює кожне поєднання в аркуш home-floors.png), рушія (накладає вибране
 * на підлогу кімнати) і панелі «Облаштувати» (зразки кольорів).
 * Назви візерунків, ціни й рівні — на сервері (catalog.floors), як і для речей у хаті.
 *
 * Аркуш: рядок — візерунок (у порядку FLOOR_PATTERNS), стовпчик — колір; клітинка = уся підлога
 * (FLOOR_CELL), разом зі світлом із вікон, тінню від стін і килимком біля дверей.
 */
export const FLOOR_PATTERNS = ['boards', 'herringbone', 'checker', 'hex', 'flagstone', 'clay']

/** Кольори кожного візерунку: назва й зразок для кнопки. Кількість — FLOOR_COLOR_COUNT. */
export const FLOOR_COLORS = {
  boards: [
    { name: 'Медовий дуб', swatch: '#9e6d46' },
    { name: 'Світла сосна', swatch: '#d2aa72' },
    { name: 'Темний горіх', swatch: '#5f3e28' },
    { name: 'Фарбовані сині', swatch: '#4f7fb5' },
  ],
  herringbone: [
    { name: 'Дуб', swatch: '#b0804f' },
    { name: 'Береза', swatch: '#e0c896' },
    { name: 'Горіх', swatch: '#6a4429' },
    { name: 'Вишня', swatch: '#9a4a32' },
  ],
  checker: [
    { name: 'Чорно-біла', swatch: '#2f2a28' },
    { name: 'Теракота й крем', swatch: '#c0623e' },
    { name: 'Зелена', swatch: '#4f8a5a' },
    { name: 'Синя', swatch: '#3d6aa8' },
  ],
  hex: [
    { name: 'Теракота', swatch: '#c06a42' },
    { name: 'Пісок', swatch: '#d8c093' },
    { name: 'Глазур', swatch: '#5d8fc6' },
    { name: 'Шавлія', swatch: '#8faa7c' },
  ],
  flagstone: [
    { name: 'Сірий камінь', swatch: '#9a958c' },
    { name: 'Пісковик', swatch: '#c9a979' },
    { name: 'Сланець', swatch: '#5e6b78' },
    { name: 'З мохом', swatch: '#7f8c6a' },
  ],
  clay: [
    { name: 'Вохра', swatch: '#c49a5e' },
    { name: 'Вибілена', swatch: '#e6dcc6' },
    { name: 'Червона глина', swatch: '#a65a3c' },
    { name: 'Сіра глина', swatch: '#8f8a80' },
  ],
}

export const FLOOR_COLOR_COUNT = 4
export const DEFAULT_FLOOR = { p: 'boards', c: 0 }

/** Клітинка аркуша — уся підлога кімнати. */
export const FLOOR_CELL = { w: FLOOR.x1 - FLOOR.x0, h: FLOOR.y1 - FLOOR.y0 }
export const FLOOR_SHEET = { w: FLOOR_CELL.w * FLOOR_COLOR_COUNT, h: FLOOR_CELL.h * FLOOR_PATTERNS.length }

/** Де на аркуші лежить підлога { p, c } (px); невідоме — стандартна. */
export function floorRect(f) {
  let row = FLOOR_PATTERNS.indexOf(f?.p)
  let col = Number.isInteger(f?.c) && f.c >= 0 && f.c < FLOOR_COLOR_COUNT ? f.c : 0
  if (row < 0) {
    row = 0
    col = 0
  }
  return { x: col * FLOOR_CELL.w, y: row * FLOOR_CELL.h, w: FLOOR_CELL.w, h: FLOOR_CELL.h }
}
