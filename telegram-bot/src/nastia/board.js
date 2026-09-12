import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Input } from "telegraf";
import { CB_MENU_NASTIA } from "../menuConstants.js";
import { hasNastiaAccess } from "../specialAccess.js";
import { replyMainMenu } from "../handlers/menuHandlers.js";
import {
  MAX_NOTES,
  MAX_NOTE_LEN,
  addNote,
  clearAwaitingNote,
  clearBoardPhoto,
  deleteNote,
  getAwaitingNote,
  getBoardPhoto,
  getNote,
  listNotes,
  setAwaitingNote,
  setBoardPhoto,
  updateNote,
} from "./boardStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOARD_IMAGE_PATH = path.join(__dirname, "../../assets/admin/fon1.png");

const NOTES_PER_PAGE = 3;
/** Ліміт підпису до фото в Telegram. */
const CAPTION_LIMIT = 1024;

const CB_ADD = "nb_add";
const CB_CANCEL_INPUT = "nb_x";
const CB_NOOP = "nb_noop";
const CB_HOME = "nb_home";
const PAGE_RE = /^nb_p_(\d+)$/;
const EDIT_RE = /^nb_e_(\d+)_([a-z0-9]+)$/;
const DEL_RE = /^nb_d_(\d+)_([a-z0-9]+)$/;
const DEL_YES_RE = /^nb_dy_(\d+)_([a-z0-9]+)$/;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatStamp(ms) {
  try {
    return new Date(ms).toLocaleString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Обрізає вже екранований рядок, не розриваючи HTML-сутність (&amp;, &lt;…):
 * обрізок усередині «&…;» зламав би parse_mode на боці Telegram.
 */
function clipEscaped(s, max) {
  if (s.length <= max) return s;
  let cut = s.slice(0, Math.max(0, max - 1));
  const amp = cut.lastIndexOf("&");
  if (amp > -1 && cut.indexOf(";", amp) === -1) cut = cut.slice(0, amp);
  return `${cut}…`;
}

function pageCount(total) {
  return Math.max(1, Math.ceil(total / NOTES_PER_PAGE));
}

function clampPage(page, total) {
  const last = pageCount(total) - 1;
  if (!Number.isFinite(page) || page < 0) return 0;
  return Math.min(page, last);
}

/**
 * @param {import("./boardStore.js").BoardNote[]} notes
 * @param {number} page
 */
function buildCaption(notes, page) {
  const pages = pageCount(notes.length);
  const head = "🌸 <b>Настя</b> · дошка написів\n";

  if (notes.length === 0) {
    return (
      head +
      "\nПоки що порожньо.\n" +
      "Тисни <b>➕ Додати запис</b> — усе збережеться й нікуди не зникне."
    );
  }

  const start = page * NOTES_PER_PAGE;
  const slice = notes.slice(start, start + NOTES_PER_PAGE);
  const foot = `\n\n<i>Записів: ${notes.length}${pages > 1 ? ` · стор. ${page + 1}/${pages}` : ""}</i>`;

  // Екранування може вчетверо роздути текст («<» → «&lt;»), тож рахуємо
  // залишок бюджету підпису на кожному записі, а не ріжемо готовий рядок.
  let budget = CAPTION_LIMIT - head.length - foot.length - 4;
  const parts = [];
  for (const [i, n] of slice.entries()) {
    const lead = `<b>${start + i + 1}.</b> `;
    const who = escapeHtml(n.authorName || "—");
    const edited = n.editedBy ? ` · ✏️ ${escapeHtml(n.editedBy)}` : "";
    const meta = `<i>${who} · ${formatStamp(n.updatedAt ?? n.createdAt)}${edited}</i>`;

    const overhead = lead.length + meta.length + 3;
    const room = budget - overhead;
    if (room < 16) break;

    const body = clipEscaped(escapeHtml(n.text), room);
    parts.push(`${lead}${body}\n${meta}`);
    budget -= overhead + body.length;
  }

  return `${head}\n${parts.join("\n\n")}${foot}`;
}

/**
 * @param {import("./boardStore.js").BoardNote[]} notes
 * @param {number} page
 */
function buildKeyboard(notes, page) {
  const pages = pageCount(notes.length);
  const start = page * NOTES_PER_PAGE;
  const slice = notes.slice(start, start + NOTES_PER_PAGE);

  const rows = slice.map((n, i) => [
    { text: `✏️ ${start + i + 1}`, callback_data: `nb_e_${page}_${n.id}` },
    { text: `🗑 ${start + i + 1}`, callback_data: `nb_d_${page}_${n.id}` },
  ]);

  rows.push([{ text: "➕ Додати запис", callback_data: CB_ADD }]);

  if (pages > 1) {
    rows.push([
      {
        text: "◀",
        callback_data: `nb_p_${page > 0 ? page - 1 : pages - 1}`,
      },
      { text: `${page + 1}/${pages}`, callback_data: CB_NOOP },
      {
        text: "▶",
        callback_data: `nb_p_${page < pages - 1 ? page + 1 : 0}`,
      },
    ]);
  }

  rows.push([{ text: "⬅ У головне меню", callback_data: CB_HOME }]);
  return { inline_keyboard: rows };
}

/**
 * Перемальовує повідомлення-дошку (працює і з хендлера кнопки, і після
 * текстового повідомлення, коли callbackQuery немає).
 * @returns {Promise<number>} сторінка, яку показали
 */
async function updateBoardMessage(telegram, chatId, messageId, page) {
  const notes = await listNotes();
  const safePage = clampPage(page, notes.length);
  try {
    await telegram.editMessageCaption(
      chatId,
      messageId,
      undefined,
      buildCaption(notes, safePage),
      { parse_mode: "HTML", reply_markup: buildKeyboard(notes, safePage) }
    );
  } catch (err) {
    // «message is not modified» — нормально, ігноруємо.
    if (!/not modified/i.test(err?.description ?? err?.message ?? "")) throw err;
  }
  return safePage;
}

/** Підпис файлу фону — щоб помітити, що картинку підмінили. */
async function photoSignature() {
  try {
    const st = await fs.stat(BOARD_IMAGE_PATH);
    return `${st.size}:${Math.round(st.mtimeMs)}`;
  } catch {
    return null;
  }
}

/** Відкриває дошку новим повідомленням із фоном fon1. */
export async function openNastiaBoard(ctx, page = 0) {
  const notes = await listNotes();
  const safePage = clampPage(page, notes.length);
  const opts = {
    caption: buildCaption(notes, safePage),
    parse_mode: "HTML",
    reply_markup: buildKeyboard(notes, safePage),
  };

  // fon1.png важить мегабайти — після першої відправки шлемо вже file_id.
  const sig = await photoSignature();
  const cached = await getBoardPhoto();
  if (cached && cached.sig === sig) {
    try {
      await ctx.replyWithPhoto(cached.fileId, opts);
      return;
    } catch {
      await clearBoardPhoto(); // file_id протух — вивантажимо заново
    }
  }

  const sentMsg = await ctx.replyWithPhoto(Input.fromLocalFile(BOARD_IMAGE_PATH), opts);
  const fileId = sentMsg?.photo?.at(-1)?.file_id;
  if (fileId && sig) await setBoardPhoto(fileId, sig);
}

/** Перемальовує дошку, на кнопці якої натиснули. */
async function refreshFromCallback(ctx, page) {
  const msg = ctx.callbackQuery?.message;
  if (!msg) return;
  await updateBoardMessage(ctx.telegram, msg.chat.id, msg.message_id, page);
}

function authorNameOf(ctx) {
  const f = ctx.from ?? {};
  const name = [f.first_name, f.last_name].filter(Boolean).join(" ").trim();
  return name || (f.username ? `@${f.username}` : `id${f.id}`);
}

/** @returns {Promise<boolean>} */
async function guard(ctx) {
  if (await hasNastiaAccess(ctx.from?.id)) return true;
  await ctx.answerCbQuery("Цей розділ не для тебе.", { show_alert: true });
  return false;
}

async function deleteMessageSafe(telegram, chatId, messageId) {
  if (chatId == null || messageId == null) return;
  try {
    await telegram.deleteMessage(chatId, messageId);
  } catch {
    // повідомлення вже видалене або застаре — не критично
  }
}

/**
 * Просить текст і запам'ятовує, у який запис його покласти.
 * @param {"add" | "edit"} mode
 */
async function askForText(ctx, mode, page, note) {
  const boardMsg = ctx.callbackQuery?.message;
  if (!boardMsg) return;

  const prompt =
    mode === "add"
      ? `➕ <b>Новий запис</b>\n\nНадішли текст повідомленням (до ${MAX_NOTE_LEN} символів).`
      : `✏️ <b>Редагування</b>\n\nЗараз:\n<blockquote>${escapeHtml(note.text)}</blockquote>\nНадішли новий текст повідомленням.`;

  const sent = await ctx.reply(prompt, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "✖ Скасувати", callback_data: CB_CANCEL_INPUT }]],
    },
  });

  await setAwaitingNote(ctx.from.id, {
    mode,
    noteId: note?.id,
    page,
    chatId: boardMsg.chat.id,
    boardMessageId: boardMsg.message_id,
    promptMessageId: sent.message_id,
  });
}

