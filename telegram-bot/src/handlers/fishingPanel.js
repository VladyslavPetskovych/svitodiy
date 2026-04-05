import { Input } from "telegraf";
import {
  FISH_CAST_CALLBACK,
  FISHING_PANEL_CAPTION,
  FISHING_SCENE_PATH,
  FISH_RESULT_OK_RE,
  fishPanelKeyboard,
  fishResultDoneKeyboard,
  formatCatchCaption,
  formatRelicCatchCaption,
  resolveCatchImagePath,
  rollCastOutcome,
  sleep,
  tensionDelayMs,
} from "../fishing.js";
import { resolveRelicArtPath } from "../data/relics.js";
import {
  addFishToInventory,
  addRelicToInventory,
  addResourceToInventory,
  formatStatsLine,
  getPanelOwner,
  getUserStats,
  recordFishingCast,
  setPanelOwner,
} from "../userStore.js";

function requireFromUser(ctx) {
  const id = ctx.from?.id;
  if (id == null) return null;
  return id;
}

/**
 * @param {import("telegraf").Context} ctx
 */
export async function sendFishingPanel(ctx) {
  const userId = requireFromUser(ctx);
  if (userId == null) {
    await ctx.reply("Тут немає даних користувача (напиши з особистого чату).");
    return;
  }

  const sent = await ctx.replyWithPhoto(Input.fromLocalFile(FISHING_SCENE_PATH), {
    caption: FISHING_PANEL_CAPTION,
    parse_mode: "HTML",
    reply_markup: fishPanelKeyboard(),
  });

  if (sent && "message_id" in sent && "chat" in sent) {
    await setPanelOwner(sent.chat.id, sent.message_id, userId);
  }
}

/**
 * @param {import("telegraf").Context} ctx
 * @param {number} telegramUserId
 * @param {{ chatId: number, messageId: number }} panel
 */
async function runCastAndFollowUp(ctx, telegramUserId, panel) {
  const doneKb = fishResultDoneKeyboard(panel.chatId, panel.messageId);

  await sleep(tensionDelayMs());

  const outcome = rollCastOutcome();
  await recordFishingCast(telegramUserId, outcome.kind);
  const stats = await getUserStats(telegramUserId);
  const statsLine = formatStatsLine(stats);

  if (outcome.kind === "fish") {
    const fish = outcome.fish;
    const invCount = await addFishToInventory(telegramUserId, fish.id, 1);
    const invNote = `🎒 +1 у «Риба»: ${fish.emoji} ${fish.name} (усього: ${invCount})`;
    await ctx.replyWithPhoto(Input.fromLocalFile(resolveCatchImagePath(fish.id)), {
      caption: `${formatCatchCaption(fish)}\n\n${invNote}\n\n${statsLine}`,
      parse_mode: "HTML",
      reply_markup: doneKb,
    });
    return;
  }

  if (outcome.kind === "resource") {
    const res = outcome.resource;
    const n = await addResourceToInventory(telegramUserId, res.id, 1);
    await ctx.reply(
      `📦 <b>Ресурс з води!</b>\n\n${res.emoji} <b>${res.name}</b> — у розділі <b>📦 Ресурси</b> (усього: ×${n}).\n\n${statsLine}`,
      { parse_mode: "HTML", reply_markup: doneKb }
    );
    return;
  }

  if (outcome.kind === "relic") {
    const relic = outcome.relic;
    const total = await addRelicToInventory(telegramUserId, relic.id, 1);
    const cap = `${formatRelicCatchCaption(relic, total)}\n\n${statsLine}`;
    const art = resolveRelicArtPath(relic.id);
    if (art) {
      await ctx.replyWithPhoto(Input.fromLocalFile(art), {
        caption: cap,
        parse_mode: "HTML",
        reply_markup: doneKb,
      });
    } else {
      await ctx.reply(cap, { parse_mode: "HTML", reply_markup: doneKb });
    }
    return;
  }

  await ctx.reply(`${outcome.missLine}\n\n${statsLine}`, {
    reply_markup: doneKb,
  });
}

/**
 * @param {import("telegraf").Telegraf} bot
 */
export function registerFishingHandlers(bot) {
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
      /* ok */
    }

    await runCastAndFollowUp(ctx, userId, {
      chatId: msg.chat.id,
      messageId: msg.message_id,
    });
  });

  bot.action(FISH_RESULT_OK_RE, async (ctx) => {
    const userId = requireFromUser(ctx);
    const panelChatId = Number(ctx.match[1]);
    const panelMessageId = Number(ctx.match[2]);

    if (userId == null) {
      await ctx.answerCbQuery({
        text: "Немає профілю користувача.",
        show_alert: true,
      });
      return;
    }

    const owner = await getPanelOwner(panelChatId, panelMessageId);
    if (owner != null && owner !== userId) {
      await ctx.answerCbQuery({ text: "Не твій улов.", show_alert: true });
      return;
    }

    await ctx.answerCbQuery({ text: "Готово" });

    try {
      await ctx.deleteMessage();
    } catch {
      try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      } catch {
        /* ignore */
      }
    }

    try {
      await ctx.telegram.editMessageReplyMarkup(
        panelChatId,
        panelMessageId,
        undefined,
        fishPanelKeyboard()
      );
    } catch {
      /* панель видалена */
    }
  });
}
