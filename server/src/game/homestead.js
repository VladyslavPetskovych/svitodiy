import { addBalance, addResourceToInventory, consumeResources, getBalance, getInventory, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeKey, takeCooldown } from "./keys.js";

/**
 * Рідний острів: будівлі, що дають ресурси з часом.
 * Лише Mini App — у боті такого розділу немає, але ресурси й ✨ спільні.
 *
 * levels[n] — будівля на рівні n: cost — ціна, щоб до нього дійти,
 * produces — скільки за годину дає (✨ або ресурси). levels[0] — ще не збудовано.
 */
export const BUILDINGS = [
  {
    id: "house",
    name: "Хатинка",
    emoji: "🏠",
    description: "Серце острова. Чим затишніша хатинка, тим довше комора тримає врожай.",
    startLevel: 1,
    levels: [
      null,
      { storageHours: 8 },
      { storageHours: 14, cost: { balance: 30, plank: 4, stone: 4 } },
      { storageHours: 24, cost: { balance: 90, plank: 8, stone: 6, glass_shard: 2 } },
    ],
  },
  {
    id: "pier",
    name: "Причал",
    emoji: "⚓",
    description: "Сітки біля причалу ловлять водорості й мушлі, поки тебе немає.",
    startLevel: 1,
    levels: [
      null,
      { produces: { seaweed: 0.5 } },
      { produces: { seaweed: 1, shell: 0.5 }, cost: { balance: 25, plank: 6, twig: 4 } },
      { produces: { seaweed: 1.5, shell: 1 }, cost: { balance: 70, plank: 10, metal_scrap: 3 } },
    ],
  },
  {
    id: "garden",
    name: "Город",
    emoji: "🥕",
    description: "Грядки, живопліт і старі пеньки: гілочки й інколи колода.",
    startLevel: 0,
    levels: [
      null,
      { produces: { twig: 1 }, cost: { balance: 15, twig: 5, stone: 2 } },
      { produces: { twig: 1.5, log: 0.25 }, cost: { balance: 40, plank: 4, seaweed: 4 } },
      { produces: { twig: 2, log: 0.5 }, cost: { balance: 100, plank: 8, fish_bone: 4 } },
    ],
  },
  {
    id: "workshop",
    name: "Майстерня",
    emoji: "🛠",
    description: "Хатинка на палях. Розбирає прибитий хвилями мотлох на метал і скло.",
    startLevel: 0,
    levels: [
      null,
      { produces: { metal_scrap: 0.25 }, cost: { balance: 40, log: 4, stone: 6 } },
      { produces: { metal_scrap: 0.5, glass_shard: 0.25 }, cost: { balance: 90, plank: 8, ice_block: 3 } },
      { produces: { metal_scrap: 0.75, glass_shard: 0.5, old_coin: 0.1 }, cost: { balance: 180, plank: 12, silver_piece: 1 } },
    ],
  },
  {
    id: "lighthouse",
    name: "Маяк",
    emoji: "🗼",
    description: "Кораблі, що йдуть на світло, платять за прохід ✨.",
    startLevel: 0,
    levels: [
      null,
      { produces: { balance: 1 }, cost: { balance: 60, stone: 10, glass_shard: 3 } },
      { produces: { balance: 2 }, cost: { balance: 140, stone: 14, metal_scrap: 4, ice_block: 4 } },
      { produces: { balance: 4 }, cost: { balance: 280, glass_shard: 6, silver_piece: 2 } },
    ],
  },
];

const BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));
const HOUR = 3_600_000;

/** Скільки годин тримає комора — залежить від рівня хатинки. */
export function storageHours(levels) {
  return BY_ID.get("house").levels[levels.house]?.storageHours ?? 8;
}

