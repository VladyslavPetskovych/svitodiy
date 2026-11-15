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
 * Прокрутити стіл рибообробні до now: кожна риба — cutMs після того, як доїхала й звільнився ніж;
 * усе з її нутрощів — у o з міткою, коли готове. Повертає новий запис (старий не чіпає) і used —
 * скільки Вт·год пішло (по energy за рибу).
 * energy — скільки Вт·год є в мережі (0 — нема струму чи нема стрічки з жолоба: ніж стоїть).
 * roll — що всередині однієї риби (для тестів можна підставити своє).
 * @returns {{ item: object, used: number }}
 */
export function cutUntil(item, now, energy = 0, roll = rollCookDrops) {
  const input = [...(item.in ?? [])].sort((a, b) => a[0] - b[0]);
  const out = [...(item.o ?? [])];
  let free = Number(item.cb) || 0;
  let left = energy;
  let used = 0;
  while (input.length) {
    // Повно нарізаного чи бракує струму — ніж стоїть; відлік далі — з цієї миті, а не з минулого.
    if (out.length >= FISH_CUTTER.outCap || left + 1e-9 < FISH_CUTTER.energy) {
      free = Math.max(free, now);
      break;
    }
    const done = Math.max(Number(input[0][0]) || 0, free) + FISH_CUTTER.cutMs;
    if (done > now) break;
    input.shift();
    left -= FISH_CUTTER.energy;
    used += FISH_CUTTER.energy;
    for (const [id, n] of Object.entries(roll())) for (let i = 0; i < n; i++) out.push([done, id]);
    free = done;
  }
  return { item: { ...item, in: input, o: out, cb: free }, used };
}

/** Що повернути, коли рибообробню розбирають: риба зі столу й усе нарізане. */
export function cutterRefund(item) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [, id] of [...(item?.in ?? []), ...(item?.o ?? [])]) if (typeof id === "string") out[id] = (out[id] ?? 0) + 1;
  return out;
}
