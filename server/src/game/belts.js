import { addResourceToInventory, consumeResources, getFishMeta, getRedis } from "../bot.js";
import { CABLE_CELL, onLand } from "./cables.js";
import { BELT, BELT_CRATE } from "./belt-def.js";
import { FISH_CUTTER, PROCESSORS, cutUntil, isProcessor } from "./cutter-def.js";
import { deckCells, footCellsOf, getDecor } from "./decor.js";
import { drain, settleLocked, withEnergyLock, writeCharge } from "./energy.js";
import { GameError, badRequest, conflict } from "./errors.js";
import { FISH_HUT } from "./fishhut-def.js";
import { onIsland } from "./island-bounds.js";
import { homeOwner } from "./household.js";
import { beltsKey, cablesKey, decoKey, takeCooldown } from "./keys.js";
import { batteryCap, networksOf } from "./power.js";
import { MINE, mineReady } from "./mine.js";

/**
 * Дерев'яні конвеєри рідного острова (лише Mini App) — як ряд «Conveyor belts (wooden)» еталонного аркуша.
 *
 * Стрічка лежить на суші чи помості клітинками 8×8 px: hash «cx,cy» → напрямок (0 → праворуч, 1 ↓, 2 ←, 3 ↑).
 * Кожна клітинка коштує BELT.cost; прибрав — повертається.
 *
 * Джерела мають жолоб (port, px від якоря): рибальська хата віддає рибу (найціннішу першою — takeFish),
 * шахта — камінь, обробники (cutter-def.js) — те, що вийняли: рибообробня — з риби, каменедробарка — з каменю. Якщо на клітинці жолоба лежить стрічка,
 * від неї йдемо за стрілками, доки наступна клітинка — під приймачем (SINKS): скринею (BELT_CRATE) чи
 * рибообробнею. Злиття двох стрічок в одну — просто дві стрілки в одну клітинку.
 * Ланцюжки хата → рибообробня → скриня і шахта → каменедробарка → скриня: обробник бере лише своє (камінь
 * до рибообробні не поїде — стрічка стоїть), а віддає інше, тож по колу нічого не їздить.
 *
 * Рахуємо ліниво, як улов хат: у записі джерела поле cv = { bt, fl }:
 *   bt — коли востаннє з жолоба зійшла річ; наступна сходить через BELT.gapMs;
 *   fl — речі в дорозі [[коли зійшла, id]]: доїжджають за path.length / BELT.speed с.
 * Що доїхало — у приймач, поки там є місце (cap, разом із тим, що вже в дорозі): у скриню (f) чи на стіл рибообробні (in).
 * Стрічку перерізали — речі з дороги повертаються в джерело, нічого не губиться.
 * Клієнт (miniapp/src/game/walk/belts.js) рахує той самий розклад — і бачить, як риба їде стрічкою.
 */
export { BELT };

export const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Обробник як джерело: ще не готове — не віддає. */
function processorSource(p) {
  return {
    port: p.port,
    queue(item, t) {
      return (item.o ?? []).filter(([at]) => at <= t).map(([, id]) => id);
    },
    take(item, id, t) {
      const o = [...(item.o ?? [])];
      const i = o.findIndex(([at, x]) => x === id && at <= t);
      if (i >= 0) o.splice(i, 1);
      return { ...item, o };
    },
    give(item, id) {
      return { ...item, o: [[0, id], ...(item.o ?? [])] };
    },
    /** Коли з'явиться наступне готове (стрічка не стоїть, поки ніж ріже). */
    nextAt(item, t) {
      const later = (item.o ?? []).map(([at]) => at).filter((at) => at > t);
      return later.length ? Math.min(...later) : null;
    },
  };
}

