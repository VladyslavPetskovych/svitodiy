import { getRedis } from "../redisClient.js";

const TASKS_KEY = (uid) => `svitodiy:litopys:tasks:${uid}`;
const AWAIT_KEY = (uid) => `svitodiy:litopys:await:${uid}`;
const Z_REMIND = "svitodiy:litopys:remind";

/** @typedef {{ id: string, title: string, remindAt: number | null, done: boolean, createdAt: number }} LitTask */

function memberId(userId, taskId) {
  return `${userId}:${taskId}`;
}

function genTaskId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** @param {number} userId */
export async function getTasks(userId) {
  const raw = await getRedis().get(TASKS_KEY(userId));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** @param {number} userId @param {LitTask[]} tasks */
async function saveTasks(userId, tasks) {
  await getRedis().set(TASKS_KEY(userId), JSON.stringify(tasks));
}

/** @param {number} userId @param {Omit<LitTask, "id" | "done" | "createdAt"> & { id?: string }} data */
export async function addTask(userId, data) {
  const id = data.id ?? genTaskId();
  /** @type {LitTask} */
  const task = {
    id,
    title: data.title.trim().slice(0, 500),
    remindAt: data.remindAt,
    done: false,
    createdAt: Date.now(),
  };
  const tasks = await getTasks(userId);
  tasks.push(task);
  await saveTasks(userId, tasks);
  if (task.remindAt != null && task.remindAt > Date.now()) {
    await getRedis().zAdd(Z_REMIND, {
      score: task.remindAt,
      value: memberId(userId, task.id),
    });
  }
  return task;
}

/** @param {number} userId @param {string} taskId */
export async function getTask(userId, taskId) {
  const tasks = await getTasks(userId);
  return tasks.find((t) => t.id === taskId) ?? null;
}

/** @param {number} userId @param {string} taskId */
async function zRemTask(userId, taskId) {
  await getRedis().zRem(Z_REMIND, memberId(userId, taskId));
}

/** @param {number} userId @param {string} taskId */
export async function markTaskDone(userId, taskId) {
  const tasks = await getTasks(userId);
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return false;
  t.done = true;
  await zRemTask(userId, taskId);
  await saveTasks(userId, tasks);
  return true;
}

/** @param {number} userId @param {string} taskId */
export async function deleteTask(userId, taskId) {
  const tasks = await getTasks(userId);
  const next = tasks.filter((x) => x.id !== taskId);
  if (next.length === tasks.length) return false;
  await zRemTask(userId, taskId);
  await saveTasks(userId, next);
  return true;
}

const AWAIT_TTL_SEC = 900;

/** @param {number} userId */
export async function setAwaitingTaskText(userId) {
  await getRedis().setEx(AWAIT_KEY(userId), AWAIT_TTL_SEC, "1");
}

/** @param {number} userId */
export async function clearAwaitingTaskText(userId) {
  await getRedis().del(AWAIT_KEY(userId));
}

/** @param {number} userId */
export async function isAwaitingTaskText(userId) {
  const v = await getRedis().get(AWAIT_KEY(userId));
  return v != null;
}

/**
 * Учасники ZSET, у яких score ≤ now.
 * @returns {Promise<{ userId: number, taskId: string }[]>}
 */
export async function dueReminderMembers(now = Date.now(), limit = 100) {
  const r = getRedis();
  const members = await r.zRangeByScore(Z_REMIND, 0, now, {
    LIMIT: { offset: 0, count: limit },
  });
  const out = [];
  for (const m of members) {
    const i = String(m).indexOf(":");
    if (i < 1) continue;
    const uid = Number(String(m).slice(0, i));
    const taskId = String(m).slice(i + 1);
    if (Number.isFinite(uid) && taskId) out.push({ userId: uid, taskId });
  }
  return out;
}

/** @param {number} userId @param {string} taskId */
export async function popReminderMember(userId, taskId) {
  await getRedis().zRem(Z_REMIND, memberId(userId, taskId));
}

/** Перенести нагадування (наприклад після невдалої відправки). */
export async function bumpReminderScore(userId, taskId, atMs) {
  await getRedis().zAdd(Z_REMIND, {
    score: atMs,
    value: memberId(userId, taskId),
  });
}

/** Після відправленого нагадування прибираємо дату з картки завдання. */
export async function stripRemindAt(userId, taskId) {
  const tasks = await getTasks(userId);
  const t = tasks.find((x) => x.id === taskId);
  if (!t || t.remindAt == null) return;
  t.remindAt = null;
  await saveTasks(userId, tasks);
}
