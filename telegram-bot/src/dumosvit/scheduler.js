import { CB_DUMOSVIT_OK } from "./constants.js";
import {
  formatDumosvitCaption,
  pickDumosvitDelivery,
} from "./pickWord.js";
import {
  deleteQuizSession,
  formatQuizCaption,
  getQuizSession,
  quizKeyboard,
} from "./quiz.js";
import {
  dumosvitDueChatIds,
  dumosvitPopDue,
  dumosvitScheduleNext,
} from "./scheduleStore.js";

function okKeyboard() {
  return {
    inline_keyboard: [[{ text: "✓ Окей", callback_data: CB_DUMOSVIT_OK }]],
  };
}

/**
 * Надсилає картку або тест (для тікера та «Слово зараз»).
 * @param {import("telegraf").Telegram} telegram
 * @param {number} chatId
 */
export async function deliverDumosvitToChat(telegram, chatId) {
  const telegramUserId = chatId;
  const delivery = await pickDumosvitDelivery(telegramUserId);

  if (delivery.kind === "quiz") {
    await telegram.sendMessage(chatId, formatQuizCaption(delivery.es), {
      parse_mode: "HTML",
      reply_markup: quizKeyboard(delivery.token, delivery.options),
    });
    return;
  }

  await telegram.sendMessage(chatId, formatDumosvitCaption(delivery.entry), {
    parse_mode: "HTML",
    reply_markup: okKeyboard(),
  });
}

/**
 * @deprecated використовуй deliverDumosvitToChat
 */
export async function sendDumosvitWordMessage(bot, chatId) {
  return deliverDumosvitToChat(bot.telegram, chatId);
}

/**
 * @param {import("telegraf").Telegraf} bot
 * @param {number} intervalMs як часто перевіряти Redis
 */
export function startDumosvitScheduler(bot, intervalMs = 45_000) {
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const due = await dumosvitDueChatIds();
      for (const chatIdStr of due) {
        const chatId = Number(chatIdStr);
        await dumosvitPopDue(chatId);
        try {
          await deliverDumosvitToChat(bot.telegram, chatId);
          await dumosvitScheduleNext(chatId);
        } catch (err) {
          console.warn("[dumosvit] skip chat", chatId, err.message);
        }
      }
    } catch (e) {
      console.error("[dumosvit tick]", e);
    } finally {
      busy = false;
    }
  };

  const id = setInterval(tick, intervalMs);
  tick();
  return () => clearInterval(id);
}

/**
 * Обробник відповіді на тест (підключи в registerMenuHandlers).
 * @param {import("telegraf").Telegraf} bot
 */
export function registerDumosvitQuizHandler(bot) {
  bot.action(/^dq_([a-f0-9]{8})_(\d+)$/, async (ctx) => {
    const token = ctx.match[1];
    const idx = Number(ctx.match[2]);
    const uid = ctx.from?.id;

    const session = await getQuizSession(token);
    if (!session || uid == null || session.userId !== uid) {
      await ctx.answerCbQuery({
        text: "Застаріло або не твоє повідомлення.",
        show_alert: true,
      });
      return;
    }

    await deleteQuizSession(token);
    const ok = idx === session.correctIndex;
    await ctx.answerCbQuery({ text: ok ? "✅ Вірно!" : "❌ Ні" });

    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {
      /* ignore */
    }

    try {
      const base = ctx.callbackQuery?.message?.text ?? "";
      await ctx.editMessageText(
        `${base}\n\n${ok ? "✅ <b>Вірно!</b>" : "❌ <b>Невірно.</b>"}`,
        { parse_mode: "HTML" }
      );
    } catch {
      try {
        await ctx.reply(ok ? "✅ Вірно!" : "❌ Невірно.");
      } catch {
        /* ignore */
      }
    }
  });
}
