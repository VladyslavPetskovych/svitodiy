/**
 * Човник біля пірса — корпус намальований локальною моделлю (stable-diffusion.cpp + SDXL + LoRA pixel-art-xl)
 * і спіксельований у крихітний спрайт (scripts/pixelize.py). Весла на воді, відблиск і брижі домальовує
 * генератор атласу (boat() у gen-island-art.mjs) — у 30×18 модель їх не втримує.
 *
 *   node scripts/sd-boat.mjs               — намалювати кандидатів (сирі картинки кешуються)
 *   node scripts/sd-boat.mjs --pixelize    — лише заново спіксельувати
 *   node scripts/sd-boat.mjs --pick 104    — обраний кандидат → art/boat-ai/boat.png
 *
 * Сирі 1024×1024 — art/home-ai/raw/boat_<seed>.png, кандидати — art/boat-ai/cand/ (обидва в .gitignore).
 * Потім: npm run gen:island.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { NEGATIVE, ROOT, pixelize, sdDraw } from './sd-lib.mjs'

const RAW = join(ROOT, 'art/home-ai/raw')
const CAND = join(ROOT, 'art/boat-ai/cand')
const SIZE = '30x18'
// Фарбований човник з подушками — чистіше читається в крихітному розмірі, ніж суцільно дерев'яний.
const PROMPT =
  'a small rowing dinghy seen from directly above, top-down view, hull painted white with a blue stripe, ' +
  'varnished honey wooden interior with two seats, a pair of oars resting inside, coiled rope at the bow, empty boat, cute cozy'
const NEG = `${NEGATIVE}, water, sea, waves, people, person, fisherman, sail, mast, ship, island`
const SEEDS = [101, 102, 103, 104]
// Модель малює човен носом угору — повертаємо носом праворуч, як стоїть біля пірса.
const ROTATE = { default: -90 }

const args = process.argv.slice(2)
const pick = args.indexOf('--pick')
mkdirSync(RAW, { recursive: true })
mkdirSync(CAND, { recursive: true })

if (pick >= 0) {
  const seed = args[pick + 1]
  copyFileSync(join(CAND, `boat_${seed}.png`), join(ROOT, 'art/boat-ai/boat.png'))
  console.log(`boat_${seed} → art/boat-ai/boat.png`)
} else {
  for (const seed of SEEDS) {
    const raw = join(RAW, `boat_${seed}.png`)
    if (!args.includes('--pixelize') && !existsSync(raw) && !sdDraw(PROMPT, raw, { seed, negative: NEG })) continue
    if (!existsSync(raw)) continue
    const rotate = String(ROTATE[seed] ?? ROTATE.default)
    pixelize(raw, join(CAND, `boat_${seed}.png`), SIZE, ['--outline', '--grey', '4.5', '--rotate', rotate])
  }
}
