import { getRedis } from "../redisClient.js";
import { CB_DUMOSVIT_NEXT, CB_DUMOSVIT_OK } from "./constants.js";
import { formatGoalReached, getDumosvitGoal } from "./goal.js";
import {
  formatDumosvitCaption,
  pickDumosvitDelivery,
} from "./pickWord.js";
import {
  answerDumosvitQuiz,
  formatQuizCaption,
  formatQuizResult,
  quizKeyboard,
} from "./quiz.js";
import {
  dumosvitDueChatIds,
  dumosvitPopDue,
  dumosvitScheduleNext,
  dumosvitScheduledChatIds,
  kyivHourMinute,
} from "./scheduleStore.js";
import { kyivDay } from "./srs.js";

/** Вечірнє нагадування про ціль дня (за Києвом), до початку тихої пори. */
const NUDGE_FROM_HOUR = 20;
const NUDGE_TO_HOUR = 23;
const NUDGE_KEY = (day) => `svitodiy:dumosvit:nudged:${day}`;

function nextOkKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Далі ›", callback_data: CB_DUMOSVIT_NEXT },
        { text: "✓ Окей", callback_data: CB_DUMOSVIT_OK },
      ],
    ],
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
    await telegram.sendMessage(chatId, formatQuizCaption(delivery), {
      parse_mode: "HTML",
      reply_markup: quizKeyboard(delivery.token, delivery.options),
    });
    return;
  }

  await telegram.sendMessage(chatId, formatDumosvitCaption(delivery.entry), {
    parse_mode: "HTML",
    reply_markup: nextOkKeyboard(),
  });
}

/**
 * @deprecated використовуй deliverDumosvitToChat
 */
export async function sendDumosvitWordMessage(bot, chatId) {
  return deliverDumosvitToChat(bot.telegram, chatId);
}

/**
 * Раз на день о 20:00 — тим, у кого ввімкнені нагадування, але ціль дня ще не виконана:
 * щоб не обірвати серію. NX-ключ на добу — не надішле двічі навіть після рестарту.
 * @param {import("telegraf").Telegram} telegram
 */
async function maybeEveningNudge(telegram) {
  const { h } = kyivHourMinute(Date.now());
  if (h < NUDGE_FROM_HOUR || h >= NUDGE_TO_HOUR) return;
  const first = await getRedis().set(NUDGE_KEY(kyivDay()), "1", { NX: true, EX: 2 * 86_400 });
  if (first !== "OK") return;

  for (const chatIdStr of await dumosvitScheduledChatIds()) {
    const chatId = Number(chatIdStr);
    try {
      const g = await getDumosvitGoal(chatId);
      if (g.doneToday) continue;
      const left = Math.max(1, g.goal - g.done);
      const head =
        g.streak > 0
          ? `🔥 Твоя серія <b>${g.streak}</b> дн. під загрозою!`
          : "🎯 Ще не пізно почати серію!";
      await telegram.sendMessage(
        chatId,
        `📖 <b>Думосвіт</b>\n\n${head}\nДо цілі дня лишилось <b>${left}</b> вправ (${g.done}/${g.goal}).`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "📩 Тренуватися", callback_data: CB_DUMOSVIT_NEXT }]],
          },
        }
      );
    } catch (err) {
      console.warn("[dumosvit nudge] skip chat", chatId, err.message);
    }
  }
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
      await maybeEveningNudge(bot.telegram);
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

    const res = uid == null ? null : await answerDumosvitQuiz(uid, token, idx);
    if (!res) {
      await ctx.answerCbQuery({
        text: "Застаріло або не твоє повідомлення.",
        show_alert: true,
      });
      return;
    }

    await ctx.answerCbQuery({ text: res.correct ? "✅ Вірно!" : "❌ Ні" });

    // Перезбираємо підпис із даних тесту: text із callback уже без HTML-розмітки.
    const question = res.prompt
      ? formatQuizCaption({ prompt: res.prompt, direction: res.direction })
      : escapeHtml(ctx.callbackQuery?.message?.text ?? "");
    try {
      await ctx.editMessageText(`${question}\n\n${formatQuizResult(res)}${formatGoalReached(res.goal)}`, {
        parse_mode: "HTML",
        reply_markup: nextOkKeyboard(),
      });
    } catch {
      try {
        await ctx.reply(`${formatQuizResult(res)}${formatGoalReached(res.goal)}`, {
          parse_mode: "HTML",
          reply_markup: nextOkKeyboard(),
        });
      } catch {
        /* ignore */
      }
    }
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
