import { Input } from "telegraf";
import {
  FISH_CATCH_PATH,
  FISH_CAST_CALLBACK,
  FISHING_PANEL_CAPTION,
  FISHING_SCENE_PATH,
  fishCastKeyboard,
  formatCatchCaption,
  rollCastOutcome,
  sleep,
  tensionDelayMs,
} from "../fishing.js";
import {
  formatStatsLine,
  getPanelOwner,
  getUserStats,
  recordFishingCast,
  setPanelOwner,
  touchUser,
} from "../userStore.js";

function requireFromUser(ctx) {
  const id = ctx.from?.id;
  if (id == null) {
    return null;
  }
  return id;
}

/**
 * @param {import("telegraf").Context} ctx
 */
async function sendFishingPanel(ctx) {
  const userId = requireFromUser(ctx);
  if (userId == null) {
    await ctx.reply("Тут немає даних користувача (напиши з особистого чату).");
    return;
  }

  const sent = await ctx.replyWithPhoto(Input.fromLocalFile(FISHING_SCENE_PATH), {
    caption: FISHING_PANEL_CAPTION,
    reply_markup: fishCastKeyboard(),
  });

  const msg = sent;
  if (msg && "message_id" in msg && "chat" in msg) {
    await setPanelOwner(msg.chat.id, msg.message_id, userId);
  }
}

/**
 * @param {import("telegraf").Context} ctx
 */
async function runCastAndFollowUp(ctx, telegramUserId) {
  await sleep(tensionDelayMs());

  const outcome = rollCastOutcome();
  await recordFishingCast(telegramUserId, outcome.caught);
  const stats = await getUserStats(telegramUserId);
  const statsLine = formatStatsLine(stats);

  if (outcome.caught) {
    await ctx.replyWithPhoto(Input.fromLocalFile(FISH_CATCH_PATH), {
      caption: `${formatCatchCaption(outcome.fish)}\n\n${statsLine}`,
      parse_mode: "HTML",
    });
  } else {
    await ctx.reply(`${outcome.missLine}\n\n${statsLine}`);
  }

  await sendFishingPanel(ctx);
}

/**
 * @param {import("telegraf").Telegraf} bot
 * @param {{ serverUrl: string }} options
 */
export function registerCommandHandlers(bot, { serverUrl }) {
  bot.start(async (ctx) => {
    const userId = requireFromUser(ctx);
    if (userId != null) {
      await touchUser(userId);
    }
    await ctx.reply(
      "Привіт! Команди:\n/ping — перевірка API\n/fish — риболовля 🎣 (далі тільки кнопка «Закинути вудку»)"
    );
  });

  bot.command("ping", async (ctx) => {
    try {
      const r = await fetch(`${serverUrl}/api/ping`);
      const data = await r.json();
      await ctx.reply(`API: ${data.message} (${data.at})`);
    } catch {
      await ctx.reply(
        `Не вдалося дістатися до сервера. Запущений Express на ${serverUrl}?`
      );
    }
  });

  bot.command("fish", async (ctx) => {
    await sendFishingPanel(ctx);
  });

  bot.action(FISH_CAST_CALLBACK, async (ctx) => {
    const userId = requireFromUser(ctx);
    if (userId == null) {
      await ctx.answerCbQuery({
        text: "Немає профілю користувача.",
        show_alert: true,
      });
      return;
    }

    const msg = ctx.callbackQuery.message;
    if (!msg || !("photo" in msg)) {
      await ctx.answerCbQuery({ text: "Некоректне повідомлення.", show_alert: true });
      return;
    }

    const owner = await getPanelOwner(msg.chat.id, msg.message_id);
    if (owner != null && owner !== userId) {
      await ctx.answerCbQuery({
        text: "Це панель іншого користувача. Напиши /fish, щоб отримати свою.",
        show_alert: true,
      });
      return;
    }

    await ctx.answerCbQuery({ text: "Кидаємо…" });
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {
      /* без клавіатури / вже змінене */
    }
    await runCastAndFollowUp(ctx, userId);
  });
}
