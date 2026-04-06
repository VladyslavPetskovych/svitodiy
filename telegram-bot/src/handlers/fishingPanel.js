import { Input } from "telegraf";
import {
  buildFishPanelKeyboard,
  FISH_CAST_CALLBACK,
  FISHING_SCENE_PATH,
  FH_EQUIP_GOLD,
  FH_EQUIP_NONE,
  FH_EQUIP_SILVER,
  FT_EQUIP_ANGLER,
  FT_EQUIP_PEARL,
  FT_TAL_NONE,
  fishResultDoneKeyboard,
  FISH_RESULT_OK_RE,
  formatFishingPanelCaption,
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
  getEquippedHook,
  getEquippedTalisman,
  getInventory,
  getPanelOwner,
  getUserStats,
  recordFishingCast,
  setEquippedHook,
  setEquippedTalisman,
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

  const cap = formatFishingPanelCaption(
    await getEquippedHook(userId),
    await getEquippedTalisman(userId)
  );
  const kb = await buildFishPanelKeyboard(userId);

  const sent = await ctx.replyWithPhoto(Input.fromLocalFile(FISHING_SCENE_PATH), {
    caption: cap,
    parse_mode: "HTML",
    reply_markup: kb,
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

  const outcome = await rollCastOutcome(telegramUserId);
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
 * @param {import("telegraf").Context} ctx
 * @param {string | null} relicId
 */
async function handleHookEquip(ctx, relicId) {
  const userId = requireFromUser(ctx);
  if (userId == null) {
    await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
    return false;
  }

  const msg = ctx.callbackQuery?.message;
  if (!msg || !("photo" in msg)) {
    await ctx.answerCbQuery({ text: "Некоректне повідомлення.", show_alert: true });
    return false;
  }

  const owner = await getPanelOwner(msg.chat.id, msg.message_id);
  if (owner != null && owner !== userId) {
    await ctx.answerCbQuery({
      text: "Це панель іншого користувача.",
      show_alert: true,
    });
    return false;
  }

  if (relicId != null) {
    const inv = await getInventory(userId);
    if ((inv[relicId] ?? 0) < 1) {
      await ctx.answerCbQuery({ text: "Немає цього гачка в інвентарі.", show_alert: true });
      return false;
    }
  }

  await setEquippedHook(userId, relicId);
  await ctx.answerCbQuery({
    text: relicId == null ? "Без гачка" : "Гачок обрано",
  });

  try {
    await ctx.editMessageCaption(
      formatFishingPanelCaption(await getEquippedHook(userId), await getEquippedTalisman(userId)),
      {
        parse_mode: "HTML",
        reply_markup: await buildFishPanelKeyboard(userId),
      }
    );
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * @param {import("telegraf").Context} ctx
 * @param {string | null} relicId relic_pearl_talisman | relic_angler_charm | null
 */
async function handleTalismanEquip(ctx, relicId) {
  const userId = requireFromUser(ctx);
  if (userId == null) {
    await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
    return false;
  }

  const msg = ctx.callbackQuery?.message;
  if (!msg || !("photo" in msg)) {
    await ctx.answerCbQuery({ text: "Некоректне повідомлення.", show_alert: true });
    return false;
  }

  const owner = await getPanelOwner(msg.chat.id, msg.message_id);
  if (owner != null && owner !== userId) {
    await ctx.answerCbQuery({
      text: "Це панель іншого користувача.",
      show_alert: true,
    });
    return false;
  }

  if (relicId != null) {
    const inv = await getInventory(userId);
    if ((inv[relicId] ?? 0) < 1) {
      await ctx.answerCbQuery({ text: "Немає цього талісмана в інвентарі.", show_alert: true });
      return false;
    }
  }

  await setEquippedTalisman(userId, relicId);
  await ctx.answerCbQuery({
    text: relicId == null ? "Без талісмана" : "Талісман обрано",
  });

  try {
    await ctx.editMessageCaption(
      formatFishingPanelCaption(await getEquippedHook(userId), await getEquippedTalisman(userId)),
      {
        parse_mode: "HTML",
        reply_markup: await buildFishPanelKeyboard(userId),
      }
    );
  } catch {
    /* ignore */
  }
  return true;
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

  bot.action(FH_EQUIP_SILVER, async (ctx) => {
    await handleHookEquip(ctx, "relic_hook_silver");
  });

  bot.action(FH_EQUIP_GOLD, async (ctx) => {
    await handleHookEquip(ctx, "relic_hook_gold");
  });

  bot.action(FH_EQUIP_NONE, async (ctx) => {
    await handleHookEquip(ctx, null);
  });

  bot.action(FT_EQUIP_PEARL, async (ctx) => {
    await handleTalismanEquip(ctx, "relic_pearl_talisman");
  });

  bot.action(FT_EQUIP_ANGLER, async (ctx) => {
    await handleTalismanEquip(ctx, "relic_angler_charm");
  });

  bot.action(FT_TAL_NONE, async (ctx) => {
    await handleTalismanEquip(ctx, null);
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
      await ctx.telegram.editMessageCaption(
        panelChatId,
        panelMessageId,
        undefined,
        formatFishingPanelCaption(
          await getEquippedHook(userId),
          await getEquippedTalisman(userId)
        ),
        {
          parse_mode: "HTML",
          reply_markup: await buildFishPanelKeyboard(userId),
        }
      );
    } catch {
      /* панель видалена */
    }
  });
}
