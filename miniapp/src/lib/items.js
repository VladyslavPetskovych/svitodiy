/**
 * Назви предметів інвентаря. Джерело — telegram-bot/src/data (fishTypes, resources, relics);
 * при додаванні нового предмета в бота додай його і сюди.
 */
const FISH = {
  trout: ['🐟', 'Форель струмкова'],
  carp: ['🐠', 'Короп-втікач'],
  perch: ['🐡', 'Окунь з характером'],
  pike: ['🦈', 'Щука «Суддя»'],
  golden_crucian: ['✨', 'Золотий карась (легендарний)'],
  river_bream: ['🐟', 'Лящ сріблястий'],
  whisker_cat: ['🐡', 'Сомик-вусань'],
  moon_carp: ['🌙', 'Місячний короп'],
}

const RESOURCES = {
  ice_block: ['🧊', 'Брила льоду'],
  log: ['🪵', 'Колода'],
  plank: ['🪵', 'Дошка'],
  twig: ['🪵', 'Гілочка'],
  stone: ['🪨', 'Камінь'],
  shell: ['🐚', 'Мушля'],
  fish_eye: ['👁', "Риб'яче око"],
  seaweed: ['🌿', 'Водорості'],
  old_coin: ['🪙', 'Стара монета'],
  glass_shard: ['🔷', 'Уламок скла'],
  metal_scrap: ['⚙️', 'Металевий брухт'],
  fish_bone: ['🦴', "Риб'яча кістка"],
  silver_piece: ['🤍', 'Кусочок срібла'],
}

const RELICS = {
  relic_ring_wanderer: ['💍', 'Кільце мандрівника'],
  relic_hook_silver: ['🪝', 'Срібний гачок'],
  relic_hook_gold: ['🔱', 'Золотий гачок'],
  relic_pearl_talisman: ['🦪', 'Перламутровий талісман'],
  relic_angler_charm: ['🧿', 'Амулет рибалки'],
}

export const INVENTORY_GROUPS = [
  { title: 'Риба', items: FISH },
  { title: 'Ресурси', items: RESOURCES },
  { title: 'Реліквії', items: RELICS },
]

const ALL = { ...FISH, ...RESOURCES, ...RELICS }

/** @returns {{ emoji: string, name: string }} */
export function itemMeta(id) {
  const [emoji, name] = ALL[id] ?? ['📦', id]
  return { emoji, name }
}
