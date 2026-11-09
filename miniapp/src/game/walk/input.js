/**
 * Шар вводу: гра читає дії («move», «interact», «zoomIn»…), а не клавіші.
 * Прив'язки — дані нижче: фізичні коди клавіш (WASD лишається на місці на будь-якій розкладці)
 * і кнопки геймпада. Дотик і миша обробляє рушій окремо — це «вказати точку», а не дія.
 *
 * — move: утримання (рівень), читається кожен фіксований крок.
 * — interact / zoom*: натискання (фронт) з буфером: натиснув трохи раніше,
 *   ніж підійшов до будівлі, — дія все одно спрацює.
 */

const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE', 'Space', 'Enter'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
}

/** Стандартна розкладка геймпада (Gamepad API, mapping "standard"). */
const PAD = { interact: 0, zoomIn: 7, zoomOut: 6 }
const DEADZONE = 0.2

const CODE_TO_ACTION = new Map(Object.entries(KEYS).flatMap(([action, codes]) => codes.map((c) => [c, action])))

/** Не перехоплюємо клавіші, коли людина пише в полі вводу. */
const typing = (e) => {
  const t = e.target
  return t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

export function createInput() {
  const held = new Set()
  /** action → коли натиснули (с, performance.now) — для буфера. */
  const presses = new Map()
  const padPrev = new Set()
  let padAxis = { x: 0, y: 0 }
  let device = 'keyboard'

  const onKey = (e) => {
    const action = CODE_TO_ACTION.get(e.code)
    if (!action || typing(e)) return
    e.preventDefault()
    device = 'keyboard'
    if (e.type === 'keyup') {
      held.delete(action)
      return
    }
    if (!e.repeat) presses.set(action, performance.now() / 1000)
    held.add(action)
  }
  // Вікно втратило фокус — відпускаємо все, інакше мандрівник «залипне» в русі.
  const onBlur = () => held.clear()

  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  window.addEventListener('blur', onBlur)

  /** Опитати геймпад (раз на кадр): лівий стік і фронти кнопок. */
  function poll() {
    padAxis = { x: 0, y: 0 }
    const pads = navigator.getGamepads?.() ?? []
    const pad = [...pads].find((p) => p?.connected)
    if (!pad) return
    padAxis = radial(pad.axes[0] ?? 0, pad.axes[1] ?? 0)
    if (padAxis.x || padAxis.y) device = 'gamepad'
    const now = performance.now() / 1000
    for (const [action, i] of Object.entries(PAD)) {
      const down = !!pad.buttons[i]?.pressed
      if (down && !padPrev.has(action)) {
        presses.set(action, now)
        device = 'gamepad'
      }
      if (down) padPrev.add(action)
      else padPrev.delete(action)
    }
  }

  return {
    poll,
    /** Вектор руху −1…1 (x — праворуч, y — вниз), не довший за 1: діагональ не швидша. */
    move() {
      let x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0) + padAxis.x
      let y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0) + padAxis.y
      const len = Math.hypot(x, y)
      if (len > 1) {
        x /= len
        y /= len
      }
      return { x, y }
    },
    held: (action) => held.has(action) || padPrev.has(action),
    /** Забрати натискання, якщо воно було не давніше за buffer секунд. */
    take(action, buffer = 0) {
      const at = presses.get(action)
      if (at === undefined) return false
      if (performance.now() / 1000 - at > buffer) {
        presses.delete(action)
        return false
      }
      presses.delete(action)
      return true
    },
    /** Чи є свіже натискання (не забираючи його). */
    pending(action, buffer = 0) {
      const at = presses.get(action)
      return at !== undefined && performance.now() / 1000 - at <= buffer
    },
    get device() {
      return device
    },
    touched() {
      device = 'touch'
    },
    clear() {
      held.clear()
      presses.clear()
    },
    destroy() {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    },
  }
}

/** Радіальна мертва зона: дрейф стіка в спокої — нуль, далі плавно від краю зони. */
function radial(x, y) {
  const mag = Math.hypot(x, y)
  if (mag < DEADZONE) return { x: 0, y: 0 }
  const k = Math.min((mag - DEADZONE) / (1 - DEADZONE), 1) / mag
  return { x: x * k, y: y * k }
}
