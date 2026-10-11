import { getDumosvitGoal, recordPractice } from "./goal.js";
import { getDumosvitIntensity, newWordsPerDay } from "./intensity.js";
import {
  VOCAB_BY_ES,
  buildQuiz,
  norm,
  saveSession,
  shuffle,
  takeSession,
} from "./quiz.js";
import { introduceWord, loadSrs, newWordsToday, recordAnswer } from "./srs.js";
import { DUMOSVIT_VOCAB } from "./words.js";

/**
 * Додаткові режими Думосвіту для міні-апки: письмо, слух, речення, пари.
 * Усі пишуть результат у ті самі коробки повторень і в денну ціль.
 */

/** Скільки слів треба вже знати, щоб відкрились «Письмо», «Слух» і «Пари». */
export const MIN_SEEN_WORDS = 5;
const PAIRS_COUNT = 5;
/** Пари — легкий режим: раунд з 5 пар зараховуємо як 3 вправи. */
const PAIRS_GOAL_CREDIT = 3;

const words = (es) => norm(es).split(" ").filter(Boolean);
const BUILDABLE = DUMOSVIT_VOCAB.filter((v) => words(v.es).length >= 3);

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Випадковий із перших n — щоб не крутити те саме слово підряд. */
function pickTop(list, n) {
  return list[Math.floor(Math.random() * Math.min(n, list.length))];
}

/** Уже бачені слова за пріоритетом: дозрілі → найслабша коробка → найдовше чекають. */
async function practicePool(userId, filter = () => true) {
  const srs = await loadSrs(userId);
  const now = Date.now();
  const seen = [];
  for (const [es, rec] of srs) {
    const entry = VOCAB_BY_ES.get(es);
    if (entry && filter(entry)) seen.push({ entry, rec, isDue: rec.due <= now });
  }
  seen.sort(
    (a, b) =>
      Number(b.isDue) - Number(a.isDue) || a.rec.box - b.rec.box || a.rec.due - b.rec.due
  );
  return { seen, srs };
}

function locked(mode, seenCount) {
  return {
    mode,
    locked: true,
    message:
      `Спершу познайомся хоча б із ${MIN_SEEN_WORDS} словами в режимі «Повторення» ` +
      `(зараз: ${seenCount}). Цей режим тренує вже знайомі слова.`,
  };
}

/* ───────── ✍️ Письмо: бачиш українською — пишеш іспанською ───────── */

/** «Más despacio» → «M__ d______»: перша літера кожного слова. */
function makeHint(es) {
  return String(es).replace(/\p{L}+/gu, (w) => w[0] + "_".repeat(w.length - 1));
}

export async function buildWriteExercise(userId) {
  const { seen } = await practicePool(userId);
  if (seen.length < MIN_SEEN_WORDS) return locked("write", seen.length);
  const { entry, rec } = pickTop(seen, 5);
  const token = await saveSession({ kind: "write", userId, es: entry.es });
  return { mode: "write", token, prompt: entry.uk, hint: makeHint(entry.es), box: rec.box };
}

function stripAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/**
 * exact — ідеально; accents — лише наголоси / ñ; typo — одна описка в довгому слові;
 * wrong — ні. accents і typo зараховуємо, але показуємо правильне написання.
 */
function gradeWritten(typed, entry) {
  const t = norm(typed);
  if (!t) return "wrong";
  // Будь-який запис з тим самим перекладом теж правильний.
  const answers = DUMOSVIT_VOCAB.filter((v) => norm(v.uk) === norm(entry.uk)).map((v) => norm(v.es));
  if (answers.includes(t)) return "exact";
  if (answers.some((a) => stripAccents(a) === stripAccents(t))) return "accents";
  if (answers.some((a) => a.length >= 5 && levenshtein(stripAccents(a), stripAccents(t)) <= 1)) {
    return "typo";
  }
  return "wrong";
}

/* ───────── 🎧 Слух: чуєш іспанською — обираєш переклад ───────── */

export async function buildListenExercise(userId) {
  const { seen } = await practicePool(userId);
  if (seen.length < MIN_SEEN_WORDS) return locked("listen", seen.length);
  const { entry, rec } = pickTop(seen, 5);
  const q = await buildQuiz(userId, entry, rec.box, { direction: "es-uk" });
  if (!q) return locked("listen", seen.length);
  // speak — текст для синтезу мовлення; клієнт показує його лише після відповіді.
  return { mode: "listen", token: q.token, speak: entry.es, options: q.options, box: rec.box };
}

/* ───────── 🧱 Речення: склади фразу зі слів ───────── */

