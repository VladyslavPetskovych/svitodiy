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
export const WINDOWS = [
  { x0: 50, x1: 76 },
  { x0: 164, x1: 190 },
]

/**
 * Меблі хатинки: з кожним рівнем затишніше.
 * Рівень 1 — ліжко, піч, стіл із ослінчиками, скриня; 2 — полиця, рушник, килим, вазон;
 * 3 — крісло, картина, кіт на печі.
 * @returns {{ s: string, x: number, y: number, layer: 'floor'|'obj', blocks?: number[][] }[]}
 */
export function homePlacements(level) {
  const out = []
  const add = (s, x, y, blocks = [], layer = 'obj') => out.push({ s, x, y, layer, blocks })
  add('home_bed', 40, 104, [[24, 60, 32, 42]])
  add('home_stove', 200, 110, [[176, 66, 48, 42]])
  add(level >= 3 ? 'home_table_3' : 'home_table', 120, 128, [[102, 114, 36, 14]])
  add('home_stool', 92, 134, [[88, 128, 8, 6]])
  add('home_stool', 148, 134, [[144, 128, 8, 6]])
  add('chest', 40, 124, [[32, 118, 16, 6]])
  if (level >= 2) {
    add('home_rug', 120, 172, [], 'floor')
    add('home_shelf', 120, 62, [[106, 54, 28, 8]])
    add('home_rushnyk', 120, 24, [], 'floor')
    add('home_plant', 218, 176, [[212, 170, 12, 6]])
  }
  if (level >= 3) {
    add('home_armchair', 38, 168, [[26, 158, 24, 10]])
    add('home_picture', 91, 32, [], 'floor')
    add('home_cat', 188, 112)
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
