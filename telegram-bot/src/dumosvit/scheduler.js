import { pickDumosvitWord, formatDumosvitCaption } from "./pickWord.js";
import {
  dumosvitDueChatIds,
  dumosvitPopDue,
  dumosvitScheduleNext,
} from "./scheduleStore.js";
import { CB_DUMOSVIT_OK } from "./constants.js";

function okKeyboard() {
  return {
    inline_keyboard: [[{ text: "✓ Окей", callback_data: CB_DUMOSVIT_OK }]],
  };
}

/**
 * Надсилає картку Думосвіту в чат (для тікера або «зараз»).
 * У приватному чаті chatId === userId — так підбираємо слово без повтору з попереднім.
 * @param {import("telegraf").Telegraf} bot
 * @param {number} chatId
 */
export async function sendDumosvitWordMessage(bot, chatId) {
  const telegramUserId = chatId;
  const word = await pickDumosvitWord(telegramUserId);
  await bot.telegram.sendMessage(chatId, formatDumosvitCaption(word), {
    parse_mode: "HTML",
    reply_markup: okKeyboard(),
  });
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
          await sendDumosvitWordMessage(bot, chatId);
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
