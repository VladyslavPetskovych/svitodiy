---
name: pixel-sprites
description: Generate pixel-art game sprites/icons for this game with the local model (stable-diffusion.cpp + Z-Image-Turbo + pixel-art LoRA in ~/sd) and pixelize them into the game's palette. Use when the user asks to draw/generate/make a sprite, icon, item, decor, building or any pixel art, or says "use the local model".
---

# Pixel sprites with the local model

Everything runs locally from `miniapp/` (Windows, AMD RX 7600S 8 GB, Vulkan). Nothing is sent to a cloud service.

## 0. Make sure the model is installed
```
node scripts/sd-setup.mjs --check     # lists anything missing
node scripts/sd-setup.mjs             # downloads only what is missing (resumable, idempotent)
node scripts/sd-setup.mjs --update    # newest stable-diffusion.cpp win-vulkan build
node scripts/sd-setup.mjs --sdxl      # also the old SDXL fallback (SD_MODEL=sdxl)
```
Models live in `SD_HOME` (default `~/sd`), never in the repo.

## 1. One-off sprite → pick the best seed
```
node scripts/sd-sprite.mjs "a red mushroom with white spots" --size 24x24
node scripts/sd-sprite.mjs "wooden barrel with iron bands" --size 32x40 --seeds 1,2,3,4,5,6 --name barrel --shadow
```
- Output: `art/sprite-ai/<name>/` (gitignored), with `sheet.png` showing raw + pixelized ×6 per seed. **Look at the sheet** (Read the PNG) and choose.
- `--pick <seed> --to public/game/<path>.png` copies the chosen sprite into the game.
- `--pixelize` re-runs only the pixelizer on cached raws (instant): use it to tune `--flags "--tol 60 --main 0.5 --rotate -45 --colors 16"`.
- `--avoid "person, hand"` → appended as "Do not draw any …" (Z-Image runs at cfg 1, so a negative prompt does nothing; exclusions must be in the prompt text).

## 2. Batch scripts for game content (use sd-lib's sdDraw/pixelize)
`sd-home-items.mjs` (home decor → `npm run gen:island`), `sd-wardrobe.mjs` (clothing icons), `sd-tools.mjs`, `sd-boat.mjs`.
Raw caches are reused. Pass `--redo` (where supported) or delete the raw to redraw with the current model.

## Prompting tips (Z-Image-Turbo)
- Describe ONE object concretely: material, colors, shape, and key details. Natural sentences work better than tag lists.
- Hats/clothes tend to come out as a whole person wearing them, so say "on its own, not worn, no person".
- Long objects (tools, boats) render upright. Fix that with `--flags "--rotate -45"`.
- Speed: ~8 steps. If the GPU is busy, it can take several minutes per image.
- Fallback: `SD_MODEL=sdxl` (SDXL base Q4 + pixel-art-xl, 20 steps, real negative prompt).

## Rules
- Final sprites must go through `scripts/pixelize.py` (exact size, game palette from `public/game/walk/sprites.png`, outline). Never ship a raw 1024 image.
- On-body animated clothing layers are hand-authored in `scripts/hero-wear.mjs`. The model can't do them.
