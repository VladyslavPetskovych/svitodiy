import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @typedef {{ id: string, emoji: string, name: string, artFile: string }} RelicType */

/** @type {RelicType[]} */
export const RELICS = [
  {
    id: "relic_ring_wanderer",
    emoji: "💍",
    name: "Кільце мандрівника",
    artFile: "relic-wanderer-ring.png",
  },
];

const BY_ID = new Map(RELICS.map((x) => [x.id, x]));

export function getRelicMeta(relicId) {
  return BY_ID.get(relicId);
}

/** Для рибалки: поки одна реліквія; пізніше можна додати ваги */
export function pickRandomFishingRelic() {
  const i = Math.floor(Math.random() * RELICS.length);
  return RELICS[i];
}

export function resolveRelicArtPath(relicId) {
  const r = getRelicMeta(relicId);
  if (!r) return null;
  const p = path.join(__dirname, "../../assets", r.artFile);
  if (fs.existsSync(p)) return p;
  return null;
}
