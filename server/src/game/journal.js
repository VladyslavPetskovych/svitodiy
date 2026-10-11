import {
  ARC_DURATION_DAYS,
  DUMOSVIT_LEVELS,
  MAX_NOTE_LEN,
  addBalance,
  addNote,
  addTask,
  answerDumosvitQuiz,
  buildListenExercise,
  buildPairsExercise,
  buildSentenceExercise,
  buildWriteExercise,
  bumpArcMessageCounter,
  checkTextExercise,
  deleteNote,
  deleteTask,
  disableArc,
  dumosvitScheduleNext,
  dumosvitUnschedule,
  enableArc,
  getArcById,
  getArcState,
  getDumosvitGoal,
  getDumosvitProgress,
  getRedis,
  getTasks,
  hasNastiaAccess,
  listNotes,
  markTaskDone,
  pickArcMessage,
  pickDumosvitDelivery,
  setDumosvitIntensity,
  submitPairs,
  updateNote,
} from "../bot.js";
import { GAME_CONFIG } from "./catalog.js";
import { badRequest, conflict, forbidden } from "./errors.js";
import { kyivDay, quizRewardKey } from "./keys.js";

/* ───────── Думосвіт ─────────
 * У приватному чаті chatId === userId, тож налаштування й розклад
 * спільні з ботом: увімкнув нагадування в апці — картки прийдуть у чат. */

export async function setDumosvitSettings(userId, { intensity, reminders }) {
  if (intensity != null) {
    if (!DUMOSVIT_LEVELS.includes(intensity)) throw badRequest("Невідома частота.");
    await setDumosvitIntensity(userId, intensity);
  }
  if (reminders === true) await dumosvitScheduleNext(userId);
  if (reminders === false) await dumosvitUnschedule(userId);
  return {};
}

const DUMOSVIT_MODES = ["review", "write", "listen", "build", "pairs"];
const TOKEN_RE = /^[a-f0-9]{8}$/;

async function dumosvitMeta(userId) {
  const [progress, goal] = await Promise.all([getDumosvitProgress(userId), getDumosvitGoal(userId)]);
  return { progress, goal };
}

/** +✨ за правильну перевірену відповідь — спільний денний ліміт для всіх режимів. */
async function grantQuizReward(userId) {
  const key = quizRewardKey(userId, kyivDay());
  const n = await getRedis().incr(key);
  if (n === 1) await getRedis().expire(key, 2 * 86_400);
  if (n > GAME_CONFIG.quizDailyCap) return 0;
  await addBalance(userId, GAME_CONFIG.quizReward);
  return GAME_CONFIG.quizReward;
}

/**
 * Наступна вправа обраного режиму. Правильну відповідь клієнту не віддаємо —
 * лише після перевірки (окрім «Пар», де пари й так видно на екрані).
 */
export async function nextDumosvitCard(userId, mode = "review") {
  if (!DUMOSVIT_MODES.includes(mode)) throw badRequest("Невідомий режим.");
  let card;
  if (mode === "review") {
    const d = await pickDumosvitDelivery(userId);
    if (d.kind === "quiz") {
      const { token, prompt, direction, options, box } = d;
      card = { kind: "quiz", token, prompt, direction, options, box };
    } else {
      card = { kind: "card", ...d.entry };
    }
  } else {
    const build = {
      write: buildWriteExercise,
      listen: buildListenExercise,
      build: buildSentenceExercise,
      pairs: buildPairsExercise,
    }[mode];
    card = { kind: mode, ...(await build(userId)) };
  }
  return { card, ...(await dumosvitMeta(userId)) };
}

export async function answerQuiz(userId, token, index) {
  if (typeof token !== "string" || !TOKEN_RE.test(token) || !Number.isInteger(index)) {
    throw badRequest("Некоректна відповідь.");
  }
  const res = await answerDumosvitQuiz(userId, token, index);
  if (!res) throw conflict("expired", "Тест застарів — візьми новий.");

  const { correct, correctIndex, es, uk, box, prevBox } = res;
  const reward = correct ? await grantQuizReward(userId) : 0;
  return { correct, correctIndex, es, uk, box, prevBox, reward, ...(await dumosvitMeta(userId)), goal: res.goal };
}

