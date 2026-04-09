import { getRedis } from "../redisClient.js";
import { REDEMPTION_DURATION_DAYS } from "./redemptionContent.js";

const PREFIX = "svitodiy";
const DUE_KEY = `${PREFIX}:arc:redemption:due`;
const INTERVAL_MS = Number(process.env.REDEMPTION_INTERVAL_MS || 12 * 60 * 60 * 1000);

function stateKey(userId) {
  return `${PREFIX}:arc:redemption:user:${userId}`;
}

function parseState(raw) {
  const startedAtMs = Number(raw.startedAtMs ?? 0);
  const nextAtMs = Number(raw.nextAtMs ?? 0);
  const enabled = raw.enabled === "1";
  const day = startedAtMs > 0 ? Math.floor((Date.now() - startedAtMs) / 86_400_000) + 1 : 0;
  return {
    enabled,
    startedAtMs,
    nextAtMs,
    day,
    done: day > REDEMPTION_DURATION_DAYS,
  };
}

export async function getRedemptionState(userId) {
  const raw = await getRedis().hGetAll(stateKey(userId));
  return parseState(raw);
}

export async function enableRedemptionArc(userId) {
  const key = stateKey(userId);
  const now = Date.now();
  const current = await getRedemptionState(userId);
  if (current.enabled && !current.done) return false;

  await getRedis().hSet(key, {
    enabled: "1",
    startedAtMs: String(now),
    nextAtMs: String(now),
    updatedAt: new Date().toISOString(),
  });
  await getRedis().zAdd(DUE_KEY, { score: now, value: String(userId) });
  return true;
}

export async function disableRedemptionArc(userId) {
  const key = stateKey(userId);
  await getRedis().hSet(key, {
    enabled: "0",
    updatedAt: new Date().toISOString(),
  });
  await getRedis().zRem(DUE_KEY, String(userId));
}

export async function scheduleRedemptionNext(userId) {
  const key = stateKey(userId);
  const nextAtMs = Date.now() + INTERVAL_MS;
  await getRedis().hSet(key, {
    enabled: "1",
    nextAtMs: String(nextAtMs),
    updatedAt: new Date().toISOString(),
  });
  await getRedis().zAdd(DUE_KEY, { score: nextAtMs, value: String(userId) });
}

export async function popRedemptionDue(userId) {
  await getRedis().zRem(DUE_KEY, String(userId));
}

export async function getDueRedemptionUsers(nowMs = Date.now(), limit = 100) {
  return getRedis().zRangeByScore(DUE_KEY, 0, nowMs, { LIMIT: { offset: 0, count: limit } });
}
