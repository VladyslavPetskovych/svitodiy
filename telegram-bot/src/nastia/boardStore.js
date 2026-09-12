import { getRedis } from "../redisClient.js";
import { requestBackupSoon } from "../userBackup.js";

/**
 * Дошка написів розділу «Настя».
 *
 * Сховище — HASH (поле = id запису), а не один JSON-рядок: два адміни пишуть
 * одночасно, і кожен запис живе у власному полі, тож паралельні правки різних
 * записів не затирають одна одну.
 *
 * Ключі під префіксом `svitodiy:` — їх забирає бекап у userBackup.js
 * (Redis AOF + добові архіви + відновлення, якщо Redis порожній).
 */

const NOTES_KEY = "svitodiy:nastia:notes";
const SEQ_KEY = "svitodiy:nastia:seq";
const AWAIT_KEY = (uid) => `svitodiy:nastia:await:${uid}`;
const AWAIT_TTL_SEC = 900;

export const MAX_NOTE_LEN = 250;
export const MAX_NOTES = 200;

/** @typedef {{ id: string, seq: number, text: string, authorId: number, authorName: string, createdAt: number, updatedAt: number, editedBy: string | null }} BoardNote */

function genNoteId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Прибирає керівні символи й обрізає до ліміту. Повертає "" якщо порожньо. */
export function sanitizeNoteText(raw) {
  return String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_NOTE_LEN);
}

function parseNote(raw) {
  try {
    const n = JSON.parse(raw);
    if (!n || typeof n !== "object" || typeof n.text !== "string") return null;
    return n;
  } catch {
    return null;
  }
}

/** Усі записи, найстаріші зверху. @returns {Promise<BoardNote[]>} */
export async function listNotes() {
  const h = await getRedis().hGetAll(NOTES_KEY);
  const out = [];
  for (const raw of Object.values(h)) {
    const n = parseNote(raw);
    if (n) out.push(n);
  }
  out.sort((a, b) => (a.seq ?? a.createdAt ?? 0) - (b.seq ?? b.createdAt ?? 0));
  return out;
}

/** @returns {Promise<BoardNote | null>} */
export async function getNote(noteId) {
  const raw = await getRedis().hGet(NOTES_KEY, noteId);
  if (raw == null) return null;
  return parseNote(raw);
}

/**
 * @param {{ text: string, authorId: number, authorName: string }} data
 * @returns {Promise<{ ok: true, note: BoardNote } | { ok: false, reason: "empty" | "limit" }>}
 */
export async function addNote({ text, authorId, authorName }) {
  const clean = sanitizeNoteText(text);
  if (!clean) return { ok: false, reason: "empty" };

  const r = getRedis();
  if ((await r.hLen(NOTES_KEY)) >= MAX_NOTES) return { ok: false, reason: "limit" };

  const now = Date.now();
  /** @type {BoardNote} */
  const note = {
    id: genNoteId(),
    seq: await r.incr(SEQ_KEY),
    text: clean,
    authorId,
    authorName: String(authorName ?? "").slice(0, 64),
    createdAt: now,
    updatedAt: now,
    editedBy: null,
  };
  await r.hSet(NOTES_KEY, note.id, JSON.stringify(note));
  requestBackupSoon();
  return { ok: true, note };
}

/**
 * @param {{ text: string, editorName: string }} data
 * @returns {Promise<{ ok: true, note: BoardNote } | { ok: false, reason: "empty" | "missing" }>}
 */
export async function updateNote(noteId, { text, editorName }) {
  const clean = sanitizeNoteText(text);
  if (!clean) return { ok: false, reason: "empty" };

  const note = await getNote(noteId);
  if (!note) return { ok: false, reason: "missing" };

  note.text = clean;
  note.updatedAt = Date.now();
  note.editedBy = String(editorName ?? "").slice(0, 64) || null;

  await getRedis().hSet(NOTES_KEY, noteId, JSON.stringify(note));
  requestBackupSoon();
  return { ok: true, note };
}

/** @returns {Promise<boolean>} */
export async function deleteNote(noteId) {
  const removed = await getRedis().hDel(NOTES_KEY, noteId);
  if (removed > 0) requestBackupSoon();
  return removed > 0;
}

const PHOTO_KEY = "svitodiy:nastia:photo";

/**
 * file_id фону, щоб не вивантажувати картинку на кожне відкриття дошки.
 * `sig` — розмір+mtime файлу: підміниш fon1.png, і кеш сам протухне.
 * @returns {Promise<{ fileId: string, sig: string } | null>}
 */
export async function getBoardPhoto() {
  const raw = await getRedis().get(PHOTO_KEY);
  if (raw == null) return null;
  try {
    const v = JSON.parse(raw);
    return v?.fileId ? v : null;
  } catch {
    return null;
  }
}

export async function setBoardPhoto(fileId, sig) {
  await getRedis().set(PHOTO_KEY, JSON.stringify({ fileId, sig }));
}

export async function clearBoardPhoto() {
  await getRedis().del(PHOTO_KEY);
}

/**
 * Стан «чекаємо текст» — щоб наступне повідомлення пішло у потрібний запис.
 * @typedef {{ mode: "add" | "edit", noteId?: string, page: number, chatId: number, boardMessageId: number, promptMessageId?: number }} AwaitState
 */

/** @param {AwaitState} state */
export async function setAwaitingNote(userId, state) {
  await getRedis().setEx(AWAIT_KEY(userId), AWAIT_TTL_SEC, JSON.stringify(state));
}

/** @returns {Promise<AwaitState | null>} */
export async function getAwaitingNote(userId) {
  const raw = await getRedis().get(AWAIT_KEY(userId));
  if (raw == null) return null;
  try {
    const s = JSON.parse(raw);
    return s && typeof s === "object" ? s : null;
  } catch {
    return null;
  }
}

export async function clearAwaitingNote(userId) {
  await getRedis().del(AWAIT_KEY(userId));
}
