import { addBalance, getRedis } from "../bot.js";
import { GAME_CONFIG } from "./catalog.js";
import { conflict } from "./errors.js";
import { dailyClaimKey, kyivDay, previousDay, userKey } from "./keys.js";

/** Щоденна нагорода: серія днів поспіль, пропуск — серія з нуля. */
export async function claimDaily(userId) {
  const r = getRedis();
  const today = kyivDay();
  // SET NX — навіть два одночасні запити не заберуть нагороду двічі.
  const ok = await r.set(dailyClaimKey(userId, today), "1", { NX: true, EX: 3 * 86_400 });
  if (ok !== "OK") throw conflict("claimed", "Сьогоднішню нагороду вже забрано.");

  const [last, stored] = await r.hmGet(userKey(userId), ["dailyLastDay", "dailyStreak"]);
  const streak = last === previousDay(today) ? Number(stored ?? 0) + 1 : 1;
  const rewards = GAME_CONFIG.dailyRewards;
  const reward = rewards[(streak - 1) % rewards.length];

  await r.hSet(userKey(userId), { dailyLastDay: today, dailyStreak: String(streak) });
  await addBalance(userId, reward);
  return { reward, streak };
}
