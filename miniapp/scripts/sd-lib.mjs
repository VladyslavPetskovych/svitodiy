/**
 * Спільне для скриптів, що малюють локальною моделлю (stable-diffusion.cpp + SDXL + LoRA pixel-art-xl):
 * намалювати сиру картинку 1024×1024 і «спіксельувати» її в спрайт гри (scripts/pixelize.py).
 * Шлях до моделі — змінна SD_HOME (типово ~/sd: bin/sd-cli.exe, models/, lora/).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SD = process.env.SD_HOME ?? join(homedir(), 'sd')

export const STYLE = 'pixel art, single object, centered, game asset sprite, plain flat white background <lora:pixel-art-xl:1>'
export const NEGATIVE = 'blurry, photo, 3d render, floor, room, wall, shadow on background, text, watermark, frame border, multiple objects, cropped, cut off'

/** Намалювати prompt у raw (PNG 1024×1024). true — вийшло. */
export function sdDraw(prompt, raw, { seed = 11, negative = NEGATIVE } = {}) {
  const t0 = Date.now()
  const r = spawnSync(
    join(SD, 'bin/sd-cli.exe'),
    [
      '-m', join(SD, 'models/sdxl-base-Q4_0.gguf'),
      '--vae', join(SD, 'models/sdxl_vae_fp16fix.safetensors'),
      '--lora-model-dir', join(SD, 'lora'),
      '-p', `${STYLE}, ${prompt}`,
      '-n', negative,
      '-W', '1024', '-H', '1024', '--steps', '20', '--cfg-scale', '6', '--seed', String(seed),
      '-o', raw,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' }
  )
  if (r.status !== 0 || !existsSync(raw)) {
    console.error(`модель упала: ${raw}\n${r.stderr?.slice(-800)}`)
    return false
  }
  console.log(`${raw}: намальовано за ${Math.round((Date.now() - t0) / 1000)} с`)
  return true
}

/** Сира картинка → спрайт size ('WxH') з контуром / тінню (flags — прапорці pixelize.py). */
export function pixelize(raw, out, size, flags = [], { preview = true } = {}) {
  const extra = preview ? ['--preview', '6'] : []
  const p = spawnSync('python', ['-I', join(ROOT, 'scripts/pixelize.py'), raw, out, '--size', size, '--grid', '--main', '0.3', '--tol', '50', ...flags, ...extra], {
    stdio: 'inherit',
  })
  return p.status === 0
}