/** Хто віддає речі на стрічку: жолоб і як брати. */
const SOURCES = {
  [FISH_HUT.kind]: {
    port: FISH_HUT.port,
    /** Черга речей у тому порядку, як їх візьме стрічка (найцінніша риба перша). */
    queue(item) {
      const f = item.f ?? {};
      const ids = Object.keys(f)
        .filter((id) => Number(f[id]) > 0)
        .sort((a, b) => (getFishMeta(b)?.sellPrice ?? 0) - (getFishMeta(a)?.sellPrice ?? 0));
      return ids.flatMap((id) => Array(Number(f[id])).fill(id));
    },
    take(item, id) {
      const f = { ...(item.f ?? {}) };
      f[id] -= 1;
      if (f[id] <= 0) delete f[id];
      return { ...item, f };
    },
    give(item, id) {
      const f = { ...(item.f ?? {}) };
      f[id] = (f[id] ?? 0) + 1;
      return { ...item, f };
    },
  },
  [MINE.kind]: {
    port: MINE.port,
    queue(item, now) {
      return Array(mineReady(item, now)).fill(MINE.res);
    },
    take(item, _id, at) {
      const from = Number(item.c) || Number(item.t) || at;
      // Повна шахта не копала, поки стояла повна: після першого каменю відлік іде від цієї миті.
      const c = (at - from) / MINE.everyMs >= MINE.cap ? at - (MINE.cap - 1) * MINE.everyMs : from + MINE.everyMs;
      return { ...item, c };
    },
    give(item) {
      return { ...item, c: (Number(item.c) || Date.now()) - MINE.everyMs };
    },
  },
  // Обробники (рибообробня, каменедробарка — cutter-def.js): віддають готове (o) у тому порядку, як воно готове.
  ...Object.fromEntries(Object.values(PROCESSORS).map((p) => [p.kind, processorSource(p)])),
};

export const isBeltSource = (k) => !!SOURCES[k];

/**
 * Куди стрічка привозить: скриня бере все, обробник — лише своє (рибообробня — рибу, каменедробарка — камінь)
 * і не більше inCap (зі столом разом).
 * load — скільки вже лежить, put — покласти одну річ, що доїхала в мить at.
 */
const SINKS = {
  [BELT_CRATE.kind]: {
    cap: BELT_CRATE.cap,
    accepts: () => true,
    load: (item) => crateCount(item),
    put: (item, id) => ({ ...item, f: { ...(item.f ?? {}), [id]: (Number(item.f?.[id]) || 0) + 1 } }),
  },
  ...Object.fromEntries(
    Object.values(PROCESSORS).map((p) => [
      p.kind,
      {
        cap: p.inCap,
        accepts: p.accepts,
        load: (item) => item.in?.length ?? 0,
        put: (item, id, at) => ({ ...item, in: [...(item.in ?? []), [at, id]] }),
      },
    ])
  ),
};

export const isBeltSink = (k) => !!SINKS[k];

/** Клітинка жолоба джерела (якір — низ по центру). */
export function portCell(d) {
  const p = SOURCES[d.k]?.port;
  if (!p) return null;
  return [Math.floor((d.x + p.dx) / CABLE_CELL), Math.floor((d.y + p.dy) / CABLE_CELL)];
}

const ck = (x, y) => `${x},${y}`;

/** @returns {Promise<[number, number, number][]>} клітинки стрічки з напрямком */
export async function getBelts(userId) {
  const { owner } = await homeOwner(userId);
  return readBelts(owner);
}

async function readBelts(owner) {
  const h = await getRedis().hGetAll(beltsKey(owner));
  return Object.entries(h).map(([k, d]) => [...k.split(",").map(Number), Number(d) & 3]);
}

/**
 * Лінії: від жолоба кожного джерела за стрілками до приймача (sink — скриня чи рибообробня) чи до обриву (sink null).
 * Стрічка, що з жолоба рибообробні заїжджає назад у неї ж, — теж обрив.
 * @param {[number, number, number][]} cells
 * @param {{ id: string, k: string, x: number, y: number }[]} deco
 */
export function beltLines(cells, deco) {
  const dir = new Map(cells.map(([x, y, d]) => [ck(x, y), d]));
  /** Клітинки під приймачами → id приймача. */
  const sinks = new Map();
  for (const d of deco) if (SINKS[d.k]) for (const [x, y] of footCellsOf(d)) sinks.set(ck(x, y), d.id);
  const lines = [];
  for (const d of deco) {
    const start = portCell(d);
    if (!start || !dir.has(ck(...start))) continue;
    const path = [];
    const seen = new Set();
    let [x, y] = start;
    let sink = null;
    while (dir.has(ck(x, y)) && !seen.has(ck(x, y))) {
      seen.add(ck(x, y));
      path.push([x, y]);
      const [dx, dy] = DIRS[dir.get(ck(x, y))];
      x += dx;
      y += dy;
      if (sinks.has(ck(x, y))) {
        sink = sinks.get(ck(x, y)) === d.id ? null : sinks.get(ck(x, y));
        break;
      }
    }
    lines.push({ src: d.id, kind: d.k, sink, path });
  }
  return lines;
}