/** Письмо й речення: перевірка введеного тексту. */
export async function checkDumosvitText(userId, token, text) {
  if (typeof token !== "string" || !TOKEN_RE.test(token) || typeof text !== "string") {
    throw badRequest("Некоректна відповідь.");
  }
  const res = await checkTextExercise(userId, token, text);
  if (!res) throw conflict("expired", "Вправа застаріла — візьми нову.");
  const reward = res.correct ? await grantQuizReward(userId) : 0;
  return { ...res, reward, ...(await dumosvitMeta(userId)), goal: res.goal };
}

/** Пари: результати раунду (без ✨ — лише повторення й денна ціль). */
export async function finishDumosvitPairs(userId, token, results) {
  if (typeof token !== "string" || !TOKEN_RE.test(token) || !Array.isArray(results)) {
    throw badRequest("Некоректний результат.");
  }
  const res = await submitPairs(userId, token, results.slice(0, 10));
  if (!res) throw conflict("expired", "Раунд застарів — почни новий.");
  return { ...res, ...(await dumosvitMeta(userId)), goal: res.goal };
}

/* ───────── Літописець ───────── */

export async function listTasks(userId) {
  const tasks = await getTasks(userId);
  // Порядок як у «Мої завдання» бота: невиконані зверху, далі за часом.
  tasks.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.remindAt ?? a.createdAt) - (b.remindAt ?? b.createdAt);
  });
  return { tasks };
}

export async function createTask(userId, { title, remindAt }) {
  const clean = typeof title === "string" ? title.trim() : "";
  if (!clean) throw badRequest("Напиши текст завдання.");
  let at = null;
  if (remindAt != null) {
    if (!Number.isFinite(remindAt)) throw badRequest("Некоректна дата.");
    if (remindAt <= Date.now()) throw badRequest("Ця дата вже минула.");
    at = remindAt;
  }
  // Нагадування надішле планувальник бота (litopys/scheduler.js) — ZSET спільний.
  const task = await addTask(userId, { title: clean, remindAt: at });
  return { task };
}

export async function completeTask(userId, taskId) {
  if (!(await markTaskDone(userId, String(taskId)))) throw conflict("missing", "Завдання не знайдено.");
  return {};
}

export async function removeTask(userId, taskId) {
  if (!(await deleteTask(userId, String(taskId)))) throw conflict("missing", "Завдання не знайдено.");
  return {};
}

/* ───────── Арки ───────── */

function requireArc(arcId) {
  const arc = typeof arcId === "string" ? getArcById(arcId) : null;
  if (!arc) throw badRequest("Невідома арка.");
  return arc;
}

/** Старт вмикає арку й вимикає інші. Першу фразу в чат надішле планувальник бота. */
export async function startArc(userId, arcId) {
  requireArc(arcId);
  if (!(await enableArc(userId, arcId))) throw conflict("active", "Ця арка вже активна.");
  return {};
}

export async function stopArc(userId, arcId) {
  requireArc(arcId);
  await disableArc(userId, arcId);
  return {};
}

/** Фраза й мікродія — аналог «Надіслати фразу зараз», але показуємо прямо в апці. */
export async function arcMessage(userId, arcId) {
  requireArc(arcId);
  const state = await getArcState(userId, arcId);
  if (!state.enabled || state.done) throw conflict("inactive", "Арка не активна.");
  const count = await bumpArcMessageCounter(userId, arcId);
  const day = Math.max(1, Math.min(state.day, ARC_DURATION_DAYS));
  return { message: { ...pickArcMessage(arcId, day, count), day } };
}

/* ───────── Дошка «Настя» ───────── */

async function requireBoard(userId) {
  if (!(await hasNastiaAccess(userId))) throw forbidden();
}

export async function getBoard(userId) {
  await requireBoard(userId);
  return { notes: await listNotes(), maxLen: MAX_NOTE_LEN };
}

export async function createNote(userId, authorName, text) {
  await requireBoard(userId);
  const res = await addNote({ text: String(text ?? ""), authorId: userId, authorName });
  if (!res.ok) {
    throw res.reason === "limit" ? conflict("limit", "Дошка заповнена.") : badRequest("Порожній запис.");
  }
  return { note: res.note };
}

export async function editNote(userId, editorName, noteId, text) {
  await requireBoard(userId);
  const res = await updateNote(String(noteId), { text: String(text ?? ""), editorName });
  if (!res.ok) {
    throw res.reason === "missing" ? conflict("missing", "Запис не знайдено.") : badRequest("Порожній запис.");
  }
  return { note: res.note };
}

export async function removeNote(userId, noteId) {
  await requireBoard(userId);
  if (!(await deleteNote(String(noteId)))) throw conflict("missing", "Запис не знайдено.");
  return {};
}