export async function buildSentenceExercise(userId) {
  const [{ seen, srs }, level, newToday] = await Promise.all([
    practicePool(userId, (v) => words(v.es).length >= 3),
    getDumosvitIntensity(userId),
    newWordsToday(userId),
  ]);

  let entry;
  let isNew = false;
  const due = seen.filter((x) => x.isDue);
  const unseen = BUILDABLE.filter((v) => !srs.has(v.es)).slice(0, 10);
  if (due.length) {
    entry = pickTop(due, 5).entry;
  } else if (unseen.length && (newToday < newWordsPerDay(level) || seen.length === 0)) {
    entry = randomOf(unseen);
    isNew = true;
    await introduceWord(userId, entry.es);
  } else if (seen.length) {
    entry = pickTop(seen, 6).entry;
  } else {
    entry = randomOf(BUILDABLE);
  }

  const answer = words(entry.es);
  // Два зайві слова з інших фраз — щоб не складалось механічно.
  const extra = [];
  for (const v of shuffle(BUILDABLE)) {
    for (const w of words(v.es)) {
      if (!answer.includes(w) && !extra.includes(w)) extra.push(w);
      if (extra.length >= 2) break;
    }
    if (extra.length >= 2) break;
  }

  let tiles = shuffle([...answer, ...extra]);
  for (let i = 0; i < 5 && tiles.join(" ").startsWith(answer.join(" ")); i++) tiles = shuffle(tiles);

  const token = await saveSession({ kind: "build", userId, es: entry.es });
  return { mode: "build", token, prompt: entry.uk, tiles, count: answer.length, isNew };
}

/**
 * Перевірка текстових вправ (письмо й речення).
 * @returns {Promise<null | { mode: string, correct: boolean, verdict: string, es: string, uk: string, box: number, prevBox: number, goal: object }>}
 */
export async function checkTextExercise(userId, token, text) {
  const session = await takeSession(userId, token);
  if (!session || (session.kind !== "write" && session.kind !== "build")) return null;
  const entry = VOCAB_BY_ES.get(session.es);
  if (!entry) return null;

  const typed = String(text ?? "").slice(0, 200);
  const verdict =
    session.kind === "write"
      ? gradeWritten(typed, entry)
      : norm(typed) === words(entry.es).join(" ")
        ? "exact"
        : "wrong";
  const correct = verdict !== "wrong";

  const rec = await recordAnswer(userId, entry.es, correct);
  const goal = await recordPractice(userId);
  return {
    mode: session.kind,
    correct,
    verdict,
    es: entry.es,
    uk: entry.uk,
    box: rec.box,
    prevBox: rec.prevBox,
    goal,
  };
}

/* ───────── 🧩 Пари: зіставити 5 слів із перекладами ───────── */

export async function buildPairsExercise(userId) {
  const { seen } = await practicePool(userId, (v) => v.es.length <= 24 && v.uk.length <= 32);
  if (seen.length < PAIRS_COUNT) return locked("pairs", seen.length);

  // 3 найпріоритетніші + решта випадкові з уже бачених.
  const ordered = [...seen.slice(0, 3), ...shuffle(seen.slice(3))];
  const picked = [];
  const usedEs = new Set();
  const usedUk = new Set();
  for (const { entry } of ordered) {
    const e = norm(entry.es);
    const u = norm(entry.uk);
    if (usedEs.has(e) || usedUk.has(u)) continue;
    usedEs.add(e);
    usedUk.add(u);
    picked.push(entry);
    if (picked.length >= PAIRS_COUNT) break;
  }
  if (picked.length < PAIRS_COUNT) return locked("pairs", seen.length);

  const token = await saveSession({ kind: "pairs", userId, es: picked.map((p) => p.es) });
  return { mode: "pairs", token, pairs: shuffle(picked).map((p) => ({ es: p.es, uk: p.uk })) };
}

/**
 * Результат раунду пар: [{ es, mistakes }]. Слово без помилок — правильна відповідь.
 * Приймаємо лише слова з цього раунду й лише один раз (токен).
 */
export async function submitPairs(userId, token, results) {
  const session = await takeSession(userId, token);
  if (!session || session.kind !== "pairs" || !Array.isArray(results)) return null;
  const allowed = new Set(session.es);

  const recorded = [];
  for (const r of results) {
    if (typeof r?.es !== "string" || !allowed.has(r.es)) continue;
    allowed.delete(r.es);
    const correct = !(Number(r.mistakes) > 0);
    await recordAnswer(userId, r.es, correct);
    recorded.push({ es: r.es, correct });
  }
  const goal = recorded.length
    ? await recordPractice(userId, PAIRS_GOAL_CREDIT)
    : { ...(await getDumosvitGoal(userId)), reachedNow: false, bonus: 0 };
  return { recorded, goal };
}

