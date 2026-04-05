import { parseTaskInput } from "./parseDue.js";
import { addTask, clearAwaitingTaskText, isAwaitingTaskText } from "./store.js";

function formatRemindLine(ms) {
  try {
    return new Date(ms).toLocaleString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

/**
 * Ловить наступне текстове повідомлення після «Нове завдання».
 * @param {import("telegraf").Telegraf} bot
 */
export function registerLitopysTextMiddleware(bot) {
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text;
    if (text == null || ctx.chat?.type !== "private") return next();
    if (text.startsWith("/")) return next();

    const uid = ctx.from?.id;
    if (uid == null) return next();

    const waiting = await isAwaitingTaskText(uid);
    if (!waiting) return next();

    const parsed = parseTaskInput(text);
    if (parsed.error && !parsed.title) {
      await ctx.reply(
        `❌ ${parsed.error}\n\nНапиши ще раз або натисни «Скасувати введення» в меню Літописця.`
      );
      return;
    }

    await clearAwaitingTaskText(uid);

    let remindAt = parsed.remindAt;
    let pastNote = "";
    if (remindAt != null && remindAt <= Date.now()) {
      remindAt = null;
      pastNote = "\n\n<i>Дата вже минула — нагадування не встановлено.</i>";
    }

    const task = await addTask(uid, { title: parsed.title, remindAt });

    let msg = `✅ <b>Завдання додано</b>\n\n📝 ${escapeHtml(task.title)}`;
    if (task.remindAt) {
      msg += `\n🔔 ${formatRemindLine(task.remindAt)}`;
    } else {
      msg += `\n<i>Без нагадування.</i>`;
    }
    if (parsed.error) {
      msg += `\n\n⚠️ ${escapeHtml(parsed.error)}`;
    }
    msg += pastNote;

    await ctx.reply(msg, { parse_mode: "HTML" });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