const travelMs = (line) => (line.path.length / BELT.speed) * 1000;
const crateCount = (item) => Object.values(item?.f ?? {}).reduce((s, n) => s + (Number(n) || 0), 0);

function parse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Поля записів конвеєра, що йдуть у стан: розклад джерела, вміст скрині, шахта, стіл рибообробні. */
const BELT_FIELDS = ["cv", "f", "c", "in", "o", "cb"];

/**
 * Прокрутити всі стрічки до now (вже під замком острова). Пише змінені записи джерел і приймачів;
 * повертає декор зі свіжими cv / f / in / o — для стану.
 *
 * Три кроки, щоб ланцюжок хата → рибообробня → скриня рахувався в правильному порядку:
 * 1) звичайні джерела (хати, шахти) везуть і довозять — риба лягає на стіл рибообробні;
 * 2) рибообробні ріжуть, що доїхало (cutUntil);
 * 3) рибообробні віддають нарізане на свої стрічки.
 */
export async function beltsLocked(owner, deco, now) {
  const cells = await readBelts(owner);
  const lines = beltLines(cells, deco);
  const r = getRedis();
  const key = decoKey(owner);
  const ids = [...new Set(lines.flatMap((l) => [l.src, l.sink]).filter(Boolean))];
  // Джерела, що вже не лежать на стрічці, теж: їхні речі з дороги треба повернути.
  // Обробник ріже й без стрічок — те, що вже лежить на столі.
  for (const d of deco) if ((d.cv?.fl?.length || isProcessor(d.k)) && !ids.includes(d.id)) ids.push(d.id);
  if (!ids.length) return deco;
  const rec = new Map();
  const orig = new Map();
  for (const id of ids) {
    const v = parse(await r.hGet(key, id));
    if (!v) continue;
    rec.set(id, v);
    orig.set(id, JSON.stringify(v));
  }
  const lineOf = new Map(lines.map((l) => [l.src, l]));

  // Що вже в дорозі до кожного приймача — щоб не везти більше, ніж влізе.
  const coming = new Map();
  for (const l of lines) if (l.sink) coming.set(l.sink, (coming.get(l.sink) ?? 0) + (rec.get(l.src)?.cv?.fl?.length ?? 0));

  /** Прокрутити стрічку одного джерела: довезти, що доїхало, і пустити нове з жолоба. */
  const run = (id) => {
    let item = rec.get(id);
    const src = item && SOURCES[item.k];
    if (!src) return;
    const line = lineOf.get(id);
    const cv = { bt: Number(item.cv?.bt) || now, fl: [...(item.cv?.fl ?? [])] };
    let dest = line?.sink ? rec.get(line.sink) : null;
    const sink = dest && SINKS[dest.k];
    if (!sink) {
      // Обрив: що їхало — назад у джерело; стрічка стоїть.
      for (const [, got] of cv.fl) item = src.give(item, got);
      cv.fl = [];
      cv.bt = now;
    } else {
      const travel = travelMs(line);
      const land = () => {
        const keep = [];
        for (const f of cv.fl) {
          if (f[0] + travel <= now) {
            dest = sink.put(dest, f[1], f[0] + travel);
            coming.set(line.sink, (coming.get(line.sink) ?? 1) - 1);
          } else keep.push(f);
        }
        cv.fl = keep;
      };
      land();
      // Нові речі сходять із жолоба раз на gapMs, поки є що везти й куди класти.
      let t = cv.bt + BELT.gapMs;
      let idle = false;
      while (t <= now) {
        const next = src.queue(item, t)[0];
        // Рибообробня ще ріже — стрічка чекає, поки буде готове, а не простоює до кінця розрахунку.
        const at = !next && src.nextAt ? src.nextAt(item, t) : null;
        if (at != null && at <= now) {
          t = at;
          continue;
        }
        if (!next || !sink.accepts(next) || sink.load(dest) + (coming.get(line.sink) ?? 0) >= sink.cap) {
          idle = true;
          break;
        }
        item = src.take(item, next, t);
        cv.fl.push([t, next]);
        coming.set(line.sink, (coming.get(line.sink) ?? 0) + 1);
        cv.bt = t;
        t += BELT.gapMs;
      }
      // Нічого везти — відлік з «зараз»: свіжа риба не зійде миттєво пачкою за весь простій.
      if (idle) cv.bt = Math.max(cv.bt, now - BELT.gapMs);
      land();
      rec.set(line.sink, dest);
    }
    rec.set(id, { ...item, cv });
  };

  const isCutter = (id) => isProcessor(rec.get(id)?.k);
  for (const id of ids) if (!isCutter(id)) run(id);
  const charge = await cutLocked(owner, deco, ids.filter(isCutter), rec, lineOf, now);
  for (const id of ids) if (isCutter(id)) run(id);

  const changed = new Set(ids.filter((id) => rec.has(id) && JSON.stringify(rec.get(id)) !== orig.get(id)));
  // Прикрасу могли саме розібрати (removeDecor) — не воскрешаємо її запис.
  for (const id of changed) if (await r.hExists(key, id)) await r.hSet(key, id, JSON.stringify(rec.get(id)));
  return deco.map((d) => {
    if (charge.has(d.id)) return { ...d, e: charge.get(d.id) };
    if (!changed.has(d.id)) return d;
    const v = rec.get(d.id);
    return { ...d, ...Object.fromEntries(BELT_FIELDS.filter((f) => v[f] != null).map((f) => [f, v[f]])) };
  });
}