/**
 * Ловить текст після «Додати» / «Редагувати». Реєструється ПЕРЕД літописцем,
 * щоб свіжіша дія мала пріоритет, якщо обидва очікування активні.
 * @param {import("telegraf").Telegraf} bot
 */
export function registerNastiaTextMiddleware(bot) {
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text;
    if (text == null || ctx.chat?.type !== "private") return next();
    if (text.startsWith("/")) return next();

    const uid = ctx.from?.id;
    if (uid == null) return next();

    const state = await getAwaitingNote(uid);
    if (!state) return next();

    // Доступ могли відкликати, доки чекали текст.
    if (!(await hasNastiaAccess(uid))) {
      await clearAwaitingNote(uid);
      return next();
    }

    const result =
      state.mode === "edit"
        ? await updateNote(state.noteId, {
            text,
            editorName: authorNameOf(ctx),
          })
        : await addNote({
            text,
            authorId: uid,
            authorName: authorNameOf(ctx),
          });

    if (!result.ok) {
      const why =
        result.reason === "limit"
          ? `На дошці вже ${MAX_NOTES} записів — видали щось зайве.`
          : result.reason === "missing"
            ? "Цей запис уже видалено."
            : "Порожній текст — нічого не збережено.";
      await ctx.reply(`⚠️ ${why}`);
      return;
    }

    await clearAwaitingNote(uid);
    await deleteMessageSafe(ctx.telegram, state.chatId, state.promptMessageId);
    await deleteMessageSafe(ctx.telegram, ctx.chat.id, ctx.message.message_id);

    // Новий запис — останній у списку, тож показуємо сторінку з ним.
    let page = state.page;
    if (state.mode === "add") {
      const total = (await listNotes()).length;
      page = pageCount(total) - 1;
    }

    try {
      await updateBoardMessage(ctx.telegram, state.chatId, state.boardMessageId, page);
    } catch {
      // Дошку могли видалити — надсилаємо нову.
      await openNastiaBoard(ctx, page);
    }
  });
}

