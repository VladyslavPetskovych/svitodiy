import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {{
 *   id: string,
 *   emoji: string,
 *   name: string,
 *   artFile: string,
 *   fishingDrop?: boolean,
 * }} RelicType
 * fishingDrop: false — не випадає з рибалки (лише алхімія). За замовчуванням true.
 */

/** @type {RelicType[]} */
export const RELICS = [
  {
    id: "relic_ring_wanderer",
    emoji: "💍",
    name: "Кільце мандрівника",
    artFile: "relic-wanderer-ring.png",
    fishingDrop: true,
  },
  {
    id: "relic_hook_silver",
    emoji: "🪝",
    name: "Срібний гачок",
    artFile: "",
    fishingDrop: false,
  },
  {
    id: "relic_hook_gold",
    emoji: "🔱",
    name: "Золотий гачок",
    artFile: "",
    fishingDrop: false,
  },
  {
    id: "relic_pearl_talisman",
    emoji: "🦪",
    name: "Перламутровий талісман",
    artFile: "",
    fishingDrop: true,
  },
  {
    id: "relic_angler_charm",
    emoji: "🧿",
    name: "Амулет рибалки",
    artFile: "",
    fishingDrop: true,
  },
];

const BY_ID = new Map(RELICS.map((x) => [x.id, x]));

export function getRelicMeta(relicId) {
  return BY_ID.get(relicId);
}

export function pickRandomFishingRelic() {
  const pool = RELICS.filter((r) => r.fishingDrop !== false);
  if (pool.length === 0) {
    return RELICS[Math.floor(Math.random() * RELICS.length)];
  }
  const i = Math.floor(Math.random() * pool.length);
  return pool[i];
}

export function resolveRelicArtPath(relicId) {
  const r = getRelicMeta(relicId);
  if (!r || !r.artFile) return null;
  const p = path.join(__dirname, "../../assets", r.artFile);
  if (fs.existsSync(p)) return p;
  return null;
}
