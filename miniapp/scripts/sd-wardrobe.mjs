/**
 * Шафа з одягом — намальовано локальною моделлю (scripts/sd-lib.mjs):
 *   • сама шафа для хатинки → art/home-ai/hd_closet.png (генератор атласу кладе її в home-decor.png);
 *   • іконки одягу для шафи → public/game/wear/<id>.png.
 * Те, як одяг сидить на мандрівникові (шари 16×22 з кадрами ходьби), — намальовано вручну
 * в scripts/hero-wear.mjs: модель не вміє рівно 16 px з анімацією.
 *
 *   node scripts/sd-wardrobe.mjs              — те, чого ще немає (сирі картинки кешуються в art/wear-ai/raw)
 *   node scripts/sd-wardrobe.mjs beanie       — лише ці
 *   node scripts/sd-wardrobe.mjs --redo beanie --seed 7 — перемалювати
 *   node scripts/sd-wardrobe.mjs --pixelize   — лише заново спіксельувати
 * Потім: npm run gen:island (версія арту врахує нові іконки).
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { NEGATIVE, ROOT, pixelize, sdDraw } from './sd-lib.mjs'

const RAW = join(ROOT, 'art/wear-ai/raw')
const ICONS = join(ROOT, 'public/game/wear')
/** Одяг сам по собі — без людини, що його носить (модель любить домальовувати персонажа). */
const NO_PERSON = `${NEGATIVE}, person, character, human, man, woman, face, head, mannequin, body, legs, arms`
const HOME_AI = join(ROOT, 'art/home-ai')

/** id → що малювати. Іконки 24×24 з контуром; шафа — меблі з тінню (у масштабі «Розписної шафи» 26×35). */
export const WEAR_ART = {
  closet: { out: 'home', size: '26x34', prompt: 'a simple wooden clothes wardrobe closet with both doors open, shirts and a hat hanging inside on a rail, rustic cottage furniture' },
  // Головні убори
  straw_hat: { prompt: 'a straw hat with a wide brim and a red ribbon band' },
  flat_cap: { prompt: 'a single grey wool flat cap newsboy hat lying alone, product icon' },
  beanie: { prompt: 'a red knitted fisherman beanie hat with a folded cuff' },
  flower_wreath: { prompt: 'a ukrainian flower crown wreath with sunflowers, red poppies and colorful ribbons' },
  captain_cap: { prompt: 'a navy blue sea captain hat with white top, black visor and gold anchor badge' },
  // Верх
  vyshyvanka: { prompt: 'a white ukrainian embroidered shirt vyshyvanka with red cross-stitch pattern, folded flat, front view' },
  striped_shirt: { prompt: 'a sailor shirt with horizontal blue and white stripes, flat front view' },
  raincoat: { prompt: 'a bright yellow fisherman raincoat with hood and buttons, flat front view' },
  sweater: { prompt: 'a green knitted wool sweater with a cable pattern, flat front view' },
  // Низ
  blue_pants: { prompt: 'blue cotton trousers pants, flat front view' },
  shorts: { prompt: 'khaki beige shorts with a brown belt, flat front view' },
  sharovary: { prompt: 'wide red cossack trousers sharovary with a sash belt, flat front view' },
}

const args = process.argv.slice(2)
const redo = args.includes('--redo')
const onlyPixelize = args.includes('--pixelize')
const seedArg = args.indexOf('--seed')
const seed = seedArg >= 0 ? Number(args[seedArg + 1]) : 11
const named = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--seed')
const ids = named.length ? named : Object.keys(WEAR_ART)

mkdirSync(RAW, { recursive: true })
mkdirSync(ICONS, { recursive: true })
for (const id of ids) {
  const item = WEAR_ART[id]
  if (!item) {
    console.error(`невідома річ: ${id}`)
    process.exitCode = 1
    continue
  }
  const raw = join(RAW, `${id}.png`)
  if (!onlyPixelize && (redo || !existsSync(raw)) && !sdDraw(item.prompt, raw, { seed, negative: item.out === 'home' ? NEGATIVE : NO_PERSON })) {
    process.exitCode = 1
    continue
  }
  if (!existsSync(raw)) continue
  const ok =
    item.out === 'home'
      ? pixelize(raw, join(HOME_AI, `hd_${id}.png`), item.size, ['--outline', '--shadow'])
      : pixelize(raw, join(ICONS, `${id}.png`), item.size ?? '24x24', ['--outline'], { preview: false }) &&
        pixelize(raw, join(RAW, `../${id}.png`), item.size ?? '24x24', ['--outline']) // прев'ю ×6 — поза public
  if (!ok) process.exitCode = 1
}
