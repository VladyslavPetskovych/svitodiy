import artVersion from './version.json'
import wear from './hero-wear.json'

/**
 * Вдягнений мандрівник: збираємо 12 кадрів (down/up/left/right × 3) із шарів аркуша hero-wear.png —
 * тіло, низ, верх, головний убір (scripts/hero-wear.mjs). Спільне для рушія (текстура мандрівника)
 * і шафи (прев'ю). Полотно — та сама сітка клітинок, що й в аркуші: кадр + 1 px прозорого поля.
 */

export const STARTER_OUTFIT = { hat: 'straw_hat', top: 'vyshyvanka', bottom: 'blue_pants' }
export const HERO_CELL = wear.cell
export const HERO_FRAME = wear.frame
export const HERO_FRAMES = wear.frames
export const HERO_SHEET_URL = `/game/walk/hero-wear.png?v=${artVersion.v}`

/** Вбрання зі стану гравця (state.wear) → що малювати; невідоме — стартове. hat: null — без капелюха. */
export function outfitOf(w) {
  const ok = (slot, id) => id != null && wear.layers[`${slot}:${id}`] != null
  return {
    hat: w && w.hat === null ? null : ok('hat', w?.hat) ? w.hat : STARTER_OUTFIT.hat,
    top: ok('top', w?.top) ? w.top : STARTER_OUTFIT.top,
    bottom: ok('bottom', w?.bottom) ? w.bottom : STARTER_OUTFIT.bottom,
  }
}

export const outfitKey = (o) => `${o.hat ?? '-'}|${o.top}|${o.bottom}`

/**
 * Намалювати мандрівника у вбранні outfit на полотно (12 клітинок в ряд).
 * @param {CanvasImageSource} sheet — завантажений hero-wear.png
 * @param {HTMLCanvasElement} [canvas]
 */
export function composeHero(sheet, outfit, canvas = document.createElement('canvas')) {
  const { w, h } = HERO_CELL
  canvas.width = w * HERO_FRAMES.length
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const o = outfitOf(outfit)
  for (const slot of wear.order) {
    const row = slot === 'body' ? wear.layers.body : o[slot] ? wear.layers[`${slot}:${o[slot]}`] : null
    if (row == null) continue
    ctx.drawImage(sheet, 0, row * h, canvas.width, h, 0, 0, canvas.width, h)
  }
  return canvas
}

/** Номер кадру за напрямком і кроком (0…2). */
export const heroFrameIndex = (dir, i) => HERO_FRAMES.indexOf(`${dir}_${i}`)

let sheetPromise = null
/** hero-wear.png як картинка (один раз на сесію). */
export function loadHeroSheet() {
  sheetPromise ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      sheetPromise = null
      reject(new Error('Не вдалося завантажити hero-wear.png'))
    }
    img.src = HERO_SHEET_URL
  })
  return sheetPromise
}
