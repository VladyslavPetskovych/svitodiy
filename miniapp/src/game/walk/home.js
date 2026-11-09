/**
 * Хатинка зсередини: розміри кімнати, меблі за рівнем хатинки й що де можна зробити.
 * Спільне для генератора (фон кімнати й меблі в атласі) і рушія.
 * Координати — у пікселях арту; якір спрайта — низ по центру.
 */

export const HOME_MAP = { w: 240, h: 192 }

/** Підлога: від задньої стіни до порогу, між бічними стінами. */
export const FLOOR = { x0: 8, x1: 232, y0: 54, y1: 184 }

/** Двері в нижній стіні й де з'являється мандрівник, зайшовши в дім. */
export const DOOR = { x0: 108, x1: 132 }
export const HOME_START = { x: 120, y: 174 }

/** Вікна в задній стіні (x0..x1), спільні для фону кімнати й світла на підлозі. */
/** Лежанка для псів біля печі: тут вони чекають, коли їм сказали «Додому». */
export const DOG_BED = { x: 198, y: 152 }

export const WINDOWS = [
  { x0: 50, x1: 76 },
  { x0: 164, x1: 190 },
]

/** Висота стін (px світу) = висота задньої стіни в 2D-арті, тож речі на ній висять там само. */
export const WALL_H = FLOOR.y0

/**
 * Що стоїть у хатинці. Постійні меблі (з ними пов'язані дії й світло): ліжко, піч, стіл з ослінчиками
 * (з 3-го рівня — з гасовою лампою), полиця з книжками (з 2-го) і лежанка псів. Решту гравець
 * розставляє сам — interior з сервера (state.interior), геометрія — у interior.js.
 *
 * layer: 'floor' — лежить на підлозі, 'obj' — стоїть (білборд), 'wall' — висить на стіні:
 * wall — 'back' | 'left' | 'right', at — де вздовж стіни (x для задньої, y для бічних),
 * h — висота низу над підлогою. x, y — та сама точка в 2D-координатах (для прев'ю й сортування).
 * uid і kind — у речей гравця (їх можна вибрати, пересунути, прибрати).
 * @returns {{ s: string, x: number, y: number, layer: 'floor'|'obj'|'wall', blocks?: number[][],
 *   wall?: 'back'|'left'|'right', at?: number, h?: number, uid?: string, kind?: string }[]}
 */
export function homePlacements(level, interior = [], geom = {}, footprint = null) {
  const out = []
  const add = (s, x, y, blocks = [], layer = 'obj', extra = {}) => out.push({ s, x, y, layer, blocks, ...extra })

  add('home_dog_bed', DOG_BED.x, DOG_BED.y, [], 'floor')
  add('home_bed', 40, 104, [[24, 60, 32, 42]])
  add('home_stove', 200, 110, [[176, 66, 48, 42]])
  add(level >= 3 ? 'home_table_3' : 'home_table', 120, 128, [[102, 114, 36, 14]])
  add('home_stool', 92, 134, [[88, 128, 8, 6]])
  add('home_stool', 148, 134, [[144, 128, 8, 6]])
  if (level >= 2) add('home_shelf', 120, 62, [[106, 54, 28, 8]])

  for (const d of interior) {
    const g = geom[d.k]
    if (!g) continue
    const extra = { uid: d.id, kind: d.k }
    if (g.layer === 'wall') {
      const x = d.wall === 'back' ? d.at : d.wall === 'left' ? FLOOR.x0 : FLOOR.x1
      const y = d.wall === 'back' ? FLOOR.y0 - d.h : d.at
      add(g.sprite, x, y, [], 'wall', { ...extra, wall: d.wall, at: d.at, h: d.h })
    } else add(g.sprite, d.x, d.y, g.layer === 'obj' && footprint ? [footprint(d.k, d.x, d.y)] : [], g.layer, extra)
  }
  return out
}

/** Що можна зробити в хаті. near — куди підходить мандрівник; box — тап по чому веде сюди. */
export function homeInteract(level) {
  const list = [
    { id: 'exit', label: 'Вийти надвір', near: [120, 178], r: 14, box: [102, 166, 36, 26] },
    { id: 'bed', label: 'Ліжко', near: [66, 92], r: 16, box: [22, 54, 36, 52] },
    { id: 'stove', label: 'Піч', near: [176, 120], r: 16, box: [174, 46, 52, 66] },
  ]
  if (level >= 2) list.push({ id: 'shelf', label: 'Полиця з книжками', near: [120, 72], r: 14, box: [104, 26, 32, 38] })
  return list
}
