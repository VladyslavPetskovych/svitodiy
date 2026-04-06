import { formatBalanceHtml } from "../economy.js";
import { registerLitopysTextMiddleware } from "../litopys/textMiddleware.js";
import {
  addBalance,
  getBalance,
  touchUser,
} from "../userStore.js";
import { registerDumosvitQuizHandler } from "../dumosvit/scheduler.js";
import { registerFishingHandlers } from "./fishingPanel.js";
import { registerMenuHandlers, replyMainMenu } from "./menuHandlers.js";

function adminUserIds() {
  const raw = process.env.BOT_ADMIN_USER_IDS ?? "";
  const ids = new Set();
  for (const part of raw.split(/[,\s]+/)) {
    const n = Number(part.trim());
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids;
}

function isBotAdmin(telegramUserId) {
  const ids = adminUserIds();
  return ids.size > 0 && ids.has(telegramUserId);
}

/**
 * @param {import("telegraf").Telegraf} bot
 */
export function registerCommandHandlers(bot) {
  registerLitopysTextMiddleware(bot);
  registerMenuHandlers(bot);
  registerDumosvitQuizHandler(bot);
  registerFishingHandlers(bot);

  /** Лише для ID з BOT_ADMIN_USER_IDS у .env — докинути ✨ після нового Redis на сервері */
  bot.command("grant_balance", async (ctx) => {
    const uid = ctx.from?.id;
    if (uid == null || !isBotAdmin(uid)) return;

    const text = ctx.message?.text ?? "";
    const m = text.match(/\/grant_balance(?:@\S+)?\s+(\d+)/);
    if (!m) {
      await ctx.reply("Формат: <code>/grant_balance 500</code>", {
        parse_mode: "HTML",
      });
      return;
    }
    const amt = Number(m[1]);
    if (!Number.isFinite(amt) || amt < 1 || amt > 1_000_000_000) {
      await ctx.reply("Некоректна сума.");
      return;
    }
    await addBalance(uid, amt);
    const bal = await getBalance(uid);
    await ctx.reply(
      `Нараховано <b>+${amt}</b> ✨\nЗараз на рахунку: ${formatBalanceHtml(bal)}`,
      { parse_mode: "HTML" }
    );
  });

  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (userId != null) {
      await touchUser(userId);
    }
    await replyMainMenu(ctx, { withIntro: true });
  });
}
