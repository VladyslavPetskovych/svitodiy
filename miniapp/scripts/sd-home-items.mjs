/**
 * Ще одна партія речей для хатинки — намальована локальною моделлю (stable-diffusion.cpp + SDXL
 * + LoRA pixel-art-xl), а потім «спіксельована» в справжній спрайт гри скриптом pixelize.py
 * (рівна сітка, палітра острова, контур і тінь).
 *
 *   node scripts/sd-home-items.mjs            — згенерувати те, чого ще немає (сирі картинки кешуються)
 *   node scripts/sd-home-items.mjs bookcase   — лише ці речі
 *   node scripts/sd-home-items.mjs --redo sofa — перемалювати заново (нове зерно: --seed 123)
 *   node scripts/sd-home-items.mjs --pixelize  — лише заново спіксельувати сирі картинки
 *
 * Сирі 1024×1024 — art/home-ai/raw/ (у .gitignore), готові спрайти — art/home-ai/hd_<id>.png;
 * генератор атласу (gen-island-art.mjs) кладе їх в аркуш home-decor.png. Потім: npm run gen:island.
 * Шлях до моделі — змінна SD_HOME (типово ~/sd: bin/sd-cli.exe, models/, lora/).
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, pixelize, sdDraw } from './sd-lib.mjs'

const OUT = join(ROOT, 'art/home-ai')
const RAW = join(OUT, 'raw')

/**
 * id → що малювати й розмір спрайта (px гри). wall — висить на стіні (без тіні),
 * flat — лежить на підлозі, вид згори (без контуру й тіні).
 * Розміри — у масштабі решти меблів (комод 28×26, шафа 26×35, ліжко 38×45).
 */
export const AI_ITEMS = {
  bookcase: { size: '28x36', prompt: 'a tall wooden bookcase full of colorful books, rustic cottage furniture' },
  sofa: { size: '40x24', prompt: 'a cozy green velvet sofa with two embroidered cushions and wooden legs' },
  piano: { size: '34x30', prompt: 'an old upright wooden piano with candle holders and open keyboard' },
  aquarium: { size: '24x28', prompt: 'a glass fish tank aquarium with orange goldfish and green plants on a wooden cabinet stand' },
  globe: { size: '16x24', prompt: 'an antique world globe on a wooden stand' },
  easel: { size: '22x32', prompt: 'a wooden painting easel holding a canvas with a sunflower field painting' },
  birdcage: { size: '16x32', prompt: 'a brass birdcage with a yellow canary inside on a tall stand' },
  tea_table: { size: '22x20', prompt: 'a small round wooden side table with a white tea pot and two cups' },
  rocking_horse: { size: '24x20', prompt: 'a wooden toy rocking horse painted red and white' },
  telescope: { size: '18x30', prompt: 'a brass telescope on a wooden tripod' },
  ship_wheel: { size: '20x20', wall: true, prompt: 'a wooden ship steering wheel helm, flat front view' },
  life_ring: { size: '18x18', wall: true, prompt: 'a red and white life buoy ring with rope, flat front view' },
  sea_painting: { size: '28x20', wall: true, prompt: 'a framed painting of a sailboat on the sea with a lighthouse, gold wooden frame, flat front view' },
  ship_bottle: { size: '16x22', prompt: 'a ship in a glass bottle on a small wooden cabinet' },
  round_rug: { size: '46x28', flat: true, prompt: 'an oval braided rag rug with blue, white and yellow rings, top-down view' },
}

const args = process.argv.slice(2)
const redo = args.includes('--redo')
const onlyPixelize = args.includes('--pixelize')
const seedArg = args.indexOf('--seed')
const seed = seedArg >= 0 ? Number(args[seedArg + 1]) : 11
const named = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--seed')
const ids = named.length ? named : Object.keys(AI_ITEMS)

mkdirSync(RAW, { recursive: true })
for (const id of ids) {
  const item = AI_ITEMS[id]
  if (!item) {
    console.error(`невідома річ: ${id}`)
    process.exitCode = 1
    continue
  }
  const raw = join(RAW, `${id}.png`)
  if (!onlyPixelize && (redo || !existsSync(raw)) && !sdDraw(item.prompt, raw, { seed })) {
    process.exitCode = 1
    continue
  }
  if (!existsSync(raw)) continue
  const flags = item.flat ? [] : item.wall ? ['--outline'] : ['--outline', '--shadow']
  if (!pixelize(raw, join(OUT, `hd_${id}.png`), item.size, flags)) process.exitCode = 1
}
