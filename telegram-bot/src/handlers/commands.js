import { message } from "telegraf/filters";
import { formatBalanceHtml } from "../economy.js";
import { registerLitopysTextMiddleware } from "../litopys/textMiddleware.js";
import {
  addBalance,
  getBalance,
  getUserPhone,
  setUserPhone,
  touchUser,
} from "../userStore.js";
import { isAdminPhone, isNastiaPhone } from "../specialAccess.js";
import {
  registerNastiaHandlers,
  registerNastiaTextMiddleware,
} from "../nastia/board.js";
import { registerDumosvitQuizHandler } from "../dumosvit/scheduler.js";
import { registerAdminHandlers } from "../admin/handlers.js";
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
  // Дошка «Настя» перехоплює текст першою: якщо активні обидва очікування,
  // пріоритет у свіжішої дії.
  registerNastiaTextMiddleware(bot);
  registerLitopysTextMiddleware(bot);
  registerMenuHandlers(bot);
  registerNastiaHandlers(bot);
  registerDumosvitQuizHandler(bot);
  registerFishingHandlers(bot);
  registerAdminHandlers(bot);

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

  /**
   * Номер потрібен лише для персональних розділів (див. specialAccess.js).
   * Telegram віддає його тільки коли користувач сам натисне кнопку контакту.
   */
  bot.on(message("contact"), async (ctx) => {
    const uid = ctx.from?.id;
    const contact = ctx.message.contact;
    if (uid == null) return;

    if (contact.user_id !== uid) {
      await ctx.reply("Це чужий контакт — надішли свій через кнопку нижче.", {
        reply_markup: sharePhoneKeyboard(),
      });
      return;
    }

    await touchUser(uid);
    await setUserPhone(uid, contact.phone_number);

    await ctx.reply("Готово, номер збережено ✅", {
      reply_markup: { remove_keyboard: true },
    });
    if (isNastiaPhone(contact.phone_number)) {
      await ctx.reply("Відкрито особистий розділ 🌸");
    }
    if (isAdminPhone(contact.phone_number)) {
      await ctx.reply("Відкрито розділ «Адмін» 🛠");
    }
    await replyMainMenu(ctx);
  });

  /** Поділитися номером будь-коли — /start просить його лише в перший раз. */
  bot.command("phone", async (ctx) => {
    if (ctx.chat?.type !== "private") return;
    await ctx.reply("Натисни кнопку нижче, щоб поділитися номером 👇", {
      reply_markup: sharePhoneKeyboard(),
    });
  });

  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (userId != null) {
      await touchUser(userId);
    }
    await replyMainMenu(ctx, { withIntro: true });
    await maybeAskForPhone(ctx);
  });
}

function sharePhoneKeyboard() {
  return {
    keyboard: [[{ text: "📱 Поділитися номером", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

/** Просимо контакт лише в особистому чаті й лише якщо його ще немає. */
async function maybeAskForPhone(ctx) {
  const uid = ctx.from?.id;
  if (uid == null || ctx.chat?.type !== "private") return;
  if ((await getUserPhone(uid)) != null) return;

  await ctx.reply(
    "Якщо для твого номера є особистий розділ — поділися контактом 👇\n" +
      "<i>Необов’язково: без цього бот працює як зазвичай.</i>",
    { parse_mode: "HTML", reply_markup: sharePhoneKeyboard() }
  );
}
