import { getFishMeta } from "../bot.js";

/**
 * Рибальська хата — налаштування (без залежностей від решти гри, щоб decor.js міг їх брати
 * без кругових імпортів). Сама риболовля — у fishhut.js.
 *
 * Рівні — більша комора й швидший мотор. Покращення коштує ресурсів (зокрема електромоторів
 * з електроверстата). energy — Вт·год з акумуляторів мережі за одну рибу.
 *
 * port — віконце-жолоб праворуч на помості хати (px від якоря — низ по центру): сюди під'єднається
 * конвеєр. Він братиме рибу тим самим takeFish (fishhut.js), що й гравець, коли збирає улов.
 */
export const FISH_HUT = {
  kind: "fish_hut",
  energy: 1,
  levels: [
    { cap: 10, everyMs: 6 * 60_000 },
    { cap: 25, everyMs: 5 * 60_000, cost: { plank: 10, iron_ingot: 3, insulated_wire: 2, motor: 1 } },
    { cap: 50, everyMs: 4 * 60_000, cost: { plank: 16, iron_ingot: 6, glass: 2, insulated_wire: 4, motor: 2 } },
  ],
  port: { side: "right", dx: 28, dy: -8 },
};

export const HUT_MAX_LEVEL = FISH_HUT.levels.length;

/** Рівень хати (1…HUT_MAX_LEVEL). */
export const hutLevel = (item) => Math.max(1, Math.min(HUT_MAX_LEVEL, Number(item?.lv) || 1));
/** Скільки риби лежить у хаті. */
export const hutCount = (item) => Object.values(item?.f ?? {}).reduce((s, n) => s + (Number(n) || 0), 0);
/** Скільки риби вміщає хата на своєму рівні. */
export const hutCap = (item) => FISH_HUT.levels[hutLevel(item) - 1].cap;

/** Що повернути, коли хату розбирають: покращення (база — cost у DECOR) і риба, що лежала всередині. */
export function hutRefund(item) {
  /** @type {Record<string, number>} */
  const out = {};
  for (let l = 1; l < hutLevel(item); l++)
    for (const [id, n] of Object.entries(FISH_HUT.levels[l].cost)) out[id] = (out[id] ?? 0) + n;
  for (const [id, n] of Object.entries(item?.f ?? {})) if (getFishMeta(id) && n > 0) out[id] = (out[id] ?? 0) + n;
  return out;
}