/**
 * Крок 2: обробники ріжуть (вже під замком). Кожен — лише коли під'єднаний кабелем до мережі з енергією
 * (energy Вт·год за річ з акумуляторів, cutter-def.js) і з її жолоба йде стрічка до скрині: інакше ніж стоїть.
 * Пише новий заряд акумуляторів; повертає його (id → Вт·год) — для стану.
 */
async function cutLocked(owner, deco, cutters, rec, lineOf, now) {
  if (!cutters.length) return new Map();
  const cells = (await getRedis().hKeys(cablesKey(owner))).map((f) => f.split(",").map(Number));
  // Спершу зарахувати, що генератори дали досі (як перед піччю чи хатою).
  const fresh = await settleLocked(owner, deco, cells, now);
  const { networks } = networksOf(cells, fresh, now);
  const settled = new Map(fresh.filter((d) => batteryCap(d.k) > 0).map((d) => [d.id, Math.min(batteryCap(d.k), d.e ?? 0)]));
  const charge = new Map(settled);
  for (const id of cutters) {
    const line = lineOf.get(id);
    const dest = line?.sink ? rec.get(line.sink) : null;
    // Готове падає лише на стрічку, що доходить до скрині (не в інший обробник — той бере тільки своє).
    const out = !!dest && !!SINKS[dest.k] && !isProcessor(dest.k);
    const net = networks.find((n) => n.devices.includes(id));
    const bats = net ? net.devices.filter((b) => charge.has(b)) : [];
    const have = out ? bats.reduce((s, b) => s + charge.get(b), 0) : 0;
    const { item, used } = cutUntil(rec.get(id), now, have);
    rec.set(id, item);
    if (used > 0)
      for (const [b, e] of drain(
        bats.map((b) => ({ id: b, e: charge.get(b) })),
        used
      ))
        charge.set(b, e);
  }
  // Пишемо те, що витратили (зарядку settleLocked уже записав); повертаємо все, що змінилось проти deco.
  await writeCharge(owner, new Map([...charge].filter(([b, e]) => e !== settled.get(b))));
  const before = new Map(deco.map((d) => [d.id, d.e]));
  return new Map([...charge].filter(([b, e]) => e !== before.get(b)));
}

