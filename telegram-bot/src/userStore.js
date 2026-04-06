import { getFishSellPrice } from "./data/fishTypes.js";
import { getRedis } from "./redisClient.js";

const PREFIX = "svitodiy";
const PANEL_TTL_SEC = 7 * 24 * 3600;

function userKey(telegramUserId) {
  return `${PREFIX}:user:${telegramUserId}`;
}

function panelKey(chatId, messageId) {
  return `${PREFIX}:panel:${chatId}:${messageId}`;
}

function inventoryKey(telegramUserId) {
  return `${PREFIX}:inv:${telegramUserId}`;
}

/**
 * Додає рибу в інвентар. Повертає нову кількість цієї позиції.
 * @param {string} fishId — id з fishing.js (trout, carp, …)
 */
export async function addFishToInventory(telegramUserId, fishId, amount = 1) {
  return getRedis().hIncrBy(inventoryKey(telegramUserId), fishId, amount);
}

/** Ресурси (гілка, камінь, мушля…) — той самий hash інвентаря. */
export async function addResourceToInventory(telegramUserId, resourceId, amount = 1) {
  return getRedis().hIncrBy(inventoryKey(telegramUserId), resourceId, amount);
}

/** Реліквія — ключ у hash = id реліквії (наприклад relic_ring_wanderer). */
export async function addRelicToInventory(telegramUserId, relicId, amount = 1) {
  return getRedis().hIncrBy(inventoryKey(telegramUserId), relicId, amount);
}

/**
 * Списати ресурси (алхімія). Повертає false, якщо чогось не вистачає.
 * @param {Record<string, number>} costs
 */
export async function consumeResources(telegramUserId, costs) {
  const invKey = inventoryKey(telegramUserId);
  const inv = await getInventory(telegramUserId);
  for (const [id, need] of Object.entries(costs)) {
    if ((inv[id] ?? 0) < need) return false;
  }
  const r = getRedis();
  for (const [id, need] of Object.entries(costs)) {
    const left = await r.hIncrBy(invKey, id, -need);
    if (left <= 0) await r.hDel(invKey, id);
  }
  return true;
}

/**
 * Забрати рибу з інвентаря (наприклад після «Приготувати»).
 * @returns {Promise<boolean>}
 */
export async function removeFishFromInventory(telegramUserId, fishId, count = 1) {
  if (count < 1) return false;
  const invKey = inventoryKey(telegramUserId);
  const r = getRedis();
  const have = Number((await r.hGet(invKey, fishId)) ?? 0);
  if (have < count) return false;
  const left = await r.hIncrBy(invKey, fishId, -count);
  if (left <= 0) await r.hDel(invKey, fishId);
  return true;
}

/** @returns {Promise<Record<string, number>>} */
export async function getInventory(telegramUserId) {
  const h = await getRedis().hGetAll(inventoryKey(telegramUserId));
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = Number(v);
  }
  return out;
}

export async function getBalance(telegramUserId) {
  const raw = await getRedis().hGet(userKey(telegramUserId), "balance");
  return Math.max(0, Number(raw ?? 0));
}

export async function addBalance(telegramUserId, delta) {
  const n = await getRedis().hIncrBy(userKey(telegramUserId), "balance", delta);
  return Math.max(0, n);
}

/**
 * Продати рибу (кількість штук). Повертає баланс після угоди або null, якщо не вдалося.
 */
export async function sellFishUnits(telegramUserId, fishId, count) {
  if (count < 1) return null;
  const invKey = inventoryKey(telegramUserId);
  const r = getRedis();
  const have = Number((await r.hGet(invKey, fishId)) ?? 0);
  if (have < count) return null;

  const unit = getFishSellPrice(fishId);
  const earned = unit * count;

  const left = await r.hIncrBy(invKey, fishId, -count);
  if (left <= 0) {
    await r.hDel(invKey, fishId);
  }
  await addBalance(telegramUserId, earned);
  return { earned, balance: await getBalance(telegramUserId), sold: count };
}

