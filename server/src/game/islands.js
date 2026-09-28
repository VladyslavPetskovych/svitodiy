import {
  addBalance,
  addResourceToInventory,
  getBalance,
  getRawBalance,
  getRedis,
  loseAllResourcesAndEquipment,
} from "../bot.js";
import { GAME_CONFIG, getIsland } from "./catalog.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { jobKey, takeCooldown } from "./keys.js";

function requireOpenIsland(islandId) {
  const island = typeof islandId === "string" ? getIsland(islandId) : null;
  if (!island) throw badRequest("Невідомий острів.");
  if (island.locked) throw conflict("locked", "Цей острів ще недоступний.");
  return island;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Розвідка: як JUNGLE_EXPLORE / BLIZZARD_EXPLORE у боті —
 * 25% зустріти монстра, бій 50/50 на ±10 ✨, при від'ємному балансі — втрата речей.
 */
export async function explore(userId, islandId) {
  const island = requireOpenIsland(islandId);
  if (!(await takeCooldown(userId, "explore", GAME_CONFIG.exploreCooldownMs))) {
    throw new GameError(429, "cooldown", "Перепочинь мить перед новою розвідкою.");
  }

  if (Math.random() >= GAME_CONFIG.encounterChance) {
    return { event: { kind: "calm", text: pick(island.calm) } };
  }

  const win = Math.random() < GAME_CONFIG.fightWinChance;
  const monster = island.monster;

  if ((await getRawBalance(userId)) < 0) {
    await loseAllResourcesAndEquipment(userId);
    return { event: { kind: "fight", monster, result: "wiped", delta: 0 } };
  }
  if (win) {
    await addBalance(userId, GAME_CONFIG.fightStake);
    return { event: { kind: "fight", monster, result: "win", delta: GAME_CONFIG.fightStake } };
  }
  const penalty = Math.min(GAME_CONFIG.fightStake, await getBalance(userId));
  if (penalty > 0) await addBalance(userId, -penalty);
  return { event: { kind: "fight", monster, result: "lose", delta: -penalty } };
}

/** Почати заготівлю (дерево/лід). Одна заготівля на гравця за раз. */
export async function startGather(userId, islandId) {
  const island = requireOpenIsland(islandId);
  const now = Date.now();
  const job = {
    island: island.id,
    resourceId: island.gather.resourceId,
    startedAt: now,
    endsAt: now + island.gather.durationMs,
  };
  const ok = await getRedis().set(jobKey(userId), JSON.stringify(job), { NX: true });
  if (ok !== "OK") throw conflict("busy", "Заготівля вже триває — дочекайся завершення.");
  return { job };
}

/** Забрати готовий ресурс. DEL повертає 1 лише одному з паралельних запитів — подвійно не видасть. */
export async function claimGather(userId) {
  const r = getRedis();
  const raw = await r.get(jobKey(userId));
  if (!raw) throw conflict("no_job", "Немає заготівлі.");
  const job = JSON.parse(raw);
  if (Date.now() < job.endsAt) throw conflict("not_ready", "Ще не готово.");
  if ((await r.del(jobKey(userId))) !== 1) throw conflict("no_job", "Вже забрано.");
  const total = await addResourceToInventory(userId, job.resourceId, 1);
  return { reward: { id: job.resourceId, amount: 1, total } };
}
