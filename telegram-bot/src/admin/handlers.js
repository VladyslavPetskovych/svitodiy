import { CB_ADMIN_VIEW_PREFIX, CB_MENU_ADMIN } from "../menuConstants.js";
import { hasAdminAccess } from "../specialAccess.js";
import { buildContainersReport } from "./docker.js";
import { fitTelegram } from "./format.js";
import { buildMonitorReport } from "./monitor.js";
import { buildProcessesReport } from "./processes.js";

/** Вкладки адмінки. Звіт про контейнери/процеси окремо — усе разом не влазить у повідомлення. */
const VIEWS = {
  server: { label: "🖥 Сервер", build: buildMonitorReport },
  docker: { label: "🐳 Контейнери", build: buildContainersReport },
  procs: { label: "⚙️ Процеси", build: buildProcessesReport },
};
const VIEW_RE = new RegExp(`^${CB_ADMIN_VIEW_PREFIX}(${Object.keys(VIEWS).join("|")})$`);

function adminKeyboard(current) {
  return {
    inline_keyboard: [
      Object.entries(VIEWS).map(([key, v]) => ({
        text: key === current ? `• ${v.label} •` : v.label,
        callback_data: CB_ADMIN_VIEW_PREFIX + key,
      })),
      [{ text: "🔄 Оновити", callback_data: CB_ADMIN_VIEW_PREFIX + current }],
    ],
  };
}

async function renderView(ctx, view) {
  const text = fitTelegram(await VIEWS[view].build(ctx.telegram));
  return { text, extra: { parse_mode: "HTML", reply_markup: adminKeyboard(view) } };
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
    const { text, extra } = await renderView(ctx, "server");
    await ctx.reply(text, extra);
  });

  bot.action(VIEW_RE, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCbQuery("Оновлюю…");
    const { text, extra } = await renderView(ctx, ctx.match[1]);
    try {
      await ctx.editMessageText(text, extra);
    } catch (err) {
      // "message is not modified" — дані не змінились, це не помилка
      if (!String(err?.description ?? err).includes("not modified")) throw err;
    }
  });
}
