import { getRedis, isSharedHomeHost, sharedHomeId } from "../bot.js";
import { cablesKey, decoKey, dogsKey, farmKey, floorKey, homeKey, interiorKey, nodesKey } from "./keys.js";

/** Усе, що належить острову (а не гравцю): будівлі й комора, декор, город, хатинка, підлога, пси, ресурси. */
const ISLAND_KEYS = [homeKey, decoKey, farmKey, interiorKey, floorKey, dogsKey, nodesKey, cablesKey];
/** Позначка «спільний острів уже звірено з островом господаря» (значення — id господаря). */
const pinnedKey = (shared) => `svitodiy:sharedhost:${shared}`;

/**
 * Чий рідний острів бачить гравець: свій чи спільний (список номерів — SHARED_HOME_PHONES
 * у telegram-bot/src/specialAccess.js). Рюкзак і ✨ завжди особисті — спільний увесь острів:
 * будівлі, комора, декор, город, хатинка й пси.
 *
 * Спільний острів — це острів господаря (SHARED_HOME_HOST). Острови гостей лишаються
 * в Redis недоторканими, просто вони їх більше не бачать.
 * @returns {Promise<{ owner: string, shared: boolean }>}
 */
export async function homeOwner(userId) {
  const shared = await sharedHomeId(userId);
  if (!shared) return { owner: String(userId), shared: false };
  if (await isSharedHomeHost(userId)) await pinToHost(String(userId), shared);
  return { owner: shared, shared: true };
}

/** Один запит стану кличе homeOwner кілька разів паралельно — звіряємо лише раз. */
const pinning = new Map();

function pinToHost(hostId, shared) {
  if (!pinning.has(shared)) {
    pinning.set(
      shared,
      doPin(hostId, shared).catch((err) => {
        pinning.delete(shared); // спробуємо наступного разу
        throw err;
      })
    );
  }
  return pinning.get(shared);
}

/**
 * Разово: якщо господар останнім часом грав на своєму острові (а не на спільному),
 * спільний стає копією його острова. Старий спільний зберігається як `<shared>-bak-<час>`.
 * Якщо господар уже грав на спільному — нічого не копіюємо, це й так його острів.
 */
async function doPin(hostId, shared) {
  const r = getRedis();
  if ((await r.set(pinnedKey(shared), hostId, { NX: true })) !== "OK") return;

  const read = (owner) => Promise.all(ISLAND_KEYS.map((key) => r.hGetAll(key(owner))));
  const [mine, theirs] = await Promise.all([read(hostId), read(shared)]);
  if (isEmpty(mine) || lastActivity(mine) <= lastActivity(theirs)) {
    console.log(`[household] ${shared}: already host ${hostId}'s island, nothing to copy`);
    return;
  }

  const backup = `${shared}-bak-${Date.now()}`;
  const tx = r.multi();
  ISLAND_KEYS.forEach((key, i) => {
    if (Object.keys(theirs[i]).length) tx.hSet(key(backup), theirs[i]);
    tx.del(key(shared));
    if (Object.keys(mine[i]).length) tx.hSet(key(shared), mine[i]);
  });
  await tx.exec();
  console.log(`[household] ${shared}: copied host ${hostId}'s island (old one saved as ${backup})`);
}

const isEmpty = (hashes) => hashes.every((h) => Object.keys(h).length === 0);

/** Коли на острові востаннє щось робили: збір комори/будівництво або полив грядок. */
function lastActivity([home, , farm]) {
  let t = Number(home.collectedAt) || 0;
  for (const raw of Object.values(farm)) {
    try {
      t = Math.max(t, Number(JSON.parse(raw).w) || 0);
    } catch {
      /* зіпсована грядка — пропускаємо */
    }
  }
  return t;
}
