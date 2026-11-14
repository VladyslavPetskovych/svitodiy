import { weatherAt } from "./weather.js";

/**
 * Сонце для сонячних панелей: скільки Вт дає панель залежить від висоти сонця над Києвом
 * і погоди світу (weather.js). Усе рахується з часу, без збереження, тож сервер і Mini App
 * (miniapp/src/game/solar.js — ТОЧНА КОПІЯ, міняти разом!) бачать ту саму потужність.
 *
 * Київ, а не місце гравця: на спільному острові мешканці можуть жити в різних поясах,
 * а енергія острова має бути одна. Вночі панель не дає нічого — для цього й акумулятор.
 */
export const SOLAR = { lat: 50.45, lon: 30.52, fullAt: 40, stepMs: 60_000 };

/** Скільки світла пропускає погода (ясно — усе, гроза — майже нічого). */
const SKY = { clear: 1, cloudy: 0.5, fog: 0.4, rain: 0.25, storm: 0.1 };

const RAD = Math.PI / 180;

/** Висота сонця над обрієм, градуси (та сама формула, що й небо в miniapp/src/game/walk/sky.js). */
export function sunElevation(ms, lat, lon) {
  const n = (ms - 946_728_000_000) / 86_400_000;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const hourAngle = (gmst * 15 + lon) * RAD - ra;
  const phi = lat * RAD;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle)) / RAD;
}

/** Частка повної потужності 0…1 у мить now: сонце нижче обрію — 0, вище fullAt° — уся (крім хмар). */
export function solarFactor(now) {
  const e = sunElevation(now, SOLAR.lat, SOLAR.lon);
  if (e <= 0) return 0;
  const sun = Math.min(1, Math.sin(e * RAD) / Math.sin(SOLAR.fullAt * RAD));
  return sun * (SKY[weatherAt(now).kind] ?? 1);
}

/** Скільки Вт дає панель потужністю max у мить now (ціле, як вітряк). */
export const solarWatts = (max, now) => Math.round(max * solarFactor(now));

/** Скільки Вт·год дала панель за [from, to) мс — сума по хвилинах (сонце й погода міняються повільно). */
export function solarEnergy(max, from, to) {
  if (to <= from) return 0;
  const P = SOLAR.stepMs;
  let wh = 0;
  for (let k = Math.floor(from / P); k * P < to; k++) {
    const a = Math.max(from, k * P);
    const b = Math.min(to, (k + 1) * P);
    wh += (solarWatts(max, k * P) * (b - a)) / 3_600_000;
  }
  return wh;
}