/** Прокрутити стрічки при читанні стану. Якщо зараз рахує інший запит — як є. */
export async function settleBelts(userId, deco, now = Date.now()) {
  if (!deco.some((d) => SOURCES[d.k] || SINKS[d.k])) return deco;
  const { owner } = await homeOwner(userId);
  return (await withEnergyLock(owner, () => beltsLocked(owner, deco, now))) ?? deco;
}

/**
 * Стрічки для клієнта: клітинки, лінії з розкладом (bt, fl), черга речей у джерелі й місце в скрині.
 * Клієнт рахує з цього той самий розклад, що й beltsLocked.
 */
export function beltsView(cells, deco, now) {
  const byId = new Map(deco.map((d) => [d.id, d]));
  const raw = beltLines(cells, deco);
  const comingTo = (sink) => raw.filter((o) => o.sink === sink).reduce((s, o) => s + (byId.get(o.src)?.cv?.fl?.length ?? 0), 0);
  const lines = raw.map((l) => {
    const d = byId.get(l.src);
    const dest = l.sink ? byId.get(l.sink) : null;
    const sink = dest && SINKS[dest.k];
    const queue = SOURCES[l.kind].queue(d ?? {}, now).slice(0, 40);
    // Приймач не бере те, що на черзі (камінь у рибообробню), — стрічка стоїть, як і на сервері.
    const space = !sink || (queue.length && !sink.accepts(queue[0])) ? 0 : Math.max(0, sink.cap - sink.load(dest) - comingTo(l.sink));
    return { ...l, sinkKind: dest?.k ?? null, bt: Number(d?.cv?.bt) || now, fl: d?.cv?.fl ?? [], queue, space };
  });
  return { cells, lines, gapMs: BELT.gapMs, speed: BELT.speed, crateCap: BELT_CRATE.cap, at: now };
}

/* ───── Прокладання й зняття ───── */

const BATCH_MAX = 200;

function parseCells(list, withDir) {
  if (!Array.isArray(list) || !list.length) throw badRequest("Немає клітинок.");
  if (list.length > BATCH_MAX) throw badRequest("Забагато за раз.");
  const seen = new Map();
  for (const c of list) {
    if (!Array.isArray(c) || c.length !== (withDir ? 3 : 2)) throw badRequest("Невідома клітинка.");
    const [x, y, d] = c;
    if (!Number.isInteger(x) || !Number.isInteger(y) || (withDir && !(Number.isInteger(d) && d >= 0 && d <= 3))) throw badRequest("Невідома клітинка.");
    if (!onIsland(x * CABLE_CELL, y * CABLE_CELL)) throw badRequest("Це поза островом.");
    seen.set(ck(x, y), withDir ? [x, y, d] : [x, y]);
  }
  return [...seen.values()];
}

/** Подвійний тап не спише й не поверне двічі: стрічка — 150 мс на острів, скриня — своя, 600 мс. */
async function lock(owner, what) {
  const ok = what === "belts" ? await takeCooldown(owner, "belts", 150) : await takeCooldown(`${owner}:${what}`, "crate", 600);
  if (!ok) throw new GameError(429, "cooldown", what === "belts" ? "Секунду — ще кладемо попередню стрічку." : "Секунду — ще розвантажуємо скриню.");
}

/** Спершу докрутити стрічки за старим розкладом, потім fn — під тим самим замком острова. */
async function withBelts(userId, fn, what = "belts") {
  const { owner } = await homeOwner(userId);
  await lock(owner, what);
  const result = await withEnergyLock(
    owner,
    async () => {
      await beltsLocked(owner, await getDecor(userId), Date.now());
      return fn(owner);
    },
    { wait: true }
  );
  if (!result) throw new GameError(429, "cooldown", "Секунду — стрічка ще везе.");
  return result;
}

/**
 * Прокласти стрічку: [[cx, cy, напрямок]]. Нові клітинки коштують BELT.cost, у вже покладених
 * лише міняється напрямок (так розвертають стрічку). Лягає на сушу й помости.
 */
