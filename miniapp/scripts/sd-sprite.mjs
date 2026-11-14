/**
 * Будь-який спрайт локальною моделлю: кілька сідів → спіксельовані кандидати + аркуш для вибору.
 *
 *   node scripts/sd-sprite.mjs "a red mushroom with white spots" --size 24x24
 *   node scripts/sd-sprite.mjs "wooden barrel" --size 32x40 --seeds 1,2,3,4,5,6 --name barrel --shadow
 *   node scripts/sd-sprite.mjs "..." --pixelize                       — лише переспіксельувати кешовані сирі
 *   node scripts/sd-sprite.mjs "..." --name barrel --pick 3 --to public/game/x/barrel.png
 *
 * Прапорці: --size WxH (обов'язково), --seeds 1,2,3,4 (типово), --name (типово з промпту),
 *   --no-outline (для zimage контур і так не додається — модель малює свій), --shadow, --avoid "person, hand" (чого не малювати), --flags "--rotate -45 --tol 60"
 *   (сирі прапорці pixelize.py), --steps N, SD_MODEL=sdxl — стара модель.
 * Вихід: art/sprite-ai/<name>/ (у .gitignore): raw/<seed>.png, <seed>.png (спрайт), <seed>-x6.png, sheet.png.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { MODEL, NEGATIVE, ROOT, pixelize, sdDraw } from './sd-lib.mjs'

const argv = process.argv.slice(2)
const opt = (k, d) => {
  const i = argv.indexOf(k)
  return i >= 0 ? argv[i + 1] : d
}
const prompt = argv[0]?.startsWith('--') ? undefined : argv[0] // промпт — завжди перший аргумент
const size = opt('--size')
if (!prompt || !size) {
  console.error('використання: node scripts/sd-sprite.mjs "<що намалювати>" --size 24x24 [--seeds 1,2,3,4] [--name id]')
  process.exit(1)
}
const name = opt('--name', prompt.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40))
const seeds = opt('--seeds', '1,2,3,4').split(',').map(Number)
const dir = join(ROOT, 'art/sprite-ai', name)
// Сирі картинки різних моделей не змішуємо.
const rawDir = join(dir, MODEL === 'zimage' ? 'raw' : `raw-${MODEL}`)
mkdirSync(rawDir, { recursive: true })

const pick = opt('--pick')
if (pick) {
  const to = resolve(ROOT, opt('--to', `public/game/${name}.png`))
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(join(dir, `${pick}.png`), to)
  console.log(`${name} #${pick} → ${to}`)
  process.exit(0)
}

const negative = opt('--avoid') ? `${NEGATIVE}, ${opt('--avoid')}` : NEGATIVE
const flags = [...(argv.includes('--no-outline') ? [] : ['--outline']), ...(argv.includes('--shadow') ? ['--shadow'] : []), ...(opt('--flags', '').split(' ').filter(Boolean))]
const steps = opt('--steps') ? Number(opt('--steps')) : undefined

const done = []
for (const seed of seeds) {
  const raw = join(rawDir, `${seed}.png`)
  if (!argv.includes('--pixelize') && !existsSync(raw) && !sdDraw(prompt, raw, { seed, negative, steps })) continue
  if (existsSync(raw) && pixelize(raw, join(dir, `${seed}.png`), size, flags)) done.push(seed)
}

// Аркуш: сира картинка (зменшена) над прев'ю ×6 для кожного сіду — підписані номери сідів.
const sheet = join(dir, 'sheet.png')
const py = `
import sys; from PIL import Image, ImageDraw
d, raw, seeds = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
cells = []
for s in seeds:
    r = Image.open(f'{raw}/{s}.png').convert('RGB').resize((192, 192))
    p = Image.open(f'{d}/{s}-x6.png').convert('RGBA')
    p.thumbnail((192, 192), Image.NEAREST)
    c = Image.new('RGB', (200, 420), (236, 232, 222))
    c.paste(r, (4, 4)); c.paste(p, (4 + (192 - p.width) // 2, 204 + (192 - p.height) // 2), p)
    ImageDraw.Draw(c).text((6, 402), f'seed {s}', fill=(30, 30, 30))
    cells.append(c)
out = Image.new('RGB', (200 * len(cells), 420), (255, 255, 255))
for i, c in enumerate(cells): out.paste(c, (200 * i, 0))
out.save(f'{d}/sheet.png')
`
if (done.length && spawnSync('python', ['-I', '-c', py, dir, rawDir, done.join(',')], { stdio: 'inherit' }).status === 0)
  console.log(`аркуш: ${sheet}\nвибрати: node scripts/sd-sprite.mjs "${prompt}" --name ${name} --pick <seed> --to public/game/<куди>.png`)
else process.exitCode = 1
