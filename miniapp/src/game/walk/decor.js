import { CELL } from './layout.js'

/**
 * Геометрія декору для пісочниці: який спрайт, скільки клітинок займає «ніжками»,
 * чи це підлога (по ній ходять, малюється під гравцем) і чи світиться.
 * Назви, ціни й категорії — з сервера (catalog.decor), тут лише те, що потрібно рушію.
 */
export const DECO_GEOM = {
  wildflowers: { sprite: 'deco_wildflowers', fw: 1, fh: 1, floor: true },
  flower_bed: { sprite: 'deco_flower_bed', fw: 2, fh: 1 },
  sunflowers: { sprite: 'deco_sunflowers', fw: 1, fh: 1 },
  bush: { sprite: 'bush', fw: 2, fh: 1 },
  sapling: { sprite: 'deco_sapling', fw: 1, fh: 1 },
  pine: { sprite: 'deco_pine', fw: 2, fh: 1 },
  pumpkins: { sprite: 'deco_pumpkins', fw: 2, fh: 1 },
  stepping_stone: { sprite: 'deco_stepping_stone', fw: 1, fh: 1, floor: true },
  cobble_tile: { sprite: 'deco_cobble_tile', fw: 2, fh: 2, floor: true },
  rock: { sprite: 'rock_big', fw: 2, fh: 1 },
  stone_lantern: { sprite: 'deco_stone_lantern', fw: 1, fh: 1, light: { dy: -15, r: 14 } },
  well: { sprite: 'deco_well', fw: 3, fh: 2 },
  plank_floor: { sprite: 'deco_plank_floor', fw: 2, fh: 2, floor: true },
  fence: { sprite: 'deco_fence', fw: 2, fh: 1 },
  bench: { sprite: 'deco_bench', fw: 3, fh: 1 },
  barrel: { sprite: 'barrel', fw: 1, fh: 1 },
  crates: { sprite: 'crates', fw: 2, fh: 1 },
  hay: { sprite: 'deco_hay', fw: 2, fh: 1 },
  signpost: { sprite: 'deco_signpost', fw: 1, fh: 1 },
  lamp_post: { sprite: 'post_lantern', fw: 1, fh: 1, light: { dy: -15, r: 16 } },
  campfire: { sprite: 'deco_campfire', fw: 2, fh: 1, light: { dy: -6, r: 26 }, fire: true },
}

/** Прив'язати точку до сітки так, щоб «ніжки» лягали рівно на клітинки. Якір — низ по центру. */
export function snapDeco(kind, x, y) {
  const g = DECO_GEOM[kind]
  const half = (g.fw * CELL) / 2
  const sx = Math.round((x - half) / CELL) * CELL + half
  const sy = Math.round((y + (g.fh * CELL) / 2) / CELL) * CELL
  return { x: sx, y: sy }
}

/** Прямокутник «ніжок» [x, y, w, h]. */
export function decoFootprint(kind, x, y) {
  const g = DECO_GEOM[kind]
  return [x - (g.fw * CELL) / 2, y - g.fh * CELL, g.fw * CELL, g.fh * CELL]
}
