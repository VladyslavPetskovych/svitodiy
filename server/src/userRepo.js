import { createClient } from "redis";

/**
 * Ті самі ключі, що й у telegram-bot/src/userStore.js:
 *   svitodiy:user:<telegramUserId> — hash профілю, балансу й статистики
 *   svitodiy:inv:<telegramUserId>  — hash інвентаря { itemId: кількість }
 */
const PREFIX = "svitodiy";
const userKey = (id) => `${PREFIX}:user:${id}`;
const inventoryKey = (id) => `${PREFIX}:inv:${id}`;

/** @type {import("redis").RedisClientType | null} */
let client = null;

export async function connectRedis() {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  client = createClient({ url });
  client.on("error", (err) => console.error("[redis]", err.message));
  await client.connect();
  console.log("[redis] connected", url.replace(/:[^:@/]+@/, ":****@"));
}

/**
 * Оновлює профіль з перевіреного initData (ім'я/username/фото могли змінитись).
 * @param {{ id: number, first_name?: string, last_name?: string, username?: string,
 *   language_code?: string, is_premium?: boolean, photo_url?: string }} tgUser
 */
export async function upsertProfile(tgUser) {
  const key = userKey(tgUser.id);
  const now = new Date().toISOString();
  const fields = {
    firstName: tgUser.first_name,
    lastName: tgUser.last_name,
    username: tgUser.username,
    languageCode: tgUser.language_code,
    photoUrl: tgUser.photo_url,
    isPremium: tgUser.is_premium ? "1" : "0",
    lastSeenAt: now,
  };
  const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null));

  await client
    .multi()
    .hSetNX(key, "firstSeenAt", now)
    .hSet(key, defined)
    .exec();
}

/** Усе, що показує mini app про користувача. */
export async function getUserSnapshot(telegramUserId) {
  const [h, inv] = await Promise.all([
    client.hGetAll(userKey(telegramUserId)),
    client.hGetAll(inventoryKey(telegramUserId)),
  ]);

  const inventory = {};
  for (const [k, v] of Object.entries(inv)) {
    const n = Number(v);
    if (n > 0) inventory[k] = n;
  }

  return {
    user: {
      id: telegramUserId,
      firstName: h.firstName ?? "",
      lastName: h.lastName ?? "",
      username: h.username ?? "",
      photoUrl: h.photoUrl ?? "",
      languageCode: h.languageCode ?? "",
      isPremium: h.isPremium === "1",
      firstSeenAt: h.firstSeenAt ?? null,
      lastSeenAt: h.lastSeenAt ?? null,
    },
    balance: Math.max(0, Number(h.balance ?? 0)),
    stats: {
      casts: Number(h.casts ?? 0),
      catches: Number(h.catches ?? 0),
      misses: Number(h.misses ?? 0),
      resourceFinds: Number(h.resourceFinds ?? 0),
      relicFinds: Number(h.relicFinds ?? 0),
    },
    equipped: {
      hook: h.equippedHook || null,
      talisman: h.equippedTalisman || null,
    },
    inventory,
  };
}
