import { getRedis } from "../redisClient.js";
import { ARC_DURATION_DAYS, listArcIds } from "./arcContent.js";

const PREFIX = "svitodiy";

function stateKey(userId, arcId) {
  return `${PREFIX}:arc:${arcId}:user:${userId}`;
}

function dueKey(arcId) {
  return `${PREFIX}:arc:${arcId}:due`;
}

function parseState(raw) {
  const startedAtMs = Number(raw.startedAtMs ?? 0);
  const nextAtMs = Number(raw.nextAtMs ?? 0);
  const enabled = raw.enabled === "1";
  const messageCount = Number(raw.messageCount ?? 0);
  const day = startedAtMs > 0 ? Math.floor((Date.now() - startedAtMs) / 86_400_000) + 1 : 0;
  return {
    enabled,
    startedAtMs,
    nextAtMs,
    messageCount,
    day,
    done: day > ARC_DURATION_DAYS,
  };
}

export async function getArcState(userId, arcId) {
  const raw = await getRedis().hGetAll(stateKey(userId, arcId));
  return parseState(raw);
}

export async function enableArc(userId, arcId) {
  const now = Date.now();
  const current = await getArcState(userId, arcId);
  if (current.enabled && !current.done) return false;
  const r = getRedis();

  // Only one active arc at a time: disable all other arcs for this user.
  for (const otherArcId of listArcIds()) {
    if (otherArcId === arcId) continue;
    await r.hSet(stateKey(userId, otherArcId), {
      enabled: "0",
      updatedAt: new Date().toISOString(),
    });
    await r.zRem(dueKey(otherArcId), String(userId));
  }
  await r.hSet(stateKey(userId, arcId), {
    enabled: "1",
    startedAtMs: String(now),
    nextAtMs: String(now),
    messageCount: "0",
    updatedAt: new Date().toISOString(),
  });
  await r.zAdd(dueKey(arcId), { score: now, value: String(userId) });
  return true;
}

export async function disableArc(userId, arcId) {
  await getRedis().hSet(stateKey(userId, arcId), {
    enabled: "0",
    updatedAt: new Date().toISOString(),
  });
  await getRedis().zRem(dueKey(arcId), String(userId));
}

export async function scheduleArcNext(userId, arcId, delayMs) {
  const safeDelayMs = Math.max(60_000, Number(delayMs) || 12 * 60 * 60 * 1000);
  const nextAtMs = Date.now() + safeDelayMs;
  await getRedis().hSet(stateKey(userId, arcId), {
    enabled: "1",
    nextAtMs: String(nextAtMs),
    updatedAt: new Date().toISOString(),
  });
  await getRedis().zAdd(dueKey(arcId), { score: nextAtMs, value: String(userId) });
}

export async function bumpArcMessageCounter(userId, arcId) {
  return getRedis().hIncrBy(stateKey(userId, arcId), "messageCount", 1);
}

export async function popArcDue(userId, arcId) {
  await getRedis().zRem(dueKey(arcId), String(userId));
}

export async function getDueArcUsers(arcId, nowMs = Date.now(), limit = 100) {
  return getRedis().zRangeByScore(dueKey(arcId), 0, nowMs, {
    LIMIT: { offset: 0, count: limit },
  });
}
