import { getRedis, sharedHomeId } from "../bot.js";
import { decoKey, homeKey } from "./keys.js";

/**
 * Чий рідний острів бачить гравець: свій чи спільний (список номерів — SHARED_HOME_PHONES
 * у telegram-bot/src/specialAccess.js). Рюкзак і ✨ завжди особисті — спільні лише будівлі,
 * комора й декор.
 *
 * Спільний дім народжується з острова того, хто першим зайшов після об'єднання;
 * особистий острів другого лишається в Redis недоторканим.
 * @returns {Promise<{ owner: string, shared: boolean }>}
 */
export async function homeOwner(userId) {
  const shared = await sharedHomeId(userId);
  if (!shared) return { owner: String(userId), shared: false };
  const r = getRedis();
  for (const key of [homeKey, decoKey]) {
    if (await r.exists(key(shared))) continue;
    const mine = await r.hGetAll(key(userId));
    if (Object.keys(mine).length) await r.hSet(key(shared), mine);
  }
  return { owner: shared, shared: true };
}
