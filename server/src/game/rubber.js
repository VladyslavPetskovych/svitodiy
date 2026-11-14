import { addResourceToInventory, getRedis } from "../bot.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { homeOwner } from "./household.js";
import { decoKey, takeCooldown } from "./keys.js";

/**
 * Гевея — каучукове дерево на рідному острові (лише Mini App).
 *
 * Насінину гевеї (rubber_seed) знаходять, як і насінину дерева: у рибі (готування), на вудці
 * й зрідка в корчах на пляжі. Садять у будівництві («Посадки» → «Гевея»): декор з полями
 * t — коли посадили, c — коли востаннє зібрали каучук (до першого збору — нема).
 *
 * Росте growMs (горбик → паросток → молода гевея → доросла), далі не рубається, а дає perHour каучуку
 * щогодини: латекс стікає в чашку на стовбурі. Чашка вміщує cap — що понад, те проливається,
 * тож навідуватись варто хоча б раз на cap / perHour годин. Рахуємо ліниво: від max(дозріла, c).
 */
export const RUBBER = {
  kind: "rubber_tree",
  growMs: 60 * 60_000,
  /** Стадії до зрілості: 0 — горбик, 1 — паросток, 2 — молода гевея; stages — доросла. */
  stages: 3,
  perHour: 3,
  /** Скільки вміщує чашка. */
  cap: 24,
};

/** Скільки мс на один каучук. */
const UNIT = 3_600_000 / RUBBER.perHour;
const ID = /^[a-z0-9]{6,16}$/;

/** Коли дерево подорослішало і з якого моменту відтоді капає каучук. */
function since(tree) {
  const ripe = (Number(tree.t) || 0) + RUBBER.growMs;
  return { ripe, from: Math.max(ripe, Number(tree.c) || 0) };
}

/** Скільки каучуку в чашці на мить now (0 — ще росте). */
export function rubberReady(tree, now = Date.now()) {
  const { ripe, from } = since(tree);
  if (now < ripe) return 0;
  return Math.min(RUBBER.cap, Math.floor((now - from) / UNIT));
}

/** Зібрати каучук з гевеї. У спільному домі дерево спільне, каучук — тому, хто зібрав. */
export async function collectRubber(userId, id) {
  if (typeof id !== "string" || !ID.test(id)) throw badRequest("Невідоме дерево.");
  const { owner } = await homeOwner(userId);
  // Замок на дерево: подвійний тап чи двоє мешканців разом не зберуть одну чашку двічі.
  if (!(await takeCooldown(`${owner}:${id}`, "rubber", 600))) throw new GameError(429, "cooldown", "Секунду — ще зливаєш латекс.");
  const r = getRedis();
  const raw = await r.hGet(decoKey(owner), id);
  let tree = null;
  try {
    tree = raw && JSON.parse(raw);
  } catch {
    /* зіпсований запис */
  }
  if (!tree || tree.k !== RUBBER.kind) throw new GameError(404, "not_found", "Тут немає гевеї.");
  const now = Date.now();
  const { ripe, from } = since(tree);
  if (now < ripe) throw conflict("growing", "🌱 Гевея ще росте.");
  const n = rubberReady(tree, now);
  if (n < 1) throw conflict("empty", "Чашка ще порожня — латекс капає повільно.");
  // Повна чашка — лишок пролився, відлік з нуля; інакше залишок часу до наступного каучуку не губиться.
  const c = (now - from) / UNIT >= RUBBER.cap ? now : from + n * UNIT;
  await r.hSet(decoKey(owner), id, JSON.stringify({ ...tree, c }));
  await addResourceToInventory(userId, "rubber", n);
  return { got: { rubber: n } };
}

/** Для каталогу. */
export function rubberCatalog() {
  return { kind: RUBBER.kind, growMin: RUBBER.growMs / 60_000, stages: RUBBER.stages, perHour: RUBBER.perHour, cap: RUBBER.cap };
}