/**
 * @param {import("telegraf").Telegraf} bot
 */
export function registerNastiaHandlers(bot) {
  bot.action(CB_MENU_NASTIA, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCbQuery();
    await openNastiaBoard(ctx);
  });

  bot.action(CB_NOOP, async (ctx) => {
    await ctx.answerCbQuery();
  });

  bot.action(PAGE_RE, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCbQuery();
    await refreshFromCallback(ctx, Number(ctx.match[1]));
  });

  bot.action(CB_ADD, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCbQuery();
    const notes = await listNotes();
    if (notes.length >= MAX_NOTES) {
      await ctx.reply(`⚠️ На дошці вже ${MAX_NOTES} записів — видали щось зайве.`);
      return;
    }
    await askForText(ctx, "add", pageCount(notes.length) - 1, undefined);
  });

  bot.action(EDIT_RE, async (ctx) => {
    if (!(await guard(ctx))) return;
    const page = Number(ctx.match[1]);
    const note = await getNote(ctx.match[2]);
    if (!note) {
      await ctx.answerCbQuery("Запис уже видалено.", { show_alert: true });
      await refreshFromCallback(ctx, page);
      return;
    }
    await ctx.answerCbQuery();
    await askForText(ctx, "edit", page, note);
  });

  bot.action(DEL_RE, async (ctx) => {
    if (!(await guard(ctx))) return;
    const page = Number(ctx.match[1]);
    const noteId = ctx.match[2];
    const note = await getNote(noteId);
    if (!note) {
      await ctx.answerCbQuery("Запис уже видалено.", { show_alert: true });
      await refreshFromCallback(ctx, page);
      return;
    }
    await ctx.answerCbQuery();
    await ctx.editMessageCaption(
      `🗑 <b>Видалити запис?</b>\n\n<blockquote>${clipEscaped(escapeHtml(note.text), 800)}</blockquote>\nЦю дію не скасувати.`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "Так, видалити", callback_data: `nb_dy_${page}_${noteId}` }],
            [{ text: "⬅ Назад", callback_data: `nb_p_${page}` }],
          ],
        },
      }
    );
  });

  bot.action(DEL_YES_RE, async (ctx) => {
    if (!(await guard(ctx))) return;
    const page = Number(ctx.match[1]);
    const removed = await deleteNote(ctx.match[2]);
    await ctx.answerCbQuery(removed ? "Видалено" : "Запису вже немає");
    await refreshFromCallback(ctx, page);
  });

  bot.action(CB_CANCEL_INPUT, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCbQuery("Скасовано");
    const state = await getAwaitingNote(ctx.from.id);
    await clearAwaitingNote(ctx.from.id);
    await deleteMessageSafe(ctx.telegram, ctx.chat?.id, ctx.callbackQuery?.message?.message_id);
    if (state) {
      await updateBoardMessage(
        ctx.telegram,
        state.chatId,
        state.boardMessageId,
        state.page
      ).catch(() => {});
    }
  });

  bot.action(CB_HOME, async (ctx) => {
    await ctx.answerCbQuery();
    await deleteMessageSafe(ctx.telegram, ctx.chat?.id, ctx.callbackQuery?.message?.message_id);
    await replyMainMenu(ctx);
  });
}
