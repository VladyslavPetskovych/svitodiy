/**
 * Встановити / перевірити локальну модель для спрайтів (stable-diffusion.cpp, Vulkan) у SD_HOME (типово ~/sd).
 * Ідемпотентно: качає лише відсутнє (докачує перервані файли), тож можна запускати будь-коли.
 *
 *   node scripts/sd-setup.mjs            — встановити все відсутнє (основна модель Z-Image-Turbo)
 *   node scripts/sd-setup.mjs --sdxl     — ще й стару SDXL + pixel-art-xl (запасна, SD_MODEL=sdxl)
 *   node scripts/sd-setup.mjs --update   — оновити сам stable-diffusion.cpp до останнього релізу
 *   node scripts/sd-setup.mjs --check    — лише показати, чого бракує
 *
 * Потрібно: curl і tar (є у Windows 10+), ~9 ГБ місця, GPU з Vulkan і ≥8 ГБ VRAM (менше — див. --offload у sd-lib).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SD } from './sd-lib.mjs'

const HF = 'https://huggingface.co'
/** [шлях у SD_HOME, URL, очікуваний розмір у байтах] */
const ZIMAGE = [
  ['models/z_image_turbo-Q6_K.gguf', `${HF}/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q6_K.gguf`, 5263239104],
  ['models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf', `${HF}/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, 2497281120],
  ['models/ae.safetensors', `${HF}/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors`, 335304388],
]
const SDXL = [
  ['models/sdxl-base-Q4_0.gguf', `${HF}/gpustack/stable-diffusion-xl-base-1.0-GGUF/resolve/main/stable-diffusion-xl-base-1.0-Q4_0.gguf`, 3940010720],
  ['models/sdxl_vae_fp16fix.safetensors', `${HF}/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl_vae.safetensors`, 334641162],
  ['lora/pixel-art-xl.safetensors', `${HF}/nerijs/pixel-art-xl/resolve/main/pixel-art-xl.safetensors`, 170543052],
]

const args = process.argv.slice(2)
const check = args.includes('--check')
const files = [...ZIMAGE, ...(args.includes('--sdxl') ? SDXL : [])]
let missing = 0

const run = (cmd, a) => spawnSync(cmd, a, { stdio: 'inherit' }).status === 0
const size = (p) => (existsSync(p) ? statSync(p).size : -1)

// 1. Сам stable-diffusion.cpp (останній реліз win-vulkan) — якщо його немає або --update.
const cli = join(SD, 'bin/sd-cli.exe')
if (!existsSync(cli) || args.includes('--update')) {
  if (check) {
    console.log(`бракує: ${cli}`)
    missing++
  } else {
    const rel = JSON.parse(spawnSync('curl', ['-sfL', 'https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest'], { encoding: 'utf8' }).stdout)
    const asset = rel.assets.find((a) => /bin-win-vulkan-x64\.zip$/.test(a.name))
    if (!asset) throw new Error(`у релізі ${rel.tag_name} немає win-vulkan збірки`)
    const zip = join(SD, 'sd-vulkan.zip')
    const tmp = join(SD, 'bin.new')
    mkdirSync(tmp, { recursive: true })
    console.log(`stable-diffusion.cpp ${rel.tag_name} …`)
    if (!run('curl', ['-fL', '--progress-bar', '-o', zip, asset.browser_download_url]) || !run('tar', ['-xf', zip, '-C', tmp]))
      throw new Error('не вдалося завантажити stable-diffusion.cpp')
    // У zip файли або в корені, або в одній теці — беремо ту, де лежить sd-cli.exe.
    const inner = existsSync(join(tmp, 'sd-cli.exe')) ? tmp : join(tmp, readdirSync(tmp)[0])
    rmSync(join(SD, 'bin'), { recursive: true, force: true })
    renameSync(inner, join(SD, 'bin'))
    rmSync(tmp, { recursive: true, force: true })
    rmSync(zip, { force: true })
  }
}

// 2. Ваги моделей.
for (const [rel, url, bytes] of files) {
  const p = join(SD, rel)
  if (size(p) > 0 && (!bytes || size(p) === bytes)) continue
  missing++
  if (check) {
    console.log(`бракує: ${p}${size(p) > 0 ? ` (недокачано ${size(p)}/${bytes})` : ''}`)
    continue
  }
  mkdirSync(join(p, '..'), { recursive: true })
  console.log(`↓ ${rel}`)
  // curl інколи завершується з кодом 0 на обірваному з'єднанні — докачуємо (-C -), доки розмір не збіжеться.
  for (let i = 0; i < 10 && size(p) !== bytes; i++) run('curl', ['-fL', '--retry', '5', '-C', '-', '--progress-bar', '-o', p, url])
  if (size(p) !== bytes) throw new Error(`не вдалося завантажити ${url} (${size(p)}/${bytes} байт)`)
}

if (check) console.log(missing ? `бракує ${missing} файл(ів) — запусти node scripts/sd-setup.mjs` : `усе на місці в ${SD}`)
else console.log(`готово: ${SD}. Перевірка: node scripts/sd-sprite.mjs "a red apple" --size 24x24`)
