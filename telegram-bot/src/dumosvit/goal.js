import { getRedis } from "../redisClient.js";
import { addBalance } from "../userStore.js";
import { getDumosvitIntensity } from "./intensity.js";
import { kyivDay } from "./srs.js";

/**
 * Денна ціль і серія днів: кожна перевірена вправа (тест, письмо, речення, пари)
 * рахується в ціль; виконав ціль — серія +1 і бонус ✨.
 */
const DONE_KEY = (userId, day) => `svitodiy:dumosvit:done:${userId}:${day}`;
const STREAK_KEY = (userId) => `svitodiy:dumosvit:streak:${userId}`;

export const GOAL_BONUS = 5;

/** Скільки вправ на день — залежить від обраної інтенсивності. */
export function dailyGoalFor(level) {
  return { 1: 10, 2: 20, 3: 30, 4: 50 }[level] ?? 20;
}

function previousDay(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Серія «жива», якщо ціль виконано сьогодні або вчора. */
function liveStreak(h, today) {
  const count = Number(h.count ?? 0);
  if (!count) return 0;
  return h.lastDay === today || h.lastDay === previousDay(today) ? count : 0;
}

/**
 * @returns {Promise<{ done: number, goal: number, streak: number, best: number, doneToday: boolean, reward: number }>}
 */
export async function getDumosvitGoal(userId) {
  const r = getRedis();
  const today = kyivDay();
  const [raw, h, level] = await Promise.all([
    r.get(DONE_KEY(userId, today)),
    r.hGetAll(STREAK_KEY(userId)),
    getDumosvitIntensity(userId),
  ]);
  const goal = dailyGoalFor(level);
  const done = Number(raw ?? 0);
  return {
    done: Math.min(done, goal),
    goal,
    streak: liveStreak(h, today),
    best: Number(h.best ?? 0),
    doneToday: h.lastDay === today,
    reward: GOAL_BONUS,
  };
}

/**
 * Зарахувати виконані вправи. Коли ціль досягнуто вперше за день — серія й бонус.
 * @returns {Promise<{ done: number, goal: number, streak: number, best: number, doneToday: boolean, reachedNow: boolean, bonus: number }>}
 */
export async function recordPractice(userId, n = 1) {
  const r = getRedis();
  const today = kyivDay();
  const key = DONE_KEY(userId, today);
  const done = await r.incrBy(key, n);
  if (done === n) await r.expire(key, 3 * 86_400);

  const goal = dailyGoalFor(await getDumosvitIntensity(userId));
  let reachedNow = false;
  let bonus = 0;
  if (done >= goal) {
    // NX-ключ на день: серія й бонус — рівно раз, навіть якщо ціль змінили посеред дня
    // або прийшли паралельні запити.
    const first = await r.set(`${key}:reached`, "1", { NX: true, EX: 3 * 86_400 });
    if (first === "OK") {
      const h = await r.hGetAll(STREAK_KEY(userId));
      const count = liveStreak(h, today) + 1;
      const best = Math.max(count, Number(h.best ?? 0));
      await r.hSet(STREAK_KEY(userId), { count: String(count), lastDay: today, best: String(best) });
      await addBalance(userId, GOAL_BONUS);
      reachedNow = true;
      bonus = GOAL_BONUS;
    }
  }
  return { ...(await getDumosvitGoal(userId)), reachedNow, bonus };
}

export function formatDumosvitGoal(g) {
  const bar = g.doneToday ? "✅" : `${g.done}/${g.goal}`;
  const streak = g.streak > 0 ? `🔥 Серія: <b>${g.streak}</b> дн.` : "🔥 Серія: 0 — почни сьогодні";
  return `🎯 <b>Ціль дня:</b> ${bar} вправ · ${streak}`;
}

/** Рядок про досягнення цілі (бот). */
export function formatGoalReached(g) {
  if (!g?.reachedNow) return "";
  return `\n\n🎉 <b>Ціль дня виконано!</b> Серія: ${g.streak} дн. · +${g.bonus} ✨`;
}
