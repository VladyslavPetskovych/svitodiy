import { DECOR } from "./decor.js";

/**
 * Електрика рідного острова (лише Mini App).
 * Генератори — декор із полем watts (вітряк — 40 Вт); скільки дає острів — сума всіх, що стоять.
 * Споживачів поки немає: use — на майбутнє (лампи, станки), щоб клієнт уже показував баланс.
 */
const WATTS = new Map(DECOR.filter((d) => d.watts > 0).map((d) => [d.id, d.watts]));

/**
 * @param {{ k: string }[]} deco
 * @returns {{ gen: number, use: number, sources: number }}
 */
export function powerOf(deco) {
  let gen = 0;
  let sources = 0;
  for (const d of deco) {
    const w = WATTS.get(d.k);
    if (!w) continue;
    gen += w;
    sources++;
  }
  return { gen, use: 0, sources };
}
