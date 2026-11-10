import { WEATHER, weatherAt } from '../weather.js'

/**
 * Небо над островом: справжнє сонце й погода світу.
 *
 * День і ніч — за висотою сонця там, де гравець: місце беремо з часового поясу пристрою
 * (Europe/Madrid → Мадрид), без запиту геолокації. Тож о 17:15 у листопаді в Ризі вже ніч,
 * а в Мадриді ще золота година — як за вікном.
 * Погода — спільна для всіх (weather.js), щоб на спільному острові обоє бачили той самий дощ.
 */

/** Столиці часових поясів: [широта, довгота]. */
const ZONES = {
  'Europe/Kyiv': [50.45, 30.52],
  'Europe/Kiev': [50.45, 30.52],
  'Europe/Riga': [56.95, 24.11],
  'Europe/Vilnius': [54.69, 25.28],
  'Europe/Tallinn': [59.44, 24.75],
  'Europe/Warsaw': [52.23, 21.01],
  'Europe/Berlin': [52.52, 13.4],
  'Europe/Prague': [50.08, 14.43],
  'Europe/Vienna': [48.21, 16.37],
  'Europe/Budapest': [47.5, 19.04],
  'Europe/Bratislava': [48.15, 17.11],
  'Europe/Bucharest': [44.43, 26.1],
  'Europe/Chisinau': [47.01, 28.86],
  'Europe/Sofia': [42.7, 23.32],
  'Europe/Madrid': [40.42, -3.7],
  'Atlantic/Canary': [28.12, -15.43],
  'Europe/Lisbon': [38.72, -9.14],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Brussels': [50.85, 4.35],
  'Europe/Amsterdam': [52.37, 4.9],
  'Europe/Copenhagen': [55.68, 12.57],
  'Europe/Stockholm': [59.33, 18.07],
  'Europe/Oslo': [59.91, 10.75],
  'Europe/Helsinki': [60.17, 24.94],
  'Europe/London': [51.51, -0.13],
  'Europe/Dublin': [53.35, -6.26],
  'Europe/Rome': [41.9, 12.5],
  'Europe/Zurich': [47.38, 8.54],
  'Europe/Istanbul': [41.01, 28.98],
  'America/New_York': [40.71, -74.0],
  'America/Toronto': [43.65, -79.38],
  'America/Chicago': [41.88, -87.63],
  'America/Los_Angeles': [34.05, -118.24],
}

/** Де приблизно гравець: столиця його поясу, інакше — 50° пн. ш. і довгота за зсувом годинника. */
export function locate(date = new Date()) {
  let tz = ''
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    /* старий WebView — візьмемо зсув */
  }
  const hit = ZONES[tz]
  if (hit) return { lat: hit[0], lon: hit[1] }
  return { lat: 50, lon: -date.getTimezoneOffset() / 4 }
}

const RAD = Math.PI / 180

/** Висота сонця над обрієм, градуси (точність ~0.5°, для неба — з запасом). */
export function sunElevation(ms, lat, lon) {
  const n = (ms - 946_728_000_000) / 86_400_000 // діб від J2000
  const L = (280.46 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const eps = (23.439 - 0.0000004 * n) * RAD
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24
  const hourAngle = (gmst * 15 + lon) * RAD - ra
  const phi = lat * RAD
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle)) / RAD
}

const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k)
const clamp01 = (x) => Math.min(1, Math.max(0, x))
/** 0 при x=a … 1 при x=b (a може бути більшим за b). */
const ramp = (x, a, b) => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}

/** Колір-множник сцени за висотою сонця: день → золота година → сутінки → ніч. */
const DAY = [1, 1, 1]
const GOLDEN = [1, 0.88, 0.74]
const DUSK = [0.8, 0.6, 0.72]
const NIGHT = [0.36, 0.42, 0.7]

function sunTint(e) {
  if (e >= 12) return DAY
  if (e >= 3) return mix(GOLDEN, DAY, ramp(e, 3, 12))
  if (e >= -4) return mix(DUSK, GOLDEN, ramp(e, -4, 3))
  return mix(NIGHT, DUSK, ramp(e, -12, -4))
}

/** Як погода фарбує сцену, скільки хмар, дощу й туману. */
const LOOK = {
  clear: { tint: [1, 1, 1], clouds: 0.12, rain: 0, fog: 0 },
  cloudy: { tint: [0.9, 0.92, 0.96], clouds: 0.24, rain: 0, fog: 0 },
  fog: { tint: [0.92, 0.94, 0.97], clouds: 0.06, rain: 0, fog: 0.34 },
  rain: { tint: [0.78, 0.82, 0.9], clouds: 0.3, rain: 1, fog: 0.08 },
  storm: { tint: [0.62, 0.66, 0.78], clouds: 0.38, rain: 1.8, fog: 0.1 },
}

let here = locate()

/** Частина доби для підпису. */
function partOfDay(e, ms) {
  if (e < -6) return { id: 'night', emoji: '🌙', name: 'Ніч' }
  // Сонце над обрієм уранці чи ввечері — за тим, росте висота чи падає.
  const rising = sunElevation(ms + 600_000, here.lat, here.lon) > e
  if (e < 8) return rising ? { id: 'dawn', emoji: '🌅', name: 'Світанок' } : { id: 'dusk', emoji: '🌇', name: 'Вечір' }
  return { id: 'day', emoji: '☀️', name: 'День' }
}

/**
 * Небо на мить ms.
 * override (для перевірок): { hour?: number — година місцевого часу, weather?: id погоди }.
 * @returns {{ tint: number[], night: number, clouds: number, rain: number, fog: number, storm: boolean,
 *   weather: object, part: object, elevation: number }}
 */
export function skyAt(ms, override = null) {
  let at = ms
  if (override?.hour != null) {
    const d = new Date(ms)
    d.setHours(Math.floor(override.hour), Math.round((override.hour % 1) * 60), 0, 0)
    at = d.getTime()
  }
  const e = sunElevation(at, here.lat, here.lon)
  const kind = override?.weather && WEATHER[override.weather] ? override.weather : weatherAt(ms).kind
  const look = LOOK[kind]
  const night = ramp(e, 2, -10)
  // Уночі погода менше фарбує (і так темно), а тіні від хмар не видно.
  const tint = sunTint(e).map((v, i) => v * (1 - (1 - look.tint[i]) * (1 - night * 0.5)))
  return {
    tint,
    night,
    clouds: look.clouds * (1 - night * 0.75),
    rain: look.rain,
    fog: look.fog,
    storm: kind === 'storm',
    weather: WEATHER[kind],
    part: partOfDay(e, at),
    elevation: e,
  }
}

/** Перевизначити місце (тести). */
export function setLocation(loc) {
  here = loc ?? locate()
}

/**
 * Перевірка неба без очікування: ?sky=21:30 та/або ?weather=storm в адресі.
 * Telegram передає параметри у start_param, тож це — для браузера/дев-режиму.
 */
export function skyOverrideFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search)
    const t = q.get('sky')
    const w = q.get('weather')
    if (!t && !w) return null
    const [h, m = 0] = (t ?? '').split(':').map(Number)
    return { hour: t && Number.isFinite(h) ? h + m / 60 : undefined, weather: w || undefined }
  } catch {
    return null
  }
}
