import { getRedis } from "../redisClient.js";

/**
 * Інтервальні повторення (коробки Лейтнера) для кожного користувача.
 * Hash: поле — іспанський запис (es), значення — "box|dueMs|right|wrong".
 * Правильна відповідь на «дозріле» слово — у наступну коробку (довша пауза),
 * помилка — назад у коробку 0 (повторимо за хвилину).
 */
const KEY = (userId) => `svitodiy:dumosvit:srs:${userId}`;
const NEW_KEY = (userId, day) => `svitodiy:dumosvit:new:${userId}:${day}`;

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Через скільки повторити слово з коробки N. */
export const BOX_INTERVALS_MS = [
  1 * MIN, // 0 — щойно побачене або помилка
  10 * MIN,
  1 * HOUR,
  8 * HOUR,
  1 * DAY,
  3 * DAY,
  7 * DAY,
  21 * DAY,
];
export const MAX_BOX = BOX_INTERVALS_MS.length - 1;
/** З цієї коробки слово вважаємо вивченим. */
export const LEARNED_BOX = 4;

/** Дата YYYY-MM-DD за Києвом — межа доби для ліміту нових слів. */
export function kyivDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(date);
}

function parse(raw) {
  const [box, due, right, wrong] = String(raw).split("|").map(Number);
  return {
    box: Math.min(MAX_BOX, Math.max(0, box || 0)),
    due: due || 0,
    right: right || 0,
    wrong: wrong || 0,
  };
}

function serialize(r) {
  return `${r.box}|${r.due}|${r.right}|${r.wrong}`;
}

/** Невеликий розкид (±10%), щоб слова з однієї сесії не «дозрівали» пачкою. */
function intervalFor(box) {
  const base = BOX_INTERVALS_MS[box] ?? BOX_INTERVALS_MS[MAX_BOX];
  return Math.round(base * (0.9 + Math.random() * 0.2));
}

/** @returns {Promise<Map<string, { box: number, due: number, right: number, wrong: number }>>} */
export async function loadSrs(userId) {
  const all = await getRedis().hGetAll(KEY(userId));
  const map = new Map();
  for (const [es, raw] of Object.entries(all)) map.set(es, parse(raw));
  return map;
}

/** Скільки нових слів уже показано сьогодні. */
export async function newWordsToday(userId) {
  const raw = await getRedis().get(NEW_KEY(userId, kyivDay()));
  return Number(raw ?? 0);
}

/** Слово вперше показали карткою — ставимо в коробку 0, скоро буде тест. */
export async function introduceWord(userId, es) {
  const r = getRedis();
  const added = await r.hSetNX(KEY(userId), es, serialize({ box: 0, due: Date.now() + BOX_INTERVALS_MS[0], right: 0, wrong: 0 }));
  if (!added) return;
  const key = NEW_KEY(userId, kyivDay());
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, 2 * 86_400);
}

/**
 * Записати відповідь на тест.
 * Слово, яке ще не «дозріло» (додаткова практика), за правильну відповідь не підвищуємо —
 * інакше коробки злітали б за одну сесію.
 */
export async function recordAnswer(userId, es, correct) {
  const r = getRedis();
  const raw = await r.hGet(KEY(userId), es);
  const rec = raw ? parse(raw) : { box: 0, due: 0, right: 0, wrong: 0 };
  const now = Date.now();
  const wasDue = rec.due <= now;
  const prevBox = rec.box;

  if (correct) {
    rec.right++;
    if (wasDue) {
      rec.box = Math.min(MAX_BOX, rec.box + 1);
      rec.due = now + intervalFor(rec.box);
    }
  } else {
    rec.wrong++;
    rec.box = 0;
    rec.due = now + BOX_INTERVALS_MS[0];
  }

  await r.hSet(KEY(userId), es, serialize(rec));
  return { ...rec, prevBox };
}
