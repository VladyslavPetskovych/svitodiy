import { getRedis } from "../redisClient.js";
import { DUMOSVIT_TIPS } from "./tips.js";
import { DUMOSVIT_VOCAB } from "./words.js";

const LAST_KEY = (userId) => `svitodiy:dumosvit:lastIdx:${userId}`;

const DUMOSVIT_ENTRIES = [
  ...DUMOSVIT_VOCAB.map((x) => ({
    type: "vocab",
    es: x.es,
    uk: x.uk,
    ...(x.tag ? { tag: x.tag } : {}),
  })),
  ...DUMOSVIT_TIPS.map((x) => ({
    type: "tip",
    title: x.title,
    body: x.body,
    ...(x.exampleEs ? { exampleEs: x.exampleEs } : {}),
  })),
];

function isPhraseVocab(entry) {
  if (entry.tag === "phrase") return true;
  if (entry.tag === "word") return false;
  return /\s/.test(String(entry.es).trim());
}

/**
 * Випадкова картка (слово, фраза або підказка), намагаємось не повторювати попередню для цього користувача.
 * @param {number} telegramUserId
 */
export async function pickDumosvitWord(telegramUserId) {
  if (DUMOSVIT_ENTRIES.length === 0) {
    return { type: "vocab", es: "?", uk: "нема записів у словнику" };
  }

  const redis = getRedis();
  const prevRaw = await redis.get(LAST_KEY(telegramUserId));
  const prev = prevRaw == null ? -1 : Number(prevRaw);

  let idx = Math.floor(Math.random() * DUMOSVIT_ENTRIES.length);
  if (DUMOSVIT_ENTRIES.length > 1) {
    let guard = 0;
    while (idx === prev && guard++ < 12) {
      idx = Math.floor(Math.random() * DUMOSVIT_ENTRIES.length);
    }
  }

  await redis.setEx(LAST_KEY(telegramUserId), 86400 * 30, String(idx));
  return DUMOSVIT_ENTRIES[idx];
}

export function formatDumosvitCaption(entry) {
  const footer = `\n\n<i>Після перегляду натисни «Окей» — повідомлення зникне.</i>`;

  if (entry.type === "tip") {
    const safeTitle = escapeHtml(entry.title);
    const safeBody = escapeHtml(entry.body);
    const ex = entry.exampleEs
      ? `\n\n🇪🇸 <b>${escapeHtml(entry.exampleEs)}</b>`
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
  const kindLine = isPhraseVocab(entry) ? "💬 <b>Фраза</b>" : "🔤 <b>Слово</b>";
  return (
    `📖 <b>Думосвіт</b> · ${kindLine}\n\n` +
    `<b>${safeEs}</b>\n` +
    `🇺🇦 ${safeUk}` +
    footer
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
