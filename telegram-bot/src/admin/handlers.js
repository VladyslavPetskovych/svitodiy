import { CB_ADMIN_REFRESH, CB_MENU_ADMIN } from "../menuConstants.js";
import { hasAdminAccess } from "../specialAccess.js";
import { buildMonitorReport } from "./monitor.js";

function adminKeyboard() {
  return {
    inline_keyboard: [[{ text: "🔄 Оновити", callback_data: CB_ADMIN_REFRESH }]],
  };
}

/** Перевіряє номер адміна; чужим мовчки відповідаємо, без розкриття розділу. */
async function guard(ctx) {
  if (await hasAdminAccess(ctx.from?.id)) return true;
  await ctx.answerCbQuery("Недоступно").catch(() => {});
  return false;
}

/**
 * @param {import("telegraf").Telegraf} bot
 */
export function registerAdminHandlers(bot) {
  bot.action(CB_MENU_ADMIN, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCbQuery("Збираю дані…");
    const text = await buildMonitorReport(ctx.telegram);
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: adminKeyboard() });
  });

  bot.action(CB_ADMIN_REFRESH, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCbQuery("Оновлюю…");
    const text = await buildMonitorReport(ctx.telegram);
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: adminKeyboard() });
    } catch (err) {
      // "message is not modified" — дані не змінились, це не помилка
      if (!String(err?.description ?? err).includes("not modified")) throw err;
    }
  });
}
