import { getFishMeta, rollCookDrops } from "../bot.js";

/**
 * Рибообробня — менша споруда конвеєра (лише Mini App): стрічка привозить рибу, тут її розбирають
 * і все, що було всередині (те саме, що випадає, коли готуєш рибу, — cookDrops.js: кістки, очі,
 * водорості, монети, насіння…), віддають через жолоб праворуч далі на стрічку. Нема стрічки з жолоба —
 * нарізане чекає, поки заберуть тапом.
 *
 * Працює лише від струму (кабель до мережі з акумулятором, energy Вт·год за рибу) і лише коли з жолоба
 * йде стрічка до приймача: нарізаному нема куди падати — ніж стоїть. Тапом нарізане не забирають — тільки стрічкою.
 *
 * Налаштування й чиста логіка без залежностей від решти гри (decor.js і belts.js беруть звідси
 * без кругових імпортів). Сам конвеєр — у belts.js: рибообробня там і приймач (як скриня), і джерело (як хата).
 *
 * Запис декору (decoKey):
 *   in — риба на столі в черзі [[коли доїхала, id]]; більше inCap (разом з тією, що вже їде стрічкою) не приймає;
 *   cb — коли ніж звільнився після останньої риби (наступна — не раніше);
 *   o  — нарізане, що чекає на жолоб [[коли готове, id]]; набралось outCap — ніж стоїть, поки не розвантажать.
 * Рахуємо ліниво, як і решту конвеєра: cutUntil прокручує стіл до потрібної миті.
 *
 * port — жолоб праворуч, нижній ряд (px від якоря — низ по центру): клітинка одразу за «ніжками».
 */
export const FISH_CUTTER = {
  kind: "fish_cutter",
  foot: [4, 2],
  cutMs: 4000,
  // Електричний тесак і транспортер — ненажерливі: Вт·год з акумуляторів своєї мережі за кожну рибу
  // (рибальська хата бере 1 за рибу; повний акумулятор, 50 Вт·год, — це 10 риб).
  energy: 5,
  inCap: 6,
  outCap: 30,
  port: { side: "right", dx: 20, dy: -4 },
};

/** Чи це риба (лише її рибообробня бере зі стрічки). */
export const isFish = (id) => !!getFishMeta(id);

/**
 * Каменедробарка — друга споруда-обробник конвеєра (лише Mini App), пара до рибообробні: стрічка привозить
 * камінь із шахти, щелепи дроблять його, а все, що було в породі (STONE_DROPS: уламки скла, брухт, старі монети,
 * мушлі-скам'янілості, рідше срібло, кварц і обсидіан), жолоб праворуч віддає далі на стрічку до скрині.
 * Працює так само: струм з мережі (energy Вт·год за камінь) і стрічка з жолоба до скрині, інакше щелепи стоять.
 * Записи декору — ті самі поля, що й у рибообробні (in / cb / o).
 */
export const STONE_CRUSHER = {
  kind: "stone_crusher",
  foot: [4, 2],
  cutMs: 3000,
  energy: 3,
  inCap: 8,
  outCap: 30,
  port: { side: "right", dx: 20, dy: -4 },
};

/** Що трапляється в одному камені (ваговий вибір). Каменю серед них нема — по колу нічого не їздить. */
export const STONE_DROPS = [
  { id: "glass_shard", weight: 24 },
  { id: "metal_scrap", weight: 22 },
  { id: "old_coin", weight: 12 },
  { id: "shell", weight: 12 },
  { id: "silver_piece", weight: 5 },
  { id: "quartz", weight: 4 },
  { id: "obsidian", weight: 1 },
];
/** Шанс, що з каменя випаде ще одна річ (друга — так само з таблиці). */
export const STONE_EXTRA = 0.25;

/** Що всередині одного каменю: { id: кількість }. rand — для тестів. */
export function rollStoneDrops(rand = Math.random) {
  const total = STONE_DROPS.reduce((s, e) => s + e.weight, 0);
  const pick = () => {
    let r = rand() * total;
    for (const e of STONE_DROPS) if ((r -= e.weight) < 0) return e.id;
    return STONE_DROPS[STONE_DROPS.length - 1].id;
  };
  /** @type {Record<string, number>} */
  const out = {};
  const n = rand() < STONE_EXTRA ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const id = pick();
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

/**
 * Усі обробники конвеєра за видом декору: що беруть зі стрічки (accepts) і що з того виходить (roll).
 * belts.js і decor.js працюють з ними однаково — новий обробник досить додати сюди (і в DECOR / клієнт).
 */
export const PROCESSORS = {
  [FISH_CUTTER.kind]: { ...FISH_CUTTER, accepts: isFish, roll: () => rollCookDrops() },
  [STONE_CRUSHER.kind]: { ...STONE_CRUSHER, accepts: (id) => id === "stone", roll: () => rollStoneDrops() },
};

/** Чи це обробник (рибообробня, каменедробарка). */
export const isProcessor = (k) => !!PROCESSORS[k];

/**
 * Прокрутити стіл обробника (рибообробні чи каменедробарки — за item.k) до now: кожна річ — cutMs після того,
 * як доїхала й звільнився ніж; усе, що з неї вийшло, — у o з міткою, коли готове. Повертає новий запис
 * (старий не чіпає) і used — скільки Вт·год пішло (по energy за річ).
 * energy — скільки Вт·год є в мережі (0 — нема струму чи нема стрічки з жолоба: ніж стоїть).
 * roll — що всередині однієї речі (для тестів можна підставити своє).
 * @returns {{ item: object, used: number }}
 */
export function cutUntil(item, now, energy = 0, roll) {
  const def = PROCESSORS[item?.k] ?? PROCESSORS[FISH_CUTTER.kind];
  const open = roll ?? def.roll;
  const input = [...(item.in ?? [])].sort((a, b) => a[0] - b[0]);
  const out = [...(item.o ?? [])];
  let free = Number(item.cb) || 0;
  let left = energy;
  let used = 0;
  while (input.length) {
    // Повно готового чи бракує струму — ніж стоїть; відлік далі — з цієї миті, а не з минулого.
    if (out.length >= def.outCap || left + 1e-9 < def.energy) {
      free = Math.max(free, now);
      break;
    }
    const done = Math.max(Number(input[0][0]) || 0, free) + def.cutMs;
    if (done > now) break;
    input.shift();
    left -= def.energy;
    used += def.energy;
    for (const [id, n] of Object.entries(open())) for (let i = 0; i < n; i++) out.push([done, id]);
    free = done;
  }
  return { item: { ...item, in: input, o: out, cb: free }, used };
}

/** Що повернути, коли обробник розбирають: що лежало на столі й усе готове. */
export function cutterRefund(item) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [, id] of [...(item?.in ?? []), ...(item?.o ?? [])]) if (typeof id === "string") out[id] = (out[id] ?? 0) + 1;
  return out;
}
