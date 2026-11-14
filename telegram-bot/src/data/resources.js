/** Ресурси в інвентарі (рибалка, готування, алхімія). */

/** @typedef {{ id: string, emoji: string, name: string }} ResourceType */

/** @type {ResourceType[]} */
export const RESOURCE_TYPES = [
  { id: "ice_block", emoji: "🧊", name: "Брила льоду" },
  { id: "log", emoji: "🪵", name: "Колода" },
  { id: "plank", emoji: "🪵", name: "Дошка" },
  { id: "twig", emoji: "🪵", name: "Гілочка" },
  { id: "stone", emoji: "🪨", name: "Камінь" },
  { id: "shell", emoji: "🐚", name: "Мушля" },
  { id: "fish_eye", emoji: "👁", name: "Риб'яче око" },
  { id: "seaweed", emoji: "🌿", name: "Водорості" },
  { id: "old_coin", emoji: "🪙", name: "Стара монета" },
  { id: "glass_shard", emoji: "🔷", name: "Уламок скла" },
  { id: "metal_scrap", emoji: "⚙️", name: "Металевий брухт" },
  { id: "fish_bone", emoji: "🦴", name: "Риб'яча кістка" },
  { id: "silver_piece", emoji: "🤍", name: "Кусочок срібла" },
  { id: "copper_ingot", emoji: "🟧", name: "Мідний злиточок" },
  { id: "bare_wire", emoji: "➰", name: "Голий дріт" },
  { id: "tree_seed", emoji: "🌰", name: "Насінина дерева" },
  { id: "rubber_seed", emoji: "🫘", name: "Насінина гевеї" },
  { id: "rubber", emoji: "🟤", name: "Каучук" },
];

/**
 * Що може «висмоктати» вудка замість риби (простий дроп) і як часто — вага.
 * Мідний злиточок (з нього на верстаті Mini App тягнуть дріт), насінина дерева й гевеї — рідше.
 */
export const FISHING_RESOURCE_WEIGHTS = { twig: 4, stone: 4, shell: 4, tree_seed: 2, copper_ingot: 2, rubber_seed: 1 };
export const FISHING_SURFACE_RESOURCE_IDS = Object.keys(FISHING_RESOURCE_WEIGHTS);

const BY_ID = new Map(RESOURCE_TYPES.map((r) => [r.id, r]));

export function getResourceMeta(resourceId) {
  return BY_ID.get(resourceId);
}

export function isResourceId(id) {
  return BY_ID.has(id);
}

export function pickRandomFishingResource() {
  const entries = Object.entries(FISHING_RESOURCE_WEIGHTS);
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of entries) if ((r -= w) < 0) return BY_ID.get(id);
  return BY_ID.get(entries.at(-1)[0]);
}
