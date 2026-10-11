import { getRedis } from "../redisClient.js";
import { getDumosvitIntensity, newWordsPerDay } from "./intensity.js";
import { buildQuiz } from "./quiz.js";
import {
  LEARNED_BOX,
  introduceWord,
  loadSrs,
  newWordsToday,
} from "./srs.js";
import { DUMOSVIT_TIPS } from "./tips.js";
import { DUMOSVIT_VOCAB, isPhraseVocab } from "./words.js";

const LAST_KEY = (userId) => `svitodiy:dumosvit:last:${userId}`;

/** Частка порад/граматики серед доставок. */
const TIP_CHANCE = 0.08;
/** Поки стільки слів у коробках 0–1, нових не додаємо — спершу закріпити. */
const MAX_FRESH = 12;
/** Нові слова беремо з початку словника (від простого) з невеликим розкидом. */
const CURRICULUM_WINDOW = 12;

const VOCAB_BY_ES = new Map(DUMOSVIT_VOCAB.map((v) => [v.es, v]));

function vocabCard(v) {
  return { type: "vocab", es: v.es, uk: v.uk, ...(v.tag ? { tag: v.tag } : {}) };
}

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Випадковий елемент, не рівний попередньому (якщо є вибір). */
function pickAvoiding(arr, key, last) {
  const pool = arr.length > 1 ? arr.filter((x) => key(x) !== last) : arr;
  return randomOf(pool.length ? pool : arr);
}

/**
 * Що надіслати наступним:
 * 1) слово, якому настав час повторення, — тест;
 * 2) нове слово за програмою (у межах денного ліміту) — картка;
 * 3) додаткова практика: тест на найслабші з уже бачених слів;
 * інколи — порада з граматики.
 * @param {number} userId
 * @returns {Promise<{ kind: "card", entry: object } | ({ kind: "quiz" } & object)>}
 */
export async function pickDumosvitDelivery(userId) {
  const redis = getRedis();
  const last = await redis.get(LAST_KEY(userId));
  const remember = (k) => redis.setEx(LAST_KEY(userId), 86400 * 30, k);

  if (DUMOSVIT_TIPS.length > 0 && Math.random() < TIP_CHANCE) {
    const tip = pickAvoiding(DUMOSVIT_TIPS, (t) => `tip:${t.title}`, last);
    await remember(`tip:${tip.title}`);
    return { kind: "card", entry: { type: "tip", ...tip } };
  }

  const [srs, level, newToday] = await Promise.all([
    loadSrs(userId),
    getDumosvitIntensity(userId),
    newWordsToday(userId),
  ]);
  const now = Date.now();

  const seen = [];
  let fresh = 0;
  for (const [es, rec] of srs) {
    const entry = VOCAB_BY_ES.get(es);
    if (!entry) continue; // слово прибрали зі словника
    seen.push({ entry, rec });
    if (rec.box <= 1) fresh++;
  }

  const quizOn = async ({ entry, rec }) => {
    const q = await buildQuiz(userId, entry, rec.box);
    if (!q) return null;
    await remember(entry.es);
    return { kind: "quiz", ...q };
  };

  // 1) Дозрілі: спершу найслабші, серед них — ті, що чекають найдовше.
  const due = seen
    .filter((x) => x.rec.due <= now)
    .sort((a, b) => a.rec.box - b.rec.box || a.rec.due - b.rec.due);
  if (due.length) {
    const top = due.slice(0, 3);
    const q = await quizOn(pickAvoiding(top, (x) => x.entry.es, last));
    if (q) return q;
  }

  // 2) Нове слово за програмою.
  if (newToday < newWordsPerDay(level) && fresh < MAX_FRESH) {
    const unseen = DUMOSVIT_VOCAB.filter((v) => !srs.has(v.es)).slice(0, CURRICULUM_WINDOW);
    if (unseen.length) {
      const entry = randomOf(unseen);
      await introduceWord(userId, entry.es);
      await remember(entry.es);
      return { kind: "card", entry: { ...vocabCard(entry), isNew: true } };
    }
  }

  // 3) Додаткова практика на найслабших словах.
  if (seen.length) {
    const weakest = [...seen]
      .sort((a, b) => a.rec.box - b.rec.box || b.rec.wrong - a.rec.wrong)
      .slice(0, 8);
    const q = await quizOn(pickAvoiding(weakest, (x) => x.entry.es, last));
    if (q) return q;
  }

  const entry = pickAvoiding(DUMOSVIT_VOCAB, (v) => v.es, last);
  await remember(entry.es);
  return { kind: "card", entry: vocabCard(entry) };
}

/** Зведення прогресу для меню бота й міні-апки. */
export async function getDumosvitProgress(userId) {
  const [srs, level, newToday] = await Promise.all([
    loadSrs(userId),
    getDumosvitIntensity(userId),
    newWordsToday(userId),
  ]);
  const now = Date.now();
  let seen = 0;
  let learned = 0;
  let due = 0;
  for (const [es, rec] of srs) {
    if (!VOCAB_BY_ES.has(es)) continue;
    seen++;
    if (rec.box >= LEARNED_BOX) learned++;
    if (rec.due <= now) due++;
  }
  return {
    total: DUMOSVIT_VOCAB.length,
    seen,
    learned,
    learning: seen - learned,
    due,
    newToday: Math.min(newToday, newWordsPerDay(level)),
    newPerDay: newWordsPerDay(level),
  };
}

export function formatDumosvitProgress(p) {
  return (
    `📊 <b>Прогрес:</b> вивчено ${p.learned} · у процесі ${p.learning} · ` +
    `до повторення ${p.due}\n` +
    `🆕 Нових сьогодні: ${p.newToday}/${p.newPerDay} · у словнику: ${p.total}`
  );
}

export function formatDumosvitCaption(entry) {
  const footer = `\n\n<i>«Далі» — наступна картка, «Окей» — прибрати це повідомлення.</i>`;

  if (entry.type === "tip") {
    const safeTitle = escapeHtml(entry.title);
    const safeBody = escapeHtml(entry.body);
    const ex = entry.exampleEs
      ? `\n\n<b>${escapeHtml(entry.exampleEs)}</b>`
      : "";
    return (
      `📖 <b>Думосвіт</b> · 💡 <i>${safeTitle}</i>\n\n` +
      `${safeBody}` +
      ex +
      footer
    );
  }

  const safeEs = escapeHtml(entry.es);
  const safeUk = escapeHtml(entry.uk);
  const kind = isPhraseVocab(entry) ? "💬 <b>Фраза</b>" : "🔤 <b>Слово</b>";
  const kindLine = entry.isNew ? `🆕 <b>Нове</b> · ${kind}` : kind;
  const hint = entry.isNew ? `\n\n<i>Запам’ятай — скоро перевіримо в тесті.</i>` : "";
  return (
    `📖 <b>Думосвіт</b> · ${kindLine}\n\n` +
    `<b>${safeEs}</b>\n` +
    `${safeUk}` +
    hint +
    footer
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
