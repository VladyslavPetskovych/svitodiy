import { ApiError, request } from './api.js'

/**
 * Хто ще на спільному острові (сервер — server/src/game/presence.js).
 *
 * Звичайне опитування через проксі Netlify: раз на `next` мс (його задає сервер — 0,5 с, коли
 * ви поруч; 2 с, коли в різних сценах; 5 с, коли нікого) шлемо свої точки за цей час і
 * отримуємо точки інших. Точку пишемо 10 разів на секунду — тож рух інших плавний,
 * хоч запитів мало. Одночасно в дорозі — лише один запит.
 *
 * Без React: екран острова створює й зупиняє, коли апку ховають чи йдуть з острова.
 */

const SAMPLE_MS = 100
/** Скільки точок тримаємо, поки сервер недоступний (старіші — викидаємо). */
const MAX_PENDING = 16
const MIN_NEXT = 400
const MAX_NEXT = 15_000
const TIMEOUT_MS = 8_000

/**
 * @param {{ initData: string,
 *   getSelf: () => ({ scene: string, x: number, y: number, fx: number, fy: number } | null | undefined),
 *   onPeers: (peers: object[], serverNow: () => number) => void,
 *   onChanged: () => void,
 *   onOff: () => void }} o
 *   onOff — острів виявився не спільним: більше не питаємо.
 */
export function createPresence({ initData, getSelf, onPeers, onChanged, onOff }) {
  let running = false
  let off = false
  let timer = null
  let sampler = null
  let inFlight = null
  let seq = 0
  let fails = 0
  /** @type {[number, number, number, string][]} [час клієнта, x, y, сцена] */
  let pending = []
  let last = null
  // Годинник сервера: різниця з нашим, згладжена (точки інших — у часі сервера).
  let offset = null
  const serverNow = () => Date.now() + (offset ?? 0)

  function sample() {
    const me = getSelf()
    if (!me) return
    const now = Date.now()
    last = me
    const prev = pending.at(-1)
    // Стоїть на місці — нова точка не потрібна (лише оновити час останньої не можна: сервер її вже міг узяти).
    if (prev && prev[1] === me.x && prev[2] === me.y && prev[3] === me.scene && now - prev[0] < 1000) return
    pending.push([now, Math.round(me.x * 10) / 10, Math.round(me.y * 10) / 10, me.scene])
    if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING)
  }

  async function tick() {
    timer = null
    if (!running || inFlight) return
    sample()
    if (!pending.length && last) pending.push([Date.now(), last.x, last.y, last.scene])
    // Копія: поки запит у дорозі, sample() дописує нові точки — їх не можна вважати надісланими.
    const sent = pending.slice()
    const sentUpTo = sent.at(-1)?.[0] ?? -Infinity
    const now = Date.now()
    const body = {
      seq: ++seq,
      fx: last?.fx ?? 0,
      fy: last?.fy ?? 1,
      s: sent.map(([at, x, y, sc]) => [now - at, x, y, sc]),
    }
    const ctrl = new AbortController()
    const kill = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const t0 = Date.now()
    let next = MAX_NEXT
    inFlight = request(initData, 'POST', '/presence', body, { signal: ctrl.signal })
    try {
      const res = await inFlight
      fails = 0
      // Надіслане сервер уже має — лишаємо тільки новіші точки.
      pending = pending.filter((p) => p[0] > sentUpTo)
      if (!res.shared) {
        off = true
        running = false
        onPeers([], serverNow)
        onOff()
        return
      }
      const t1 = Date.now()
      const o = res.serverTime - (t0 + t1) / 2
      offset = offset == null || Math.abs(o - offset) > 2000 ? o : offset + (o - offset) * 0.2
      if (running) {
        onPeers(res.peers ?? [], serverNow)
        if (res.changed) onChanged()
      }
      next = Math.min(MAX_NEXT, Math.max(MIN_NEXT, Number(res.next) || 5000))
    } catch (e) {
      // Мовчки: присутність — дрібниця, гравцеві не треба знати про кожен збій мережі.
      fails += 1
      if (e instanceof ApiError && (e.status === 401 || e.status === 400)) {
        running = false
        onPeers([], serverNow)
        return
      }
      next = Math.min(MAX_NEXT, 1000 * 2 ** Math.min(fails, 4))
      // Довго нема зв'язку — інших уже не показуємо (вони могли піти).
      if (fails >= 3) onPeers([], serverNow)
    } finally {
      clearTimeout(kill)
      inFlight = null
    }
    if (running) timer = setTimeout(tick, next)
  }

  return {
    start() {
      if (running || off) return
      running = true
      fails = 0
      pending = []
      sampler = setInterval(sample, SAMPLE_MS)
      // Якщо попередній запит ще в дорозі — наступний сам заплануємо, коли він повернеться.
      if (!inFlight) timer = setTimeout(tick, 0)
      else {
        const resume = () => {
          if (running && !timer && !inFlight) timer = setTimeout(tick, 0)
        }
        inFlight.then(resume, resume)
      }
    },
    /** Пішли з острова чи сховали апку: інші перестають нас бачити одразу. */
    stop() {
      if (!running) return
      running = false
      clearTimeout(timer)
      timer = null
      clearInterval(sampler)
      sampler = null
      pending = []
      onPeers([], serverNow)
      request(initData, 'DELETE', '/presence', undefined, { keepalive: true }).catch(() => {})
    },
  }
}
