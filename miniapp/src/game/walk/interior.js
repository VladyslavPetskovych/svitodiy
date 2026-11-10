import homeAtlas from './home-atlas.json'
import decorAtlas from './home-decor.json'
import { CELL } from './layout.js'
import { DOG_SPOT, FLOOR, HOME_EXIT, WALL_H } from './home.js'

/**
 * Пісочниця в хатинці: геометрія речей, які гравець сам розставляє (назви, ціни й рівні — з сервера,
 * catalog.interior). layer: 'obj' — стоїть на підлозі (заважає ходити), 'floor' — лежить (килими,
 * по них ходять), 'wall' — висить на стіні. fw × fh — «ніжки» у клітинках сітки підлоги.
 * act — що робить річ (підійти й натиснути): ліжко, піч, полиця; dogBed — тут сплять пси, яким сказали «Додому».
 * light — світло (або lights — кілька): { dx, h, r, color?, flicker?, power? } відносно якоря спрайта
 * (у речі на стіні — відносно середини її низу): r — розмір ореолу, освітлює ~2.5·r довкола;
 * color — колір світла (типово тепле), flicker — мерехтить, як вогонь.
 */
export const INTERIOR_GEOM = {
  // Колись постійні меблі — тепер такі самі речі.
  bed: { sprite: 'home_bed', layer: 'obj', fw: 4, fh: 5, act: 'bed', label: 'Ліжко' },
  stove: { sprite: 'home_stove', layer: 'obj', fw: 6, fh: 5, act: 'stove', label: 'Піч', light: { dx: -11, h: 8, r: 26, flicker: true } },
  table: { sprite: 'home_table', layer: 'obj', fw: 4, fh: 2 },
  lamp_table: { sprite: 'home_table_3', layer: 'obj', fw: 4, fh: 2, light: { dx: 13, h: 19, r: 18 } },
  stool: { sprite: 'home_stool', layer: 'obj', fw: 1, fh: 1 },
  shelf: { sprite: 'home_shelf', layer: 'obj', fw: 4, fh: 1, act: 'shelf', label: 'Полиця з книжками' },
  dog_bed: { sprite: 'home_dog_bed', layer: 'floor', fw: 3, fh: 2, dogBed: true },
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
  icon: { sprite: 'home_icon', layer: 'wall', light: { dx: 0, h: 6, r: 9, flicker: true, power: 0.6 } },
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
  candle_shelf: { sprite: 'hd_candle_shelf', layer: 'wall', light: { dx: 0, h: 10, r: 14, flicker: true, power: 0.8 } },
  embroidery: { sprite: 'hd_embroidery', layer: 'wall' },
  island_map: { sprite: 'hd_island_map', layer: 'wall' },
  pike_trophy: { sprite: 'hd_pike_trophy', layer: 'wall' },
  horseshoe: { sprite: 'hd_horseshoe', layer: 'wall' },
  wall_lamp: { sprite: 'hd_wall_lamp', layer: 'wall', light: { dx: 0, h: 11, r: 18, flicker: true } },
  // Ще партія від локальної моделі (scripts/sd-home-items.mjs → art/home-ai → home-decor.png).
  bookcase: { sprite: 'hd_bookcase', layer: 'obj', fw: 3, fh: 1, act: 'shelf', label: 'Книжкова шафа' },
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
  // Сучасна колекція (scripts/modern-art.mjs). Лампи, екрани, неон і гірлянди світять.
  arc_lamp: { sprite: 'hd_arc_lamp', layer: 'obj', fw: 2, fh: 1, light: { dx: 8, h: 27, r: 26, color: '#ffd6a0' } },
  sofa_modern: { sprite: 'hd_sofa_modern', layer: 'obj', fw: 5, fh: 2 },
  coffee_table: { sprite: 'hd_coffee_table', layer: 'obj', fw: 4, fh: 1 },
  tv_console: { sprite: 'hd_tv_console', layer: 'obj', fw: 5, fh: 1, light: { dx: 0, h: 27, r: 20, color: '#9cc4ff', power: 0.75 } },
  monstera: { sprite: 'hd_monstera', layer: 'obj', fw: 2, fh: 1 },
  snake_plant: { sprite: 'hd_snake_plant', layer: 'obj', fw: 1, fh: 1 },
  fridge: { sprite: 'hd_fridge', layer: 'obj', fw: 3, fh: 1 },
  kitchen: { sprite: 'hd_kitchen', layer: 'obj', fw: 5, fh: 1, act: 'stove', label: 'Кухня' },
  platform_bed: { sprite: 'hd_platform_bed', layer: 'obj', fw: 5, fh: 4, act: 'bed', label: 'Ліжко' },
  cube_shelf: { sprite: 'hd_cube_shelf', layer: 'obj', fw: 4, fh: 1, act: 'shelf', label: 'Стелаж із книжками' },
  lounge_chair: { sprite: 'hd_lounge_chair', layer: 'obj', fw: 3, fh: 1 },
  bean_bag: { sprite: 'hd_bean_bag', layer: 'obj', fw: 2, fh: 1 },
  side_lamp: { sprite: 'hd_side_lamp', layer: 'obj', fw: 2, fh: 1, light: { dx: 0, h: 22, r: 20, color: '#ffd09a' } },
  desk_setup: {
    sprite: 'hd_desk_setup', layer: 'obj', fw: 5, fh: 1,
    lights: [{ dx: -12, h: 29, r: 16, color: '#ffe0b0' }, { dx: 0, h: 29, r: 12, color: '#a8c8ff', power: 0.55 }],
  },
  cat_tree: { sprite: 'hd_cat_tree', layer: 'obj', fw: 3, fh: 1 },
  dining_set: { sprite: 'hd_dining_set', layer: 'obj', fw: 5, fh: 2 },
  record_player: { sprite: 'hd_record_player', layer: 'obj', fw: 3, fh: 1 },
  fireplace: { sprite: 'hd_fireplace', layer: 'obj', fw: 4, fh: 1, light: { dx: 0, h: 11, r: 30, flicker: true, color: '#ffb466' } },
  robot_vacuum: { sprite: 'hd_robot_vacuum', layer: 'obj', fw: 1, fh: 1 },
  geo_rug: { sprite: 'hd_geo_rug', layer: 'floor', fw: 6, fh: 4 },
  shag_rug: { sprite: 'hd_shag_rug', layer: 'floor', fw: 5, fh: 3 },
  neon_sign: { sprite: 'hd_neon_sign', layer: 'wall', light: { dx: 0, h: 10, r: 20, color: '#ff78c8', power: 0.85 } },
  fairy_lights: {
    sprite: 'hd_fairy_lights', layer: 'wall',
    lights: [-20, 0, 20].map((dx) => ({ dx, h: 8, r: 15, color: '#ffe2a0', power: 0.7 })),
  },
  abstract_art: { sprite: 'hd_abstract_art', layer: 'wall' },
  gallery: { sprite: 'hd_gallery', layer: 'wall' },
  float_shelf: { sprite: 'hd_float_shelf', layer: 'wall' },
  round_mirror: { sprite: 'hd_round_mirror', layer: 'wall' },
  sconce: { sprite: 'hd_sconce', layer: 'wall', light: { dx: 0, h: 13, r: 22, color: '#ffe0b0' } },
  clock_modern: { sprite: 'hd_clock_modern', layer: 'wall' },
  macrame: { sprite: 'hd_macrame', layer: 'wall' },
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

/**
 * Що можна зробити в хаті: вийти — завжди, решта — від речей з act (ліжко, піч, полиця…).
 * id — «<дія>:<id речі>», тож два ліжка — дві окремі точки. near — перед річчю (куди підходить
 * мандрівник), box — сам спрайт (тап по ньому веде сюди).
 */
export function interiorInteract(interior = []) {
  const list = [HOME_EXIT]
  for (const d of interior) {
    const g = INTERIOR_GEOM[d.k]
    if (!g?.act || d.x == null) continue
    const { w, h } = interiorSize(d.k)
    const near = [Math.min(FLOOR.x1 - 6, Math.max(FLOOR.x0 + 6, d.x)), Math.min(FLOOR.y1 - 4, d.y + 6)]
    list.push({ id: `${g.act}:${d.id}`, label: g.label, near, r: 16, box: [d.x - w / 2, d.y - h, w, h] })
  }
  return list
}

/** Відступ світла від площини стіни в кімнату (px світу) — щоб ореол не різала стіна. */
const WALL_GAP = 3

/**
 * Світло від речей у хаті (піч, лампи, екрани, неон…) — у форматі ефектів рушія.
 * Речі на підлозі — білборди: світло прив'язане до якоря (ax, ay) і зсуву dx/h у площині спрайта.
 * Речі на стіні не обертаються з камерою — їм одразу точка у світі (wx, wy, wz) і стіна (wall),
 * щоб світло ховалося разом зі стіною.
 */
export function interiorLights(interior = []) {
  const lights = []
  for (const d of interior) {
    const g = INTERIOR_GEOM[d.k]
    const list = g?.lights ?? (g?.light ? [g.light] : null)
    if (!list) continue
    for (const l of list) {
      const extra = { r: l.r, warm: true, uid: d.id, color: l.color, flicker: !!l.flicker, power: l.power ?? 1 }
      if (d.x != null) lights.push({ ax: d.x, ay: d.y, dx: l.dx, h: l.h, ...extra })
      else if (d.wall) {
        // Речі на стіні дивляться в кімнату: «праворуч» на задній стіні — +x, на лівій — −z, на правій — +z.
        const wy = d.h + l.h
        if (d.wall === 'back') lights.push({ wall: 'back', wx: d.at + l.dx, wy, wz: FLOOR.y0 + WALL_GAP, ...extra })
        else if (d.wall === 'left') lights.push({ wall: 'left', wx: FLOOR.x0 + WALL_GAP, wy, wz: d.at - l.dx, ...extra })
        else lights.push({ wall: 'right', wx: FLOOR.x1 - WALL_GAP, wy, wz: d.at + l.dx, ...extra })
      }
    }
  }
  return lights
}

/** Куди йдуть спати пси, яким сказали «Додому»: перша лежанка в хаті, інакше — біля стіни. */
export function dogBedSpot(interior = []) {
  const d = interior.find((x) => INTERIOR_GEOM[x.k]?.dogBed && x.x != null)
  return d ? { x: d.x, y: d.y - 4 } : DOG_SPOT
}
