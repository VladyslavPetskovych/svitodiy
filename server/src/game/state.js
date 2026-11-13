import {
  ARC_CATALOG,
  dumosvitIsScheduled,
  getArcState,
  getDumosvitGoal,
  getDumosvitIntensity,
  getInventory,
  getRedis,
  getUserPhone,
  hasAdminAccess,
  hasNastiaAccess,
} from "../bot.js";
import { GAME_CONFIG } from "./catalog.js";
import { getDecor } from "./decor.js";
import { getDogs } from "./dogs.js";
import { getFarm } from "./farm.js";
import { getFloor, getInterior } from "./interior.js";
import { grantAdminResources } from "./admin.js";
import { getHome } from "./homestead.js";
import { getTools } from "./craft.js";
import { getWear } from "./wardrobe.js";
import { ensureIsland, takenBoxes } from "./island.js";
import { getNodes } from "./nodes.js";
import { islandSnapshot } from "./presence.js";
import { dailyClaimKey, jobKey, kyivDay, previousDay, quizRewardKey, userKey } from "./keys.js";

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
  await getRedis().multi().hSetNX(key, "firstSeenAt", now).hSet(key, defined).exec();
}

/** Ім'я для підпису на дошці — як authorNameOf у nastia/board.js. */
export function displayName(tgUser) {
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ").trim();
  return name || (tgUser.username ? `@${tgUser.username}` : `id${tgUser.id}`);
}

/**
 * Стан щоденної нагороди.
 * streak — скільки днів поспіль уже забрано (включно з сьогодні, якщо claimedToday).
 * todayIndex — яка клітинка 7-денного календаря зараз (0…6).
 */
export async function getDailyState(userId, userHash) {
  const today = kyivDay();
  const claimedToday = (await getRedis().exists(dailyClaimKey(userId, today))) === 1;
  const last = userHash.dailyLastDay ?? "";
  const stored = Number(userHash.dailyStreak ?? 0);
  const alive = last === today || last === previousDay(today);
  const streak = alive ? stored : 0;
  const rewards = GAME_CONFIG.dailyRewards;
  const todayIndex = claimedToday ? (streak - 1) % rewards.length : streak % rewards.length;
  return { claimedToday, streak, todayIndex, reward: rewards[todayIndex] };
}

async function getJob(userId) {
  const raw = await getRedis().get(jobKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Усе про гравця одним запитом — після кожної дії клієнт просто замінює стан. */
export async function getState(userId) {
  // Версію спільного острова фіксуємо ДО читання: зміна посеред читання не загубиться (presence.js).
  const island = await islandSnapshot(userId);
  await grantAdminResources(userId);
  await ensureIsland(userId);
  const r = getRedis();
  const [h, inventory, job, access, arcs, intensity, reminders, quizCount, home, deco, goal, farm, dogs, interior, floor] = await Promise.all([
    r.hGetAll(userKey(userId)),
    getInventory(userId),
    getJob(userId),
    Promise.all([hasNastiaAccess(userId), hasAdminAccess(userId), getUserPhone(userId)]),
    Promise.all(ARC_CATALOG.map(async (a) => [a.id, await getArcState(userId, a.id)])),
    getDumosvitIntensity(userId),
    dumosvitIsScheduled(userId),
    r.get(quizRewardKey(userId, kyivDay())),
    getHome(userId),
    getDecor(userId),
    getDumosvitGoal(userId),
    getFarm(userId),
    getDogs(userId),
    getInterior(userId),
    getFloor(userId),
  ]);
  // Ресурси — після всього іншого: нові не виростуть у будівлях, декорі й на грядках.
  const [nodes, tools, wear] = await Promise.all([getNodes(userId, takenBoxes(home, deco, farm)), getTools(userId), getWear(userId)]);

  for (const k of Object.keys(inventory)) {
    if (inventory[k] <= 0) delete inventory[k];
  }

  const state = {
    user: {
      id: userId,
      firstName: h.firstName ?? "",
      lastName: h.lastName ?? "",
      username: h.username ?? "",
      photoUrl: h.photoUrl ?? "",
      isPremium: h.isPremium === "1",
      firstSeenAt: h.firstSeenAt ?? null,
    },
    balance: Math.max(0, Number(h.balance ?? 0)),
    stats: {
      casts: Number(h.casts ?? 0),
      catches: Number(h.catches ?? 0),
      misses: Number(h.misses ?? 0),
      resourceFinds: Number(h.resourceFinds ?? 0),
      relicFinds: Number(h.relicFinds ?? 0),
    },
    equipped: { hook: h.equippedHook || null, talisman: h.equippedTalisman || null },
    inventory,
    job,
    home,
    deco,
    farm,
    dogs,
    interior,
    floor,
    nodes,
    tools,
    wear,
    // phone — чи є номер узагалі: без нього персональні розділи не відкрити.
    access: { nastia: access[0], admin: access[1], phone: access[2] != null },
    daily: await getDailyState(userId, h),
    arcs: Object.fromEntries(
      arcs.map(([id, s]) => [id, { enabled: s.enabled && !s.done, done: s.done, day: s.day, startedAtMs: s.startedAtMs }])
    ),
    dumosvit: {
      intensity,
      reminders,
      quizRewardsToday: Math.min(Number(quizCount ?? 0), GAME_CONFIG.quizDailyCap),
      goal,
    },
    // shared — острів спільний: Mini App показує, хто ще на ньому, і підхоплює зміни інших.
    household: { shared: island.shared },
    serverTime: Date.now(),
  };
  island.commit();
  return state;
}
