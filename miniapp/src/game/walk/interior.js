import homeAtlas from './home-atlas.json'
import decorAtlas from './home-decor.json'
import { CELL } from './layout.js'
import { FLOOR, WALL_H } from './home.js'

/**
 * Пісочниця в хатинці: геометрія речей, які гравець сам розставляє (назви, ціни й рівні — з сервера,
 * catalog.interior). layer: 'obj' — стоїть на підлозі (заважає ходити), 'floor' — лежить (килими,
 * по них ходять), 'wall' — висить на стіні. fw × fh — «ніжки» у клітинках сітки підлоги.
 */
export const INTERIOR_GEOM = {
  chest: { sprite: 'home_chest', layer: 'obj', fw: 3, fh: 1 },
  bench: { sprite: 'home_bench', layer: 'obj', fw: 4, fh: 1 },
  boots: { sprite: 'home_boots', layer: 'obj', fw: 1, fh: 1 },
  washstand: { sprite: 'home_washstand', layer: 'obj', fw: 2, fh: 1 },
  plant: { sprite: 'home_plant', layer: 'obj', fw: 2, fh: 1 },
  armchair: { sprite: 'home_armchair', layer: 'obj', fw: 3, fh: 1 },
  spinning_wheel: { sprite: 'home_spinning_wheel', layer: 'obj', fw: 2, fh: 1 },
  aloe: { sprite: 'home_aloe', layer: 'obj', fw: 1, fh: 1 },
  cat: { sprite: 'home_cat', layer: 'obj', fw: 2, fh: 1 },
  water_barrel: { sprite: 'home_water_barrel', layer: 'obj', fw: 2, fh: 1 },
  oven_tools: { sprite: 'home_oven_tools', layer: 'obj', fw: 1, fh: 1 },
  firewood: { sprite: 'home_firewood', layer: 'obj', fw: 3, fh: 1 },
  pots: { sprite: 'home_pots', layer: 'obj', fw: 2, fh: 1 },
  sacks: { sprite: 'home_sacks', layer: 'obj', fw: 3, fh: 1 },
  veg_crate: { sprite: 'home_veg_crate', layer: 'obj', fw: 2, fh: 1 },
  basket: { sprite: 'home_basket', layer: 'obj', fw: 2, fh: 1 },
  churn: { sprite: 'home_churn', layer: 'obj', fw: 1, fh: 1 },
  jars: { sprite: 'home_jars', layer: 'obj', fw: 3, fh: 1 },
  yoke: { sprite: 'home_yoke', layer: 'obj', fw: 3, fh: 1 },
  rag_rug: { sprite: 'home_rag_rug', layer: 'floor', fw: 6, fh: 3 },
  rug: { sprite: 'home_rug', layer: 'floor', fw: 8, fh: 5 },
  herbs: { sprite: 'home_herbs', layer: 'wall' },
  rods: { sprite: 'home_rods', layer: 'wall' },
  garlic: { sprite: 'home_garlic', layer: 'wall' },
  peppers: { sprite: 'home_peppers', layer: 'wall' },
  hat_pegs: { sprite: 'home_hat_pegs', layer: 'wall' },
  geraniums: { sprite: 'home_geraniums', layer: 'wall' },
  mysnyk: { sprite: 'home_mysnyk', layer: 'wall' },
  rushnyk: { sprite: 'home_rushnyk', layer: 'wall' },
  photos: { sprite: 'home_photos', layer: 'wall' },
  clock: { sprite: 'home_clock', layer: 'wall' },
  icon: { sprite: 'home_icon', layer: 'wall' },
  wreath: { sprite: 'home_wreath', layer: 'wall' },
  kobza: { sprite: 'home_kobza', layer: 'wall' },
  mirror: { sprite: 'home_mirror', layer: 'wall' },
  // Нові речі (аркуш home-decor.png).
  loom: { sprite: 'hd_loom', layer: 'obj', fw: 4, fh: 1 },
  cradle: { sprite: 'hd_cradle', layer: 'obj', fw: 3, fh: 1 },
  dresser: { sprite: 'hd_dresser', layer: 'obj', fw: 3, fh: 1 },
  wardrobe: { sprite: 'hd_wardrobe', layer: 'obj', fw: 3, fh: 1 },
  rocking_chair: { sprite: 'hd_rocking_chair', layer: 'obj', fw: 2, fh: 1 },
  floor_clock: { sprite: 'hd_floor_clock', layer: 'obj', fw: 2, fh: 1 },
  desk: { sprite: 'hd_desk', layer: 'obj', fw: 3, fh: 1 },
  gramophone: { sprite: 'hd_gramophone', layer: 'obj', fw: 2, fh: 1 },
  sewing_machine: { sprite: 'hd_sewing_machine', layer: 'obj', fw: 2, fh: 1 },
  yarn_basket: { sprite: 'hd_yarn_basket', layer: 'obj', fw: 2, fh: 1 },
  lemon_tree: { sprite: 'hd_lemon_tree', layer: 'obj', fw: 2, fh: 1 },
  didukh: { sprite: 'hd_didukh', layer: 'obj', fw: 1, fh: 1 },
  motanka: { sprite: 'hd_motanka', layer: 'obj', fw: 1, fh: 1 },
  runner: { sprite: 'hd_runner', layer: 'floor', fw: 2, fh: 6 },
  kilim: { sprite: 'hd_kilim', layer: 'floor', fw: 4, fh: 3 },
  plates: { sprite: 'hd_plates', layer: 'wall' },
  violin: { sprite: 'hd_violin', layer: 'wall' },
  candle_shelf: { sprite: 'hd_candle_shelf', layer: 'wall' },
  embroidery: { sprite: 'hd_embroidery', layer: 'wall' },
  island_map: { sprite: 'hd_island_map', layer: 'wall' },
  pike_trophy: { sprite: 'hd_pike_trophy', layer: 'wall' },
  horseshoe: { sprite: 'hd_horseshoe', layer: 'wall' },
  wall_lamp: { sprite: 'hd_wall_lamp', layer: 'wall' },
  // Ще партія від локальної моделі (scripts/sd-home-items.mjs → art/home-ai → home-decor.png).
  bookcase: { sprite: 'hd_bookcase', layer: 'obj', fw: 3, fh: 1 },
  easel: { sprite: 'hd_easel', layer: 'obj', fw: 2, fh: 1 },
  rocking_horse: { sprite: 'hd_rocking_horse', layer: 'obj', fw: 3, fh: 1 },
  sofa: { sprite: 'hd_sofa', layer: 'obj', fw: 5, fh: 1 },
  aquarium: { sprite: 'hd_aquarium', layer: 'obj', fw: 3, fh: 1 },
  globe: { sprite: 'hd_globe', layer: 'obj', fw: 2, fh: 1 },
  birdcage: { sprite: 'hd_birdcage', layer: 'obj', fw: 2, fh: 1 },
  piano: { sprite: 'hd_piano', layer: 'obj', fw: 4, fh: 1 },
  telescope: { sprite: 'hd_telescope', layer: 'obj', fw: 2, fh: 1 },
  tea_table: { sprite: 'hd_tea_table', layer: 'obj', fw: 2, fh: 1 },
  round_rug: { sprite: 'hd_round_rug', layer: 'floor', fw: 6, fh: 3 },
  ship_wheel: { sprite: 'hd_ship_wheel', layer: 'wall' },
  life_ring: { sprite: 'hd_life_ring', layer: 'wall' },
  sea_painting: { sprite: 'hd_sea_painting', layer: 'wall' },
  ship_bottle: { sprite: 'hd_ship_bottle', layer: 'obj', fw: 2, fh: 1 },
}