/** Що накопичилось за elapsedMs (дробові числа; комора обмежує час). */
export function accrued(levels, elapsedMs) {
  const hours = Math.max(0, Math.min(elapsedMs, storageHours(levels) * HOUR)) / HOUR;
  /** @type {Record<string, number>} */
  const out = {};
  for (const b of BUILDINGS) {
    const produces = b.levels[levels[b.id]]?.produces ?? {};
    for (const [id, perHour] of Object.entries(produces)) out[id] = (out[id] ?? 0) + perHour * hours;
  }
  return out;
}

/** Стан острова з Redis. Перше відкриття — старт відліку комори. */
export async function getHome(userId) {
  const r = getRedis();
  const key = homeKey(userId);
  let h = await r.hGetAll(key);
  if (!h.collectedAt) {
    await r.hSetNX(key, "collectedAt", String(Date.now()));
    h = await r.hGetAll(key);
  }
  const levels = Object.fromEntries(BUILDINGS.map((b) => [b.id, Number(h[`lvl:${b.id}`] ?? b.startLevel)]));
  let carry = {};
  try {
    carry = JSON.parse(h.carry ?? "{}");
  } catch {
    /* зіпсований carry — просто почнемо з нуля */
  }
  return { levels, collectedAt: Number(h.collectedAt), carry };
}

/**
 * Забрати врожай у рюкзак: цілі одиниці йдуть гравцю, дробові залишки (carry)
 * чекають наступного разу — інакше повільні будівлі ніколи б нічого не дали.
 */
async function harvest(userId, home) {
  const now = Date.now();
  const total = accrued(home.levels, now - home.collectedAt);
  for (const [id, v] of Object.entries(home.carry)) total[id] = (total[id] ?? 0) + v;

  /** @type {Record<string, number>} */
  const got = {};
  const carry = {};
  for (const [id, v] of Object.entries(total)) {
    const whole = Math.floor(v + 1e-9);
    if (whole > 0) got[id] = whole;
    if (v - whole > 1e-6) carry[id] = Number((v - whole).toFixed(4));
  }

  for (const [id, n] of Object.entries(got)) {
    if (id === "balance") await addBalance(userId, n);
    else await addResourceToInventory(userId, id, n);
  }
  await getRedis().hSet(homeKey(userId), { collectedAt: String(now), carry: JSON.stringify(carry) });
  return got;
}

/** Одна дія з островом за раз — два швидкі тапи не заберуть врожай двічі. */
async function lock(userId) {
  if (!(await takeCooldown(userId, "home", 800))) {
    throw new GameError(429, "cooldown", "Секунду — острів ще рахує врожай.");
  }
}

export async function collectHome(userId) {
  await lock(userId);
  const got = await harvest(userId, await getHome(userId));
  if (Object.keys(got).length === 0) throw conflict("empty", "Комора поки порожня — зазирни трохи згодом.");
  return { got };
}

export async function upgradeBuilding(userId, buildingId) {
  const b = typeof buildingId === "string" ? BY_ID.get(buildingId) : null;
  if (!b) throw badRequest("Невідома будівля.");
  await lock(userId);

  const home = await getHome(userId);
  const next = b.levels[home.levels[b.id] + 1];
  if (!next) throw conflict("max", "Це вже найвищий рівень.");

  const { balance: price = 0, ...resources } = next.cost ?? {};
  if ((await getBalance(userId)) < price) throw conflict("not_enough", `Потрібно ${price} ✨.`);
  const inv = await getInventory(userId);
  if (Object.entries(resources).some(([id, n]) => (inv[id] ?? 0) < n)) {
    throw conflict("not_enough", "Не вистачає матеріалів.");
  }

  // Спершу врожай за старими ставками, потім будуємо — нова ставка діє лише відтепер.
  const got = await harvest(userId, home);
  if (!(await consumeResources(userId, resources))) throw conflict("not_enough", "Не вистачає матеріалів.");
  if (price > 0) await addBalance(userId, -price);
  const level = home.levels[b.id] + 1;
  await getRedis().hSet(homeKey(userId), `lvl:${b.id}`, String(level));
  return { building: b.id, level, got };
}
