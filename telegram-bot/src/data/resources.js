/** Ресурси в інвентарі (рибалка, готування, алхімія). */

/** @typedef {{ id: string, emoji: string, name: string }} ResourceType */

/** @type {ResourceType[]} */
export const RESOURCE_TYPES = [
  { id: "twig", emoji: "🪵", name: "Гілочка" },
  { id: "stone", emoji: "🪨", name: "Камінь" },
  { id: "shell", emoji: "🐚", name: "Мушля" },
  { id: "fish_eye", emoji: "👁", name: "Риб'яче око" },
  { id: "seaweed", emoji: "🌿", name: "Водорості" },
  { id: "old_coin", emoji: "🪙", name: "Стара монета" },
  { id: "glass_shard", emoji: "🔷", name: "Уламок скла" },
  { id: "metal_scrap", emoji: "⚙️", name: "Металевий брухт" },
  { id: "fish_bone", emoji: "🦴", name: "Риб'яча кістка" },
];

/** Що може «висмоктати» вудка замість риби (простий дроп) */
export const FISHING_SURFACE_RESOURCE_IDS = ["twig", "stone", "shell"];

const BY_ID = new Map(RESOURCE_TYPES.map((r) => [r.id, r]));

export function getResourceMeta(resourceId) {
  return BY_ID.get(resourceId);
}

export function isResourceId(id) {
  return BY_ID.has(id);
}

export function pickRandomFishingResource() {
  const pool = RESOURCE_TYPES.filter((r) =>
    FISHING_SURFACE_RESOURCE_IDS.includes(r.id)
  );
  const i = Math.floor(Math.random() * pool.length);
  return pool[i];
}