/** Розмір спрайта речі (px світу). */
export const interiorSize = (kind) => {
  const s = INTERIOR_GEOM[kind]?.sprite
  return homeAtlas.frames[s] ?? decorAtlas.frames[s] ?? { w: 8, h: 8 }
}

/** «Ніжки» речі на підлозі [x, y, w, h]; якір — низ по центру. */
export function interiorFootprint(kind, x, y) {
  const g = INTERIOR_GEOM[kind]
  return [x - (g.fw * CELL) / 2, y - g.fh * CELL, g.fw * CELL, g.fh * CELL]
}

/** Межі стіни вздовж: задня — по x, бічні — по y. */
export const wallSpan = (wall) => (wall === 'back' ? [FLOOR.x0, FLOOR.x1] : [FLOOR.y0, FLOOR.y1])

/**
 * Прив'язати місце до сітки. tap — { x, y } на підлозі й/або wall: { wall, at, h } (куди влучив палець на стіні).
 * @returns {{ x: number, y: number } | { wall: string, at: number, h: number } | null}
 */
export function snapInterior(kind, tap) {
  const g = INTERIOR_GEOM[kind]
  if (!g) return null
  if (g.layer === 'wall') {
    if (!tap.wall) return null
    const { w, h: sh } = interiorSize(kind)
    const [lo, hi] = wallSpan(tap.wall.wall)
    const at = Math.round(Math.min(hi - w / 2, Math.max(lo + w / 2, tap.wall.at)) / 2) * 2
    // Палець — приблизно посередині речі: низ на пів висоти нижче, у межах стіни.
    const h = Math.round(Math.min(WALL_H - sh, Math.max(0, tap.wall.h - sh / 2)) / 2) * 2
    return { wall: tap.wall.wall, at, h }
  }
  if (tap.x == null) return null
  const half = (g.fw * CELL) / 2
  return { x: Math.round((tap.x - half) / CELL) * CELL + half, y: Math.round((tap.y + (g.fh * CELL) / 2) / CELL) * CELL }
}

/** Прямокутник речі на стіні [від, низ, ширина, висота] — для перевірки, чи не налазить на іншу. */
export function wallRect(kind, at, h) {
  const { w, h: sh } = interiorSize(kind)
  return [at - w / 2, h, w, sh]
}
