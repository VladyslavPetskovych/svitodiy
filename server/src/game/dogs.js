import { CATCHES, CROPS, addResourceToInventory, consumeResources, cropKey, getCrop, getFishMeta, getRedis, seedKey } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { dogsKey, kyivDay, takeCooldown } from "./keys.js";

/**
 * Пси на рідному острові (лише Mini App): дружба, годування й команди.
 * Вигляд і поведінка — на клієнті (miniapp/src/game/walk/companion.js, dog.js);
 * тут — те, що має пережити перезавантаження: серця, коли годували, і де пес лишився.
 *
 * Як улюбленці в Stardew Valley: раз на день можна нагодувати (і погладити) — росте дружба.
 * Нагодований пес інколи щось відкопує й приносить. У спільному домі пси теж спільні.
 */

export const DOGS = [
  { id: "rudko", name: "Рудько", loves: "fish" },
  { id: "sirko", name: "Сірко", loves: "fish_bone" },
];
const BY_ID = new Map(DOGS.map((d) => [d.id, d]));

/** Дружба 0…100, серце — кожні 10. */
const LOVE_MAX = 100;
const LOVE_FEED = 8;
const LOVE_FAVORITE = 14;
const LOVE_PET = 3;

/** Що відкопує нагодований пес (вага — як часто). */
const GIFTS = [
  { id: "twig", w: 26, n: [1, 3] },
  { id: "stone", w: 22, n: [1, 2] },
  { id: "shell", w: 16, n: [1, 2] },
  { id: "fish_bone", w: 10, n: [1, 1] },
  { id: seedKey("radish"), w: 9, n: [1, 3] },
  { id: seedKey("carrot"), w: 7, n: [1, 2] },
  { id: "old_coin", w: 6, n: [1, 1] },
  { id: "glass_shard", w: 3, n: [1, 1] },
  { id: "silver_piece", w: 1, n: [1, 1] },
];
const GIFT_TOTAL = GIFTS.reduce((s, g) => s + g.w, 0);

export const MODES = ["follow", "sit", "house"];
const SCENES = { island: { w: 512, h: 448 }, home: { w: 240, h: 192 } };

/**
 * Чим можна нагодувати: будь-яка риба, риб'яча кістка й деякі овочі з городу.
 * @returns {{ kind: 'fish'|'bone'|'crop', bonus: number } | null}
 */
export function dogFoodOf(itemId) {
  if (itemId === "fish_bone") return { kind: "bone", bonus: 0 };
  if (getFishMeta(itemId)) return { kind: "fish", bonus: 0 };
  const m = /^crop_([a-z]+)$/.exec(itemId);
  const crop = m && getCrop(m[1]);
  return crop?.dogFood ? { kind: "crop", bonus: crop.dogFood - 1 } : null;
}

const isFavorite = (dog, itemId) => (dog.loves === "fish" ? !!getFishMeta(itemId) : itemId === dog.loves);

