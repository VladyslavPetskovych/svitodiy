/**
 * Спільне для скриптів, що малюють локальною моделлю (stable-diffusion.cpp, Vulkan):
 * намалювати сиру картинку 1024×1024 і «спіксельувати» її в спрайт гри (scripts/pixelize.py).
 *
 * Моделі (встановлює node scripts/sd-setup.mjs у SD_HOME, типово ~/sd):
 *   zimage (типово) — Z-Image-Turbo Q6_K (+ Qwen3-4B як текстовий енкодер): 8 кроків, значно краще слухає промпт
 *                     (рівно один предмет, правильні деталі), cfg 1 → негативний промпт не діє,
 *                     тож «чого не малювати» пишемо словами в самому промпті (AVOID нижче).
 *   sdxl            — стара SDXL base Q4 + pixel-art-xl (SD_MODEL=sdxl), запасна.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SD = process.env.SD_HOME ?? join(homedir(), 'sd')
export const MODEL = process.env.SD_MODEL ?? 'zimage'

export const STYLE = 'pixel art, single object, centered, game asset sprite, plain flat white background <lora:pixel-art-xl:1>'
export const NEGATIVE = 'blurry, photo, 3d render, floor, room, wall, shadow on background, text, watermark, frame border, multiple objects, cropped, cut off'

/** Z-Image: стиль на початку (тригер LoRA «Pixel art style.»), заборони — у кінці звичайними реченнями. */
const Z_STYLE =
  'Pixel art. A single game item sprite, retro 16-bit video game asset, crisp chunky pixels, limited palette, ' +
  'bold dark outline, simple flat shading, the whole object fully visible and centered, isolated on a plain pure white background.'
const Z_AVOID = 'Nothing else in the picture: no floor, no ground shadow, no scenery, no text, no border.'
/**
 * Ваги Z-Image (SD_ZIMAGE — інший файл у models/). LoRA тут навмисно немає: Z-Image і так малює чистий піксель-арт,
 * а на 8 ГБ Vulkan LoRA не влазить (at_runtime — бракує VRAM; immediately — K-кванти не вміють CPY, Q5_0 — бракує VRAM).
 */
const Z_WEIGHTS = process.env.SD_ZIMAGE ?? 'z_image_turbo-Q6_K.gguf'

/** Негативний промпт SDXL → речення для Z-Image (без людей тощо). Лише найважливіші слова. */
function avoidSentence(negative) {
  const extra = negative
    .split(',')
    .map((s) => s.trim())
    .filter((w) => w && !NEGATIVE.includes(w))
  return extra.length ? `${Z_AVOID} Do not draw any ${extra.join(', ')}.` : Z_AVOID
}

function argsFor(prompt, raw, { seed, negative, width, height, steps }) {
  if (MODEL === 'sdxl')
    return [
      '-m', join(SD, 'models/sdxl-base-Q4_0.gguf'),
      '--vae', join(SD, 'models/sdxl_vae_fp16fix.safetensors'),
      '--lora-model-dir', join(SD, 'lora'),
      '-p', `${STYLE}, ${prompt}`,
      '-n', negative,
      '-W', String(width), '-H', String(height), '--steps', String(steps ?? 20), '--cfg-scale', '6', '--seed', String(seed),
      '-o', raw,
    ]
  return [
    '--diffusion-model', join(SD, 'models', Z_WEIGHTS),
    '--llm', join(SD, 'models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf'),
    '--vae', join(SD, 'models/ae.safetensors'),
    '-p', `${Z_STYLE} ${prompt}. ${avoidSentence(negative)}`,
    '--cfg-scale', '1', '--steps', String(steps ?? 8),
    '--diffusion-fa', '--offload-to-cpu',
    '-W', String(width), '-H', String(height), '--seed', String(seed),
    '-o', raw,
  ]
}

/** Намалювати prompt у raw (PNG, типово 1024×1024). true — вийшло. */
export function sdDraw(prompt, raw, { seed = 11, negative = NEGATIVE, width = 1024, height = 1024, steps } = {}) {
  const t0 = Date.now()
  const exe = join(SD, 'bin/sd-cli.exe')
  if (!existsSync(exe)) {
    console.error(`немає ${exe} — спершу: node scripts/sd-setup.mjs`)
    return false
  }
  const r = spawnSync(exe, argsFor(prompt, raw, { seed, negative, width, height, steps }), {
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
  })
  if (r.status !== 0 || !existsSync(raw)) {
    console.error(`модель упала: ${raw}\n${r.stderr?.slice(-800)}`)
    return false
  }
  console.log(`${raw}: намальовано (${MODEL}) за ${Math.round((Date.now() - t0) / 1000)} с`)
  return true
}

/** Сира картинка → спрайт size ('WxH') з контуром / тінню (flags — прапорці pixelize.py). */
export function pixelize(raw, out, size, flags = [], { preview = true } = {}) {
  // Z-Image сам малює темний контур — ще один від pixelize.py робить спрайт важким («подвійний» контур). SD_OUTLINE=1 — повернути.
  if (MODEL === 'zimage' && !process.env.SD_OUTLINE) flags = flags.filter((f) => f !== '--outline')
  const extra = preview ? ['--preview', '6'] : []
  const p = spawnSync('python', ['-I', join(ROOT, 'scripts/pixelize.py'), raw, out, '--size', size, '--grid', '--main', '0.3', '--tol', '50', ...flags, ...extra], {
    stdio: 'inherit',
  })
  return p.status === 0
}