/**
 * Хто відкрив цю панель (повідомлення з кнопкою). Інший user_id не зможе використати кнопку.
 */
export async function setPanelOwner(chatId, messageId, telegramUserId) {
  await getRedis().setEx(
    panelKey(chatId, messageId),
    PANEL_TTL_SEC,
    String(telegramUserId)
  );
}

/** @returns {number | null} */
export async function getPanelOwner(chatId, messageId) {
  const raw = await getRedis().get(panelKey(chatId, messageId));
  if (raw == null) return null;
  return Number(raw);
}

/**
 * Після закиду: kind = fish | resource | miss
 */
export async function recordFishingCast(telegramUserId, kind) {
  const key = userKey(telegramUserId);
  const r = getRedis();
  const p = r.multi();
  p.hIncrBy(key, "casts", 1);
  if (kind === "fish") p.hIncrBy(key, "catches", 1);
  else if (kind === "miss") p.hIncrBy(key, "misses", 1);
  else if (kind === "resource") p.hIncrBy(key, "resourceFinds", 1);
  else if (kind === "relic") p.hIncrBy(key, "relicFinds", 1);
  p.hSet(key, "updatedAt", new Date().toISOString());
  await p.exec();
}

/**
 * Перший візит (наприклад /start) — окремо від рибалки.
 */
export async function touchUser(telegramUserId) {
  const key = userKey(telegramUserId);
  await getRedis().hSetNX(key, "firstSeenAt", new Date().toISOString());
}

const FIELD_EQUIPPED_HOOK = "equippedHook";
const FIELD_EQUIPPED_TALISMAN = "equippedTalisman";

/** Активний гачок для рибалки: id реліквії або null. */
export async function getEquippedHook(telegramUserId) {
  const v = await getRedis().hGet(userKey(telegramUserId), FIELD_EQUIPPED_HOOK);
  if (v == null || v === "") return null;
  return String(v);
}

/** @param {string | null} relicId — relic_hook_silver / relic_hook_gold або null (зняти) */
export async function setEquippedHook(telegramUserId, relicId) {
  const key = userKey(telegramUserId);
  if (relicId == null || relicId === "") {
    await getRedis().hDel(key, FIELD_EQUIPPED_HOOK);
  } else {
    await getRedis().hSet(key, FIELD_EQUIPPED_HOOK, relicId);
  }
}

/** Талісман (перламутр / амулет) — окремо від гачка. */
export async function getEquippedTalisman(telegramUserId) {
  const v = await getRedis().hGet(userKey(telegramUserId), FIELD_EQUIPPED_TALISMAN);
  if (v == null || v === "") return null;
  return String(v);
}

/** @param {string | null} relicId — relic_pearl_talisman / relic_angler_charm або null */
export async function setEquippedTalisman(telegramUserId, relicId) {
  const key = userKey(telegramUserId);
  if (relicId == null || relicId === "") {
    await getRedis().hDel(key, FIELD_EQUIPPED_TALISMAN);
  } else {
    await getRedis().hSet(key, FIELD_EQUIPPED_TALISMAN, relicId);
  }
}


/**
 * @returns {Promise<{ casts: number, catches: number, misses: number }>}
 */
export async function getUserStats(telegramUserId) {
  const h = await getRedis().hGetAll(userKey(telegramUserId));
  return {
    casts: Number(h.casts ?? 0),
    catches: Number(h.catches ?? 0),
    misses: Number(h.misses ?? 0),
    resourceFinds: Number(h.resourceFinds ?? 0),
    relicFinds: Number(h.relicFinds ?? 0),
  };
}

export function formatStatsLine(stats) {
  return (
    `📊 Закидів: ${stats.casts} · 🐟 риба: ${stats.catches} · 📦 ресурси: ${stats.resourceFinds} · 🏺 реліквії: ${stats.relicFinds} · порожньо: ${stats.misses}`
  );
}
