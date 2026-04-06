import crypto from "crypto";
import { getRedis } from "../redisClient.js";
import { DUMOSVIT_VOCAB } from "./words.js";

const PREFIX = "svitodiy:dumosvit:quiz:";
const TTL_SEC = 600;
/** Ймовірність тесту серед карток Думосвіту (решта — слово/фраза/підказка як раніше). */
export const DUMOSVIT_QUIZ_CHANCE = 0.32;

function normUk(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {number} userId
 * @returns {Promise<null | { es: string, options: string[], correctIndex: number, token: string }>}
 */
export async function buildQuiz(userId) {
  const vocab = DUMOSVIT_VOCAB;
  if (vocab.length < 8) return null;

  const correctEntry = vocab[Math.floor(Math.random() * vocab.length)];
  const correctUk = correctEntry.uk.trim();
  const correctNorm = normUk(correctUk);

  const others = vocab
    .filter((v) => normUk(v.uk) !== correctNorm)
    .map((v) => v.uk.trim());
  const uniqueWrong = [];
  const seen = new Set();
  for (const u of shuffle(others)) {
    const n = normUk(u);
    if (seen.has(n) || n === correctNorm) continue;
    seen.add(n);
    uniqueWrong.push(u);
    if (uniqueWrong.length >= 3) break;
  }
  if (uniqueWrong.length < 3) return null;

  const options = shuffle([correctUk, ...uniqueWrong.slice(0, 3)]);
  const correctIndex = options.findIndex((o) => normUk(o) === correctNorm);

  const token = crypto.randomBytes(4).toString("hex");
  const payload = JSON.stringify({ correctIndex, userId });
  await getRedis().setEx(`${PREFIX}${token}`, TTL_SEC, payload);

  return {
    es: correctEntry.es,
    options,
    correctIndex,
    token,
  };
}

/** @returns {Promise<{ correctIndex: number, userId: number } | null>} */
export async function getQuizSession(token) {
  const raw = await getRedis().get(`${PREFIX}${token}`);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (
      typeof o.correctIndex !== "number" ||
      typeof o.userId !== "number"
    ) {
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

export async function deleteQuizSession(token) {
  await getRedis().del(`${PREFIX}${token}`);
}

export function formatQuizCaption(es) {
  const safe = escapeHtml(es);
  return (
    `📖 <b>Думосвіт</b> · 🧪 <b>Тест</b>\n\n` +
    `🇪🇸 <b>${safe}</b>\n\n` +
    `Обери правильний переклад українською:`
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
 * @param {string[]} optionsUk
 */
export function quizKeyboard(token, optionsUk) {
  const rows = [];
  for (let i = 0; i < optionsUk.length; i++) {
    const label = truncateOption(optionsUk[i], 42);
    rows.push([{ text: `${i + 1}. ${label}`, callback_data: `dq_${token}_${i}` }]);
  }
  return { inline_keyboard: rows };
}

function truncateOption(s, max) {
  const t = String(s).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