export async function layBelts(userId, list) {
  const cells = parseCells(list, true);
  const deck = deckCells(await getDecor(userId));
  const ground = ([x, y]) => onLand(x, y) || deck.has(ck(x, y));
  const ok = cells.filter(ground);
  if (!ok.length) throw conflict("not_ground", "Стрічка лягає лише на сушу чи поміст.");
  return withBelts(userId, async (owner) => {
    const r = getRedis();
    const k = beltsKey(owner);
    const present = new Set(await r.hKeys(k));
    const fresh = ok.filter(([x, y]) => !present.has(ck(x, y)));
    if (present.size + fresh.length > BELT.max) throw conflict("full", `На острові вже ${BELT.max} м стрічки — більше не вміщається.`);
    const cost = Object.fromEntries(Object.entries(BELT.cost).map(([id, n]) => [id, n * fresh.length]));
    if (fresh.length && !(await consumeResources(userId, cost))) throw conflict("not_enough", "Не вистачає дощок.");
    await r.hSet(k, Object.fromEntries(ok.map(([x, y, d]) => [ck(x, y), String(d)])));
    return { added: fresh.length, turned: ok.length - fresh.length };
  });
}

/** Зняти стрічку з клітинок — дошки повертаються (лише за справжні клітинки). */
export async function removeBelts(userId, list) {
  const cells = parseCells(list, false);
  return withBelts(userId, async (owner) => {
    const r = getRedis();
    const k = beltsKey(owner);
    let n = 0;
    for (const [x, y] of cells) if ((await r.hDel(k, ck(x, y))) === 1) n++;
    const refund = Object.fromEntries(Object.entries(BELT.cost).map(([id, c]) => [id, c * n]));
    for (const [id, c] of Object.entries(refund)) if (c) await addResourceToInventory(userId, id, c);
    return { removed: n, refund };
  });
}

/** Зняти стрічку, що опинилась над водою (розібрали чи перенесли помост). Повертає, що віддали. */
export async function pruneBelts(userId) {
  const { owner } = await homeOwner(userId);
  const r = getRedis();
  const k = beltsKey(owner);
  const deck = deckCells(await getDecor(userId));
  let n = 0;
  for (const f of await r.hKeys(k)) {
    const [x, y] = f.split(",").map(Number);
    if (!onLand(x, y) && !deck.has(f) && (await r.hDel(k, f)) === 1) n++;
  }
  const refund = Object.fromEntries(Object.entries(BELT.cost).map(([id, c]) => [id, c * n]));
  for (const [id, c] of Object.entries(refund)) if (c) await addResourceToInventory(userId, id, c);
  return n ? refund : {};
}

/** Забрати все зі скрині в рюкзак. */
export async function collectCrate(userId, id) {
  if (typeof id !== "string" || !/^[a-z0-9]{6,16}$/.test(id)) throw badRequest("Невідома скриня.");
  return withBelts(userId, async (owner) => {
    const r = getRedis();
    const key = decoKey(owner);
    const item = parse(await r.hGet(key, id));
    if (!item || item.k !== BELT_CRATE.kind) throw new GameError(404, "not_found", "Тут немає скрині.");
    const got = Object.fromEntries(Object.entries(item.f ?? {}).filter(([, n]) => n > 0));
    if (!Object.keys(got).length) throw conflict("empty", "📦 Скриня ще порожня — стрічка везе.");
    await r.hSet(key, id, JSON.stringify({ ...item, f: {} }));
    for (const [res, n] of Object.entries(got)) await addResourceToInventory(userId, res, n);
    return { got };
  }, id);
}

/** Для каталогу. */
export function beltsCatalog() {
  return {
    cost: BELT.cost,
    max: BELT.max,
    gapSec: BELT.gapMs / 1000,
    speed: BELT.speed,
    crateCap: BELT_CRATE.cap,
    crate: BELT_CRATE.kind,
    sources: Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, s.port])),
    sinks: Object.keys(SINKS),
    cutter: processorCatalog(FISH_CUTTER),
    // Усі обробники за видом (рибообробня, каменедробарка): клієнт рахує стіл кожного за його cutSec / energy.
    processors: Object.fromEntries(Object.values(PROCESSORS).map((p) => [p.kind, processorCatalog(p)])),
  };
}

function processorCatalog(p) {
  return { kind: p.kind, cutSec: p.cutMs / 1000, energy: p.energy, inCap: p.inCap, outCap: p.outCap, port: p.port };
}
