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

/** Де чекають пси, яким сказали «Додому», якщо лежанки в хаті немає. */
export const DOG_SPOT = { x: 196, y: 160 }

/** Вікна в задній стіні (x0..x1), спільні для фону кімнати й світла на підлозі. */
export const WINDOWS = [
  { x0: 50, x1: 76 },
  { x0: 164, x1: 190 },
]

/** Висота стін (px світу) = висота задньої стіни в 2D-арті, тож речі на ній висять там само. */
export const WALL_H = FLOOR.y0

/**
 * Що стоїть у хатинці — лише те, що поставив гравець (interior з сервера, state.interior);
 * постійних меблів немає: ліжко, піч, стіл, полиця й лежанка псів — такі самі речі, їх можна
 * пересунути чи прибрати. Геометрія речей — у interior.js (вона ж додає дії й світло).
 *
 * layer: 'floor' — лежить на підлозі, 'obj' — стоїть (білборд), 'wall' — висить на стіні:
 * wall — 'back' | 'left' | 'right', at — де вздовж стіни (x для задньої, y для бічних),
 * h — висота низу над підлогою. x, y — та сама точка в 2D-координатах (для прев'ю й сортування).
 * @returns {{ s: string, x: number, y: number, layer: 'floor'|'obj'|'wall', blocks?: number[][],
 *   wall?: 'back'|'left'|'right', at?: number, h?: number, uid: string, kind: string }[]}
 */
export function homePlacements(interior = [], geom = {}, footprint = null) {
  const out = []
  for (const d of interior) {
    const g = geom[d.k]
    if (!g) continue
    const extra = { uid: d.id, kind: d.k }
    if (g.layer === 'wall') {
      const x = d.wall === 'back' ? d.at : d.wall === 'left' ? FLOOR.x0 : FLOOR.x1
      const y = d.wall === 'back' ? FLOOR.y0 - d.h : d.at
      out.push({ s: g.sprite, x, y, layer: 'wall', blocks: [], ...extra, wall: d.wall, at: d.at, h: d.h })
    } else out.push({ s: g.sprite, x: d.x, y: d.y, layer: g.layer, blocks: g.layer === 'obj' && footprint ? [footprint(d.k, d.x, d.y)] : [], ...extra })
  }
  return out
}

/** Вихід надвір — єдина дія, що є в хаті завжди (решта — від речей, див. interiorInteract). */
export const HOME_EXIT = { id: 'exit', label: 'Вийти надвір', near: [120, 178], r: 14, box: [102, 166, 36, 26] }