function parse(raw) {
  try {
    const v = JSON.parse(raw ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

async function load(userId) {
  const { owner } = await homeOwner(userId);
  const h = await getRedis().hGetAll(dogsKey(owner));
  return { owner, all: Object.fromEntries(DOGS.map((d) => [d.id, parse(h[d.id])])) };
}

const write = (owner, dogId, v) => getRedis().hSet(dogsKey(owner), dogId, JSON.stringify(v));

/** Для стану гри: { rudko: { love, hearts, fedToday, pettedToday, mode, sit } … }. */
export async function getDogs(userId) {
  const { all } = await load(userId);
  const today = kyivDay();
  return Object.fromEntries(
    DOGS.map((d) => {
      const v = all[d.id];
      const love = Math.max(0, Math.min(LOVE_MAX, Number(v.love) || 0));
      return [
        d.id,
        {
          love,
          hearts: Math.floor(love / 10),
          fedToday: v.fedDay === today,
          pettedToday: v.petDay === today,
          mode: MODES.includes(v.mode) ? v.mode : "follow",
          sit: v.mode === "sit" && v.sit ? v.sit : null,
        },
      ];
    })
  );
}

async function dogFor(userId, dogId) {
  const dog = typeof dogId === "string" ? BY_ID.get(dogId) : null;
  if (!dog) throw badRequest("Невідомий пес.");
  if (!(await takeCooldown(userId, `dog:${dog.id}`, 300))) throw new GameError(429, "cooldown", "Секунду…");
  const { owner, all } = await load(userId);
  return { dog, owner, v: all[dog.id] };
}

function rollGift() {
  let r = Math.random() * GIFT_TOTAL;
  for (const g of GIFTS) {
    r -= g.w;
    if (r < 0) return { id: g.id, n: g.n[0] + Math.floor(Math.random() * (g.n[1] - g.n[0] + 1)) };
  }
  return null;
}

export async function feedDog(userId, dogId, itemId) {
  const food = typeof itemId === "string" ? dogFoodOf(itemId) : null;
  if (!food) throw badRequest("Пси таке не їдять.");
  const { dog, owner, v } = await dogFor(userId, dogId);
  const today = kyivDay();
  if (v.fedDay === today) throw conflict("full", `${dog.name} уже ситий — приходь завтра.`);
  if (!(await consumeResources(userId, { [itemId]: 1 }))) throw conflict("not_enough", "Цього немає в рюкзаку.");

  const favorite = isFavorite(dog, itemId);
  const gain = (favorite ? LOVE_FAVORITE : LOVE_FEED) + food.bonus * 4;
  const love = Math.min(LOVE_MAX, (Number(v.love) || 0) + gain);
  await write(owner, dog.id, { ...v, love, fedDay: today });

  // Ситий пес біжить щось відкопати — що більше сердець, то частіше.
  let gift = null;
  if (Math.random() < 0.3 + Math.floor(love / 10) * 0.04) {
    gift = rollGift();
    if (gift) await addResourceToInventory(userId, gift.id, gift.n);
  }
  return { dog: dog.id, favorite, gain, hearts: Math.floor(love / 10), gift: gift ? { [gift.id]: gift.n } : null };
}

/** Погладити: дружба росте лише від першого разу за день (далі — просто радість на клієнті). */
export async function petDog(userId, dogId) {
  const { dog, owner, v } = await dogFor(userId, dogId);
  const today = kyivDay();
  if (v.petDay === today) return { dog: dog.id, gain: 0 };
  const love = Math.min(LOVE_MAX, (Number(v.love) || 0) + LOVE_PET);
  await write(owner, dog.id, { ...v, love, petDay: today });
  return { dog: dog.id, gain: LOVE_PET };
}

/**
 * Команда: follow — за тобою, sit — сидіти на місці (scene, x, y), house — чекати в хатинці.
 * @param {{ mode?: string, scene?: string, x?: number, y?: number }} body
 */
export async function commandDog(userId, dogId, body) {
  const mode = body?.mode;
  if (!MODES.includes(mode)) throw badRequest("Невідома команда.");
  let sit = null;
  if (mode === "sit") {
    const sc = SCENES[body.scene];
    const x = Math.round(Number(body.x));
    const y = Math.round(Number(body.y));
    if (!sc || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > sc.w || y > sc.h) {
      throw badRequest("Тут пес сидіти не може.");
    }
    sit = { scene: body.scene, x, y };
  }
  const { dog, owner, v } = await dogFor(userId, dogId);
  await write(owner, dog.id, { ...v, mode, sit });
  return { dog: dog.id, mode };
}

/** Для каталогу: хто що любить і чим можна годувати. */
export function dogsCatalog() {
  return {
    dogs: DOGS,
    food: ["fish_bone", ...CATCHES.map((f) => f.id), ...CROPS.filter((c) => c.dogFood).map((c) => cropKey(c.id))],
  };
}
