/**
 * Фізика мандрівника: кінематичне тіло з прискоренням, гальмуванням і ковзанням уздовж стін.
 *
 * — Симуляція йде фіксованим кроком (HZ), рендер інтерполює між двома останніми станами,
 *   тож рух однаковий на 30 і на 120 FPS і не тремтить.
 * — Колайдер — та сама «ступня» 6×3 px, що й у пошуку шляху (grid.canStand), тож шлях,
 *   який знайшов BFS, фізика завжди пропустить.
 * — Тунелювання неможливе: за крок тіло зсувається ≤ MAX_SPEED / HZ ≈ 1.1 px, а найтонша
 *   перешкода — клітинка 8 px.
 * Координати — пікселі арту, швидкість — px/с.
 */

export const PHYS = {
  hz: 60,
  /** Скільки кроків максимум за кадр: після підвисання не «доганяємо» секундами (spiral of death). */
  maxSteps: 5,
  maxSpeed: 64,
  /** Розгін і гальмування, px/с². Розгін до повної ≈ 0.11 с, зупинка ≈ 0.08 с — чуйно, але не ривком. */
  accel: 580,
  decel: 820,
  /** Розворот у протилежний бік — швидше, щоб керування не здавалося «ватним». */
  reverseBoost: 1.8,
  /** Наскільки px «підсуваємо» тіло вбік, коли воно зачепилося за ріг. */
  cornerAssist: 3,
  /** На останній точці шляху гальмуємо плавно з цієї відстані, px. */
  arrive: 12,
}

export const FIXED_DT = 1 / PHYS.hz

export function createBody(x, y) {
  return { x, y, prevX: x, prevY: y, vx: 0, vy: 0 }
}

/** Миттєво переставити тіло (вхід у сцену): без інтерполяції «з минулого місця». */
export function teleport(body, x, y) {
  body.x = body.prevX = x
  body.y = body.prevY = y
  body.vx = body.vy = 0
}

/** Наблизити швидкість до бажаної (wx, wy) з обмеженим прискоренням. */
export function accelerate(body, wx, wy, dt) {
  const dvx = wx - body.vx
  const dvy = wy - body.vy
  const d = Math.hypot(dvx, dvy)
  if (d < 1e-6) return
  const want = Math.hypot(wx, wy)
  let rate = want < 1e-3 ? PHYS.decel : PHYS.accel
  if (want > 0 && body.vx * wx + body.vy * wy < 0) rate *= PHYS.reverseBoost
  const k = Math.min(1, (rate * dt) / d)
  body.vx += dvx * k
  body.vy += dvy * k
}

/**
 * Зрушити тіло на velocity·dt з колізіями: спершу по X, потім по Y (ковзання вздовж стін).
 * Якщо вісь заблоковано, але поруч (≤ cornerAssist px) прохід вільний — підсуваємо тіло
 * до нього, як у добрих top-down іграх: ріг не «ловить» мандрівника.
 * @param {(x: number, y: number) => boolean} canStand
 */
export function move(body, dt, canStand) {
  const dx = body.vx * dt
  const dy = body.vy * dt
  if (dx) {
    if (canStand(body.x + dx, body.y)) body.x += dx
    else if (Math.abs(body.vy) > Math.abs(body.vx) * 0.3 || !assist(body, dx, 0, canStand)) body.vx = 0
  }
  if (dy) {
    if (canStand(body.x, body.y + dy)) body.y += dy
    else if (Math.abs(body.vx) > Math.abs(body.vy) * 0.3 || !assist(body, 0, dy, canStand)) body.vy = 0
  }
}

/** Пошук вільного проходу поруч уздовж перпендикулярної осі. */
function assist(body, dx, dy, canStand) {
  const step = Math.max(Math.abs(dx), Math.abs(dy))
  for (let n = 1; n <= PHYS.cornerAssist; n++)
    for (const s of [1, -1]) {
      const ox = dy ? s * n : 0
      const oy = dx ? s * n : 0
      if (canStand(body.x + ox + dx, body.y + oy + dy) && canStand(body.x + ox, body.y + oy)) {
        const k = Math.min(1, step / n)
        body.x += ox * k
        body.y += oy * k
        return true
      }
    }
  return false
}

/**
 * Кермування вздовж шляху: бажана швидкість до наступної точки, на останній — «arrive»
 * (плавне гальмування). Пройдені точки знімає з path.
 * @returns {{ wx: number, wy: number, done: boolean }}
 */
export function followPath(body, path) {
  while (path.length) {
    const wp = path[0]
    const dx = wp.x - body.x
    const dy = wp.y - body.y
    const d = Math.hypot(dx, dy)
    const last = path.length === 1
    if (!last && d < 4) {
      path.shift()
      continue
    }
    if (last && d < 0.75) {
      body.x = wp.x
      body.y = wp.y
      body.vx = body.vy = 0
      path.shift()
      return { wx: 0, wy: 0, done: true }
    }
    const speed = last ? Math.max(10, PHYS.maxSpeed * Math.min(1, d / PHYS.arrive)) : PHYS.maxSpeed
    return { wx: (dx / d) * speed, wy: (dy / d) * speed, done: false }
  }
  return { wx: 0, wy: 0, done: true }
}
