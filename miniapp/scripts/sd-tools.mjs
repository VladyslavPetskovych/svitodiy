/**
 * Іконки інструментів для верстата — намальовані локальною моделлю (stable-diffusion.cpp + SDXL + LoRA pixel-art-xl)
 * і спіксельовані в 24×24 (scripts/pixelize.py). Рівень 1 — дерев'яний, 2 — залізний (як у server/src/game/craft.js).
 *
 *   node scripts/sd-tools.mjs                 — намалювати кандидатів (сирі картинки кешуються)
 *   node scripts/sd-tools.mjs --pixelize      — лише заново спіксельувати
 *   node scripts/sd-tools.mjs --pick shovel_1 11 — обраний кандидат → public/game/tools/shovel_1.png
 *
 * Сирі 1024×1024 — art/home-ai/raw/tool_<id>_<seed>.png, кандидати — art/tools-ai/cand/ (обидва в .gitignore).
 * Потім: npm run gen:island (версія арту врахує нові іконки).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { NEGATIVE, ROOT, pixelize, sdDraw } from './sd-lib.mjs'

const RAW = join(ROOT, 'art/home-ai/raw')
const CAND = join(ROOT, 'art/tools-ai/cand')
const OUT = join(ROOT, 'public/game/tools')
const SIZE = '24x24'
const SEEDS = [5, 11, 23]
/** Поворот кандидата: типово −45° (лопать унизу → ліворуч унизу); де модель намалювала лопать угорі — 135°. */
const ROTATE = { shovel_1_11: 135, shovel_1_23: 135 }
const NEG = `${NEGATIVE}, person, hand, character, ground, dirt pile, snow, garden, plants`

/** id → що малювати. Лопата лежить по діагоналі — так вона вміщується в квадратну іконку. */
export const TOOL_ART = {
  shovel_1: {
    prompt:
      'a single wooden shovel lying diagonally, handmade from pale wood, carved flat wooden blade, ' +
      'long wooden handle with a D-shaped grip at the top, rope binding where blade meets handle, tool icon',
  },
  shovel_2: {
    prompt:
      'a single iron shovel lying diagonally, shiny grey steel pointed spade blade, ' +
      'long varnished wooden handle with a black D-shaped grip at the top, tool icon',
  },
}

const args = process.argv.slice(2)
const pick = args.indexOf('--pick')
mkdirSync(RAW, { recursive: true })
mkdirSync(CAND, { recursive: true })
mkdirSync(OUT, { recursive: true })

if (pick >= 0) {
  const [id, seed] = args.slice(pick + 1)
  copyFileSync(join(CAND, `${id}_${seed}.png`), join(OUT, `${id}.png`))
  console.log(`${id}_${seed} → public/game/tools/${id}.png`)
} else {
  for (const [id, item] of Object.entries(TOOL_ART))
    for (const seed of SEEDS) {
      const raw = join(RAW, `tool_${id}_${seed}.png`)
      if (!args.includes('--pixelize') && !existsSync(raw) && !sdDraw(item.prompt, raw, { seed, negative: NEG })) continue
      // Модель малює лопату сторч — кладемо по діагоналі (держак угору праворуч), як іконку предмета.
      if (existsSync(raw)) pixelize(raw, join(CAND, `${id}_${seed}.png`), SIZE, ['--outline', '--rotate', String(ROTATE[`${id}_${seed}`] ?? -45)])
    }
}
