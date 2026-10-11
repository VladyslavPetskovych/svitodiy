import crypto from "crypto";
import { getRedis } from "../redisClient.js";
import { recordPractice } from "./goal.js";
import { MAX_BOX, recordAnswer } from "./srs.js";
import { DUMOSVIT_VOCAB, isPhraseVocab } from "./words.js";

const PREFIX = "svitodiy:dumosvit:quiz:";
/** Вправа живе добу: нагадування в чаті можуть лежати непрочитаними кілька годин. */
const TTL_SEC = 86_400;

/** З цієї коробки частину тестів даємо «навпаки» (українська → іспанська). */
const REVERSE_FROM_BOX = 2;
const REVERSE_CHANCE = 0.5;

export const VOCAB_BY_ES = new Map(DUMOSVIT_VOCAB.map((v) => [v.es, v]));

export function norm(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[¿?¡!.,…]/g, "")
    .replace(/\s+/g, " ");
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 3 неправильні варіанти: спершу того ж типу (слово до слова, фраза до фрази),
 * щоб відповідь не вгадувалась за довжиною.
 */
export function pickDistractors(entry, field) {
  const correctEs = norm(entry.es);
  const correctUk = norm(entry.uk);
  const phrase = isPhraseVocab(entry);
  const candidates = DUMOSVIT_VOCAB.filter(
    (v) => norm(v.es) !== correctEs && norm(v.uk) !== correctUk
  );
  const sameKind = shuffle(candidates.filter((v) => isPhraseVocab(v) === phrase));
  const rest = shuffle(candidates.filter((v) => isPhraseVocab(v) !== phrase));

  const out = [];
  const seen = new Set([norm(entry[field])]);
  for (const v of [...sameKind, ...rest]) {
    const n = norm(v[field]);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(v[field].trim());
    if (out.length >= 3) break;
  }
  return out;
}

/** Зберегти вправу (відповідь лишається на сервері) — повертає токен. */
export async function saveSession(payload) {
  const token = crypto.randomBytes(4).toString("hex");
  await getRedis().setEx(`${PREFIX}${token}`, TTL_SEC, JSON.stringify(payload));
  return token;
}

/**
 * Забрати вправу для перевірки: лише власник і лише один раз
 * (del повертає 0, якщо інший запит уже забрав її — подвійне натискання).
 */
export async function takeSession(userId, token) {
  const key = `${PREFIX}${token}`;
  const raw = await getRedis().get(key);
  if (!raw) return null;
  let o;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (o?.userId !== userId) return null;
  if ((await getRedis().del(key)) === 0) return null;
  return o;
}

/**
 * Тест на конкретне слово.
 * @param {number} userId
 * @param {{ es: string, uk: string }} entry
 * @param {number} box поточна коробка слова (від неї залежить напрям)
 * @param {{ direction?: "es-uk" | "uk-es" }} [opts] примусовий напрям (режим «Слух»)
 */
export async function buildQuiz(userId, entry, box = 0, opts = {}) {
  const direction =
    opts.direction ??
    (box >= REVERSE_FROM_BOX && Math.random() < REVERSE_CHANCE ? "uk-es" : "es-uk");
  const field = direction === "es-uk" ? "uk" : "es";
  const prompt = direction === "es-uk" ? entry.es : entry.uk;

  const wrong = pickDistractors(entry, field);
  if (wrong.length < 3) return null;

  const correct = entry[field].trim();
  const options = shuffle([correct, ...wrong]);
  const correctIndex = options.indexOf(correct);

  const token = await saveSession({ kind: "quiz", correctIndex, userId, es: entry.es, direction, box });
  return { direction, prompt, options, correctIndex, token, box };
}

/**
 * Перевірити відповідь і записати її в інтервальні повторення та денну ціль.
 * Спільне для бота й міні-апки.
 * @returns {Promise<null | {
 *   correct: boolean, correctIndex: number, es: string|null, uk: string|null,
 *   direction: string, prompt: string|null, box: number|null, prevBox: number|null,
 *   goal: object
 * }>} null — тест застарів, чужий або вже відповіли
 */
export async function answerDumosvitQuiz(userId, token, index) {
  const session = await takeSession(userId, token);
  if (!session || typeof session.correctIndex !== "number") return null;

  const correct = index === session.correctIndex;
  const entry = session.es ? VOCAB_BY_ES.get(session.es) : null;
  const direction = session.direction ?? "es-uk";

  let box = null;
  let prevBox = null;
  if (entry) {
    const rec = await recordAnswer(userId, entry.es, correct);
    box = rec.box;
    prevBox = rec.prevBox;
  }
  const goal = await recordPractice(userId);

  return {
    correct,
    correctIndex: session.correctIndex,
    es: entry?.es ?? null,
    uk: entry?.uk ?? null,
    direction,
    prompt: entry ? (direction === "es-uk" ? entry.es : entry.uk) : null,
    box,
    prevBox,
    goal,
  };
}

export function boxMeter(box) {
  const b = Math.max(0, Math.min(MAX_BOX, box ?? 0));
  return `${"●".repeat(b)}${"○".repeat(MAX_BOX - b)}`;
}

/**
 * @param {{ prompt: string, direction?: string, box?: number }} q
 */
export function formatQuizCaption({ prompt, direction = "es-uk", box }) {
  const safe = escapeHtml(prompt);
  const reverse = direction === "uk-es";
  const head = reverse ? "🧠 <b>Згадай іспанською</b>" : "🧪 <b>Тест</b>";
  const ask = reverse ? "Як це буде іспанською?" : "Обери правильний переклад українською:";
  const level = box ? `\n<i>Рівень слова: ${boxMeter(box)}</i>` : "";
  return `📖 <b>Думосвіт</b> · ${head}\n\n<b>${safe}</b>\n\n${ask}${level}`;
}

/** Рядок результату під тестом. */
export function formatQuizResult(res) {
  const pair =
    res.es && res.uk ? `<b>${escapeHtml(res.es)}</b> — ${escapeHtml(res.uk)}` : "";
  if (res.correct) {
    const up =
      res.box != null && res.prevBox != null && res.box > res.prevBox
        ? `\n📈 Рівень слова: ${boxMeter(res.box)}`
        : "";
    return `✅ <b>Вірно!</b>${pair ? ` ${pair}` : ""}${up}`;
  }
  return (
    `❌ <b>Невірно.</b>` +
    (pair ? `\nПравильно: ${pair}` : "") +
    `\n🔁 Повторимо найближчим часом.`
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {string} token
 * @param {string[]} options
 */
export function quizKeyboard(token, options) {
  const rows = [];
  for (let i = 0; i < options.length; i++) {
    const label = truncateOption(options[i], 42);
    rows.push([{ text: `${i + 1}. ${label}`, callback_data: `dq_${token}_${i}` }]);
  }
  return { inline_keyboard: rows };
}

function truncateOption(s, max) {
  const t = String(s).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
