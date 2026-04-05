import { Input } from "telegraf";
import {
  CB_DUMOSVIT_DISABLE,
  CB_DUMOSVIT_ENABLE,
  CB_DUMOSVIT_NOW,
  CB_DUMOSVIT_OK,
} from "../dumosvit/constants.js";
import { formatDumosvitCaption, pickDumosvitWord } from "../dumosvit/pickWord.js";
import {
  dumosvitIsScheduled,
  dumosvitScheduleNext,
  dumosvitUnschedule,
} from "../dumosvit/scheduleStore.js";
import { ALCHEMY_RECIPES, canCraft, getAlchemyRecipe } from "../data/alchemy.js";
import { rollCookDrops } from "../data/cookDrops.js";
import { CATCHES, getFishMeta } from "../data/fishTypes.js";
import { getResourceMeta } from "../data/resources.js";
import { formatBalanceHtml } from "../economy.js";
import { MAIN_MENU_IMAGE_PATH } from "../fishing.js";
import {
  clearAwaitingTaskText,
  deleteTask,
  getTasks,
  isAwaitingTaskText,
  markTaskDone,
  setAwaitingTaskText,
} from "../litopys/store.js";
import { formatInventoryCaption } from "../inventoryCaption.js";
import {
  CB_ALCH_BACK_CHAS,
  CB_CHAS_ALCHEMY,
  CB_CHAS_BACK_MAIN,
  CB_CHAS_FISH,
  CB_CHAS_INV,
  CB_FISH_PANEL_BACK,
  CB_FISH_PANEL_INV,
  CB_INV_BACK_CHAS,
  CB_MENU_CHASODIY,
  CB_MENU_DUMOSVIT,
  CB_MENU_LITOPYS,
  CB_MENU_MAIN,
  CB_LIT_ADD,
  CB_LIT_CANCEL,
  CB_LIT_HOME,
  CB_LIT_LIST,
} from "../menuConstants.js";
import {
  addRelicToInventory,
  addResourceToInventory,
  consumeResources,
  getBalance,
  getInventory,
  getPanelOwner,
  removeFishFromInventory,
  sellFishUnits,
} from "../userStore.js";
import { sendFishingPanel } from "./fishingPanel.js";

const MAIN_MENU_INTRO =
  "Привіт! Керуй ботом кнопками нижче — на рахунку валюта <b>промінчики</b> ✨.";

const DUMOSVIT_MENU_TEXT =
  "📖 <b>Думосвіт</b>\n\n" +
  "Іспанська: <b>слова</b>, <b>сталі фрази й речення</b>, іноді — короткі <b>факти й граматика</b>. " +
  "Увімкни нагадування — картка приходитиме кожні <b>30 хв — 2 год</b> (випадково). " +
  "Після перегляду натискай <b>Окей</b>, щоб прибрати її з чату.";

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⚔️ Часодій · РПГ", callback_data: CB_MENU_CHASODIY }],
      [{ text: "📚 Думосвіт · іспанська", callback_data: CB_MENU_DUMOSVIT }],
      [{ text: "📜 Літописець · планер", callback_data: CB_MENU_LITOPYS }],
    ],
  };
}

function chasodiyMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🎣 Риболовля", callback_data: CB_CHAS_FISH }],
      [{ text: "🎒 Інвентар", callback_data: CB_CHAS_INV }],
      [{ text: "🔮 Алхімія", callback_data: CB_CHAS_ALCHEMY }],
      [{ text: "⬅ У головне меню", callback_data: CB_CHAS_BACK_MAIN }],
    ],
  };
}

function alchemyMenuKeyboard(inv) {
  const rows = [];
  for (const rec of ALCHEMY_RECIPES) {
    const ok = canCraft(rec, inv);
    rows.push([
      {
        text: ok ? `✨ Зварити ${rec.emoji}` : `🔒 ${rec.emoji} не вистачає`,
        callback_data: `alc_${rec.id}`,
      },
    ]);
  }
  rows.push([{ text: "⬅ Часодій", callback_data: CB_ALCH_BACK_CHAS }]);
  return { inline_keyboard: rows };
}

async function dumosvitMenuKeyboard(chatId) {
  const on = await dumosvitIsScheduled(chatId);
  const rows = [];
  if (on) {
    rows.push([
      { text: "⏹ Вимкнути нагадування", callback_data: CB_DUMOSVIT_DISABLE },
    ]);
  } else {
    rows.push([
      {
        text: "▶ Увімкнути (30 хв — 2 год)",
        callback_data: CB_DUMOSVIT_ENABLE,
      },
    ]);
  }
  rows.push([{ text: "📩 Слово зараз", callback_data: CB_DUMOSVIT_NOW }]);
  rows.push([{ text: "⬅ У головне меню", callback_data: CB_MENU_MAIN }]);
  return { inline_keyboard: rows };
}

function okKeyboard() {
  return {
    inline_keyboard: [[{ text: "✓ Окей", callback_data: CB_DUMOSVIT_OK }]],
  };
}

function buildMainMenuCaption(balanceHtml, withIntro) {
  const intro = withIntro ? `${MAIN_MENU_INTRO}\n\n` : "";
  return (
    `${intro}` +
    `🏠 <b>Головне меню</b>\n` +
    `На рахунку: ${balanceHtml}\n\n` +
    `⚔️ <b>Часодій</b> — невелика РПГ: рибалка, інвентар, ресурси.\n` +
    `📚 <b>Думосвіт</b> — іспанські слова: навчання й запам’ятовування.\n` +
    `📜 <b>Літописець</b> — завдання та нагадування за датою.\n\n` +
    `Обери розділ 👇\n\n` +
    `<i>/menu</i> · <i>/fish</i> · <i>/inv</i>`
  );
}

/**
 * @param {import("telegraf").Context} ctx
 */
async function editMenuBody(ctx, html, keyboard) {
  const msg = ctx.callbackQuery?.message;
  if (!msg) {
    throw new Error("Немає повідомлення для редагування");
  }
  if ("photo" in msg) {
    await ctx.editMessageCaption(html, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } else {
    await ctx.editMessageText(html, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }
}

/**
 * @param {import("telegraf").Context} ctx
 * @param {{ withIntro?: boolean }} [opts]
 */
export async function replyMainMenu(ctx, opts = {}) {
  const userId = ctx.from?.id;
  const bal = userId != null ? await getBalance(userId) : 0;
  const cap = buildMainMenuCaption(formatBalanceHtml(bal), !!opts.withIntro);
  await ctx.replyWithPhoto(Input.fromLocalFile(MAIN_MENU_IMAGE_PATH), {
    caption: cap,
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(),
  });
}

async function tryEditMainMenu(ctx) {
  const uid = ctx.from?.id;
  const bal = uid != null ? await getBalance(uid) : 0;
  try {
    await editMenuBody(
      ctx,
      buildMainMenuCaption(formatBalanceHtml(bal), false),
      mainMenuKeyboard()
    );
  } catch {
    await replyMainMenu(ctx);
  }
}

async function tryEditChasodiyMenu(ctx) {
  const uid = ctx.from?.id;
  const bal = uid != null ? await getBalance(uid) : 0;
  const cap =
    `⏳ <b>Часодій</b> · <i>мікро-РПГ</i>\n` +
    `На рахунку: ${formatBalanceHtml(bal)}\n\n` +
    `🎣 <b>Риболовля</b> — риба, ресурси, рідкі реліквії.\n` +
    `🎒 <b>Інвентар</b> — продаж риби, готування → ресурси.\n` +
    `🔮 <b>Алхімія</b> — з ресурсів створюєш реліквії.`;
  try {
    await editMenuBody(ctx, cap, chasodiyMenuKeyboard());
  } catch {
    await ctx.reply(cap, {
      parse_mode: "HTML",
      reply_markup: chasodiyMenuKeyboard(),
    });
  }
}

async function tryEditAlchemyMenu(ctx) {
  const uid = ctx.from?.id;
  if (uid == null) return;
  const inv = await getInventory(uid);
  let cap = `🔮 <b>Алхімія</b>\n\nВитрачаєш ресурси з розділу <b>📦 Ресурси</b> і отримуєш <b>🏺 реліквії</b>.\n\n`;
  for (const rec of ALCHEMY_RECIPES) {
    cap += `${rec.emoji} <b>${rec.name}</b>\n`;
    for (const [rid, need] of Object.entries(rec.consumes)) {
      const m = getResourceMeta(rid);
      const label = m ? `${m.emoji} ${m.name}` : rid;
      const have = inv[rid] ?? 0;
      cap += `  ${have >= need ? "✅" : "❌"} ${need}× ${label} <i>(є ${have})</i>\n`;
    }
    cap += "\n";
  }
  try {
    await editMenuBody(ctx, cap, alchemyMenuKeyboard(inv));
  } catch {
    await ctx.reply(cap, {
      parse_mode: "HTML",
      reply_markup: alchemyMenuKeyboard(inv),
    });
  }
}

async function tryEditDumosvitMenu(ctx) {
  const chatId = ctx.chat?.id;
  if (chatId == null) return;
  const uid = ctx.from?.id;
  const bal = uid != null ? await getBalance(uid) : 0;
  const text = `${DUMOSVIT_MENU_TEXT}\n\nНа рахунку: ${formatBalanceHtml(bal)}`;
  const kb = await dumosvitMenuKeyboard(chatId);
  try {
    await editMenuBody(ctx, text, kb);
  } catch {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

const LITOPYS_MENU_TEXT =
  "📜 <b>Літописець</b>\n\n" +
  "Твій міні-планер: додавай завдання й <b>нагадування за датою</b>.\n\n" +
  "Після «Нове завдання» напиши в чат одним повідомленням:\n" +
  "• лише текст — без нагадування;\n" +
  "• або <code>текст | 15.04.2026 18:30</code> — з нагадуванням " +
  "(день.місяць.рік, за бажанням година).\n\n";

function escapeHtmlLit(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncLit(s, n) {
  const t = String(s);
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function formatLitDate(ms) {
  try {
    return new Date(ms).toLocaleString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

async function litopysMenuKeyboard(userId) {
  const rows = [];
  if (userId != null && (await isAwaitingTaskText(userId))) {
    rows.push([{ text: "❌ Скасувати введення", callback_data: CB_LIT_CANCEL }]);
  }
  rows.push([{ text: "➕ Нове завдання", callback_data: CB_LIT_ADD }]);
  rows.push([{ text: "📋 Мої завдання", callback_data: CB_LIT_LIST }]);
  rows.push([{ text: "⬅ У головне меню", callback_data: CB_MENU_MAIN }]);
  return { inline_keyboard: rows };
}

function buildLitopysCaption(balanceHtml) {
  return `${LITOPYS_MENU_TEXT}\n\nНа рахунку: ${balanceHtml}`;
}

async function tryEditLitopysMenu(ctx) {
  const uid = ctx.from?.id;
  const bal = uid != null ? await getBalance(uid) : 0;
  const cap = buildLitopysCaption(formatBalanceHtml(bal));
  const kb = await litopysMenuKeyboard(uid ?? 0);
  try {
    await editMenuBody(ctx, cap, kb);
  } catch {
    await ctx.reply(cap, { parse_mode: "HTML", reply_markup: kb });
  }
}

async function buildLitopysListContent(userId) {
  let tasks = await getTasks(userId);
  tasks = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ta = a.remindAt ?? a.createdAt;
    const tb = b.remindAt ?? b.createdAt;
    return ta - tb;
  });
  const maxShow = 8;
  const slice = tasks.slice(0, maxShow);
  let cap = `📋 <b>Мої завдання</b>\n\n`;
  if (tasks.length === 0) {
    cap += `<i>Поки порожньо — натисни «Нове завдання».</i>`;
  } else {
    for (const t of slice) {
      const titleEsc = escapeHtmlLit(truncLit(t.title, 140));
      const line = t.done ? `☑️ <s>${titleEsc}</s>` : `□ ${titleEsc}`;
      const time =
        t.remindAt && !t.done
          ? `\n   <i>🔔 ${escapeHtmlLit(formatLitDate(t.remindAt))}</i>`
          : "";
      cap += `${line}${time}\n\n`;
    }
    if (tasks.length > maxShow) {
      cap += `<i>… і ще ${tasks.length - maxShow}</i>\n\n`;
    }
  }
  cap += `<i>✅ — виконано · 🗑 — видалити</i>`;

  const rows = [];
  for (const t of slice) {
    if (t.done) {
      rows.push([
        { text: `🗑 ${truncLit(t.title, 28)}`, callback_data: `lx_${t.id}` },
      ]);
    } else {
      rows.push([
        { text: `✅ ${truncLit(t.title, 24)}`, callback_data: `ld_${t.id}` },
        { text: "🗑", callback_data: `lx_${t.id}` },
      ]);
    }
  }
  rows.push([{ text: "⬅ Літописець", callback_data: CB_LIT_HOME }]);
  return { cap, kb: { inline_keyboard: rows } };
}

async function showLitopysTaskList(ctx) {
  const uid = ctx.from?.id;
  if (uid == null) return;
  const { cap, kb } = await buildLitopysListContent(uid);
  const msg = ctx.callbackQuery?.message;
  try {
    if (msg && "photo" in msg) {
      await ctx.editMessageCaption(cap, { parse_mode: "HTML", reply_markup: kb });
    } else if (msg && "text" in msg) {
      await ctx.editMessageText(cap, { parse_mode: "HTML", reply_markup: kb });
    } else {
      await ctx.reply(cap, { parse_mode: "HTML", reply_markup: kb });
    }
  } catch {
    await ctx.reply(cap, { parse_mode: "HTML", reply_markup: kb });
  }
}

async function replyLitopysMenuStandalone(ctx) {
  const uid = ctx.from?.id;
  const bal = uid != null ? await getBalance(uid) : 0;
  const cap = buildLitopysCaption(formatBalanceHtml(bal));
  const kb = await litopysMenuKeyboard(uid ?? 0);
  await ctx.reply(cap, { parse_mode: "HTML", reply_markup: kb });
}

function inventoryKeyboard(inv) {
  const rows = [];
  for (const fish of CATCHES) {
    const n = inv[fish.id] ?? 0;
    if (n < 1) continue;
    const p = fish.sellPrice;
    rows.push([
      { text: `💰 ${fish.emoji} Продати (+${p}✨)`, callback_data: `s1_${fish.id}` },
      { text: `🍲 ${fish.emoji} Приготувати`, callback_data: `ck_${fish.id}` },
    ]);
  }
  rows.push([
    { text: "⬅ Часодій", callback_data: CB_INV_BACK_CHAS },
    { text: "🏠 Меню", callback_data: CB_MENU_MAIN },
  ]);
  return { inline_keyboard: rows };
}

async function showInventoryScreen(ctx, userId) {
  const inv = await getInventory(userId);
  const bal = await getBalance(userId);
  const cap = formatInventoryCaption(inv, formatBalanceHtml(bal));
  await editMenuBody(ctx, cap, inventoryKeyboard(inv));
}

async function refreshInventoryScreen(ctx, userId) {
  const inv = await getInventory(userId);
  const bal = await getBalance(userId);
  const cap = formatInventoryCaption(inv, formatBalanceHtml(bal));
  await editMenuBody(ctx, cap, inventoryKeyboard(inv));
}

async function sendInventoryStandalone(ctx) {
  const userId = ctx.from?.id;
  if (userId == null) {
    await ctx.reply("Потрібен профіль користувача (особистий чат).");
    return;
  }
  const inv = await getInventory(userId);
  const bal = await getBalance(userId);
  const cap = formatInventoryCaption(inv, formatBalanceHtml(bal));
  await ctx.replyWithPhoto(Input.fromLocalFile(MAIN_MENU_IMAGE_PATH), {
    caption: cap,
    parse_mode: "HTML",
    reply_markup: inventoryKeyboard(inv),
  });
}

const SELL_ONE_RE = /^s1_([a-z_]+)$/;
const COOK_ONE_RE = /^ck_([a-z_]+)$/;
const ALCHEMY_CRAFT_RE = /^alc_([a-z_]+)$/;
const LIT_DONE_RE = /^ld_([a-z0-9]+)$/;
const LIT_DEL_RE = /^lx_([a-z0-9]+)$/;

/**
 * @param {import("telegraf").Telegraf} bot
 */
export function registerMenuHandlers(bot) {
  bot.command("menu", async (ctx) => {
    await replyMainMenu(ctx);
  });

  bot.command("litopys", async (ctx) => {
    await replyLitopysMenuStandalone(ctx);
  });

  bot.command("inv", sendInventoryStandalone);
  bot.command("inventory", sendInventoryStandalone);

  bot.action(CB_MENU_MAIN, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditMainMenu(ctx);
  });

  bot.action(CB_MENU_CHASODIY, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditChasodiyMenu(ctx);
  });

  bot.action(CB_CHAS_BACK_MAIN, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditMainMenu(ctx);
  });

  bot.action(CB_CHAS_FISH, async (ctx) => {
    await ctx.answerCbQuery();
    await sendFishingPanel(ctx);
  });

  bot.action(CB_CHAS_ALCHEMY, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditAlchemyMenu(ctx);
  });

  bot.action(CB_ALCH_BACK_CHAS, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditChasodiyMenu(ctx);
  });

  async function assertFishPanelOwner(ctx) {
    const userId = ctx.from?.id;
    const msg = ctx.callbackQuery?.message;
    if (userId == null) {
      await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
      return false;
    }
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
    return true;
  }

  bot.action(CB_FISH_PANEL_BACK, async (ctx) => {
    if (!(await assertFishPanelOwner(ctx))) return;
    await ctx.answerCbQuery();
    try {
      await ctx.deleteMessage();
    } catch {
      /* ignore */
    }
    await replyMainMenu(ctx);
  });

  bot.action(CB_FISH_PANEL_INV, async (ctx) => {
    if (!(await assertFishPanelOwner(ctx))) return;
    await ctx.answerCbQuery();
    await sendInventoryStandalone(ctx);
  });

  bot.action(CB_CHAS_INV, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    if (userId == null) return;
    try {
      await showInventoryScreen(ctx, userId);
    } catch {
      await sendInventoryStandalone(ctx);
    }
  });

  bot.action(CB_INV_BACK_CHAS, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditChasodiyMenu(ctx);
  });

  bot.action(CB_MENU_DUMOSVIT, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditDumosvitMenu(ctx);
  });

  bot.action(CB_MENU_LITOPYS, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditLitopysMenu(ctx);
  });

  bot.action(CB_LIT_HOME, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditLitopysMenu(ctx);
  });

  bot.action(CB_LIT_ADD, async (ctx) => {
    const uid = ctx.from?.id;
    if (uid == null) {
      await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
      return;
    }
    await setAwaitingTaskText(uid);
    await ctx.answerCbQuery({ text: "Напиши завдання в чат…" });
    await ctx.reply(
      "📝 <b>Нове завдання</b>\n\n" +
        "Напиши <b>одним повідомленням</b> у відповідь:\n" +
        "• лише текст — без нагадування;\n" +
        "• або <code>текст | 15.04.2026 18:30</code> — з нагадуванням.\n\n" +
        "Формат дати: <code>DD.MM.YYYY</code> або з годиною <code>DD.MM.YYYY HH:mm</code>.",
      { parse_mode: "HTML" }
    );
  });

  bot.action(CB_LIT_LIST, async (ctx) => {
    await ctx.answerCbQuery();
    await showLitopysTaskList(ctx);
  });

  bot.action(CB_LIT_CANCEL, async (ctx) => {
    const uid = ctx.from?.id;
    if (uid != null) await clearAwaitingTaskText(uid);
    await ctx.answerCbQuery({ text: "Скасовано" });
    await tryEditLitopysMenu(ctx);
  });

  bot.action(LIT_DONE_RE, async (ctx) => {
    const taskId = ctx.match[1];
    const uid = ctx.from?.id;
    if (uid == null) {
      await ctx.answerCbQuery({ text: "Помилка.", show_alert: true });
      return;
    }
    const ok = await markTaskDone(uid, taskId);
    await ctx.answerCbQuery({ text: ok ? "Виконано ✓" : "Не знайдено" });
    if (ok) await showLitopysTaskList(ctx);
  });

  bot.action(LIT_DEL_RE, async (ctx) => {
    const taskId = ctx.match[1];
    const uid = ctx.from?.id;
    if (uid == null) {
      await ctx.answerCbQuery({ text: "Помилка.", show_alert: true });
      return;
    }
    const ok = await deleteTask(uid, taskId);
    await ctx.answerCbQuery({ text: ok ? "Видалено" : "Не знайдено" });
    if (ok) await showLitopysTaskList(ctx);
  });

  bot.action(CB_DUMOSVIT_ENABLE, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) {
      await ctx.answerCbQuery({ text: "Немає чату.", show_alert: true });
      return;
    }
    await ctx.answerCbQuery({ text: "Увімкнено ✓" });
    await dumosvitScheduleNext(chatId);
    await tryEditDumosvitMenu(ctx);
  });

  bot.action(CB_DUMOSVIT_DISABLE, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) {
      await ctx.answerCbQuery({ text: "Немає чату.", show_alert: true });
      return;
    }
    await ctx.answerCbQuery({ text: "Вимкнено" });
    await dumosvitUnschedule(chatId);
    await tryEditDumosvitMenu(ctx);
  });

  bot.action(CB_DUMOSVIT_NOW, async (ctx) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (userId == null || chatId == null) {
      await ctx.answerCbQuery({ text: "Помилка профілю.", show_alert: true });
      return;
    }
    await ctx.answerCbQuery({ text: "Надсилаю…" });
    const word = await pickDumosvitWord(userId);
    await ctx.reply(formatDumosvitCaption(word), {
      parse_mode: "HTML",
      reply_markup: okKeyboard(),
    });
  });

  bot.action(CB_DUMOSVIT_OK, async (ctx) => {
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
  });

  bot.action(SELL_ONE_RE, async (ctx) => {
    const fishId = ctx.match[1];
    const userId = ctx.from?.id;
    if (!getFishMeta(fishId) || userId == null) {
      await ctx.answerCbQuery({ text: "Невідома риба.", show_alert: true });
      return;
    }
    const res = await sellFishUnits(userId, fishId, 1);
    if (res == null) {
      await ctx.answerCbQuery({ text: "Немає цієї риби.", show_alert: true });
      return;
    }
    await ctx.answerCbQuery({ text: `💰 +${res.earned} ✨` });
    try {
      await refreshInventoryScreen(ctx, userId);
    } catch {
      /* ignore */
    }
  });

  bot.action(COOK_ONE_RE, async (ctx) => {
    const fishId = ctx.match[1];
    const userId = ctx.from?.id;
    if (!getFishMeta(fishId) || userId == null) {
      await ctx.answerCbQuery({ text: "Невідома риба.", show_alert: true });
      return;
    }
    const ok = await removeFishFromInventory(userId, fishId, 1);
    if (!ok) {
      await ctx.answerCbQuery({ text: "Немає цієї риби.", show_alert: true });
      return;
    }
    const drops = rollCookDrops();
    const parts = [];
    for (const [rid, qty] of Object.entries(drops)) {
      await addResourceToInventory(userId, rid, qty);
      const m = getResourceMeta(rid);
      parts.push(`${m ? m.emoji : "📦"}×${qty}`);
    }
    const toast = `🍲 Готово! +${parts.join(" ")}`;
    await ctx.answerCbQuery({
      text: toast.length > 190 ? "🍲 + ресурси в інвентар" : toast,
    });
    try {
      await refreshInventoryScreen(ctx, userId);
    } catch {
      /* ignore */
    }
  });

  bot.action(ALCHEMY_CRAFT_RE, async (ctx) => {
    const recipeId = ctx.match[1];
    const recipe = getAlchemyRecipe(recipeId);
    const userId = ctx.from?.id;
    if (!recipe || userId == null) {
      await ctx.answerCbQuery({ text: "Невідомий рецепт.", show_alert: true });
      return;
    }
    const inv = await getInventory(userId);
    if (!canCraft(recipe, inv)) {
      await ctx.answerCbQuery({ text: "Не вистачає ресурсів.", show_alert: true });
      return;
    }
    const spent = await consumeResources(userId, recipe.consumes);
    if (!spent) {
      await ctx.answerCbQuery({ text: "Не вистачає ресурсів.", show_alert: true });
      return;
    }
    await addRelicToInventory(userId, recipe.relicId, 1);
    await ctx.answerCbQuery({ text: `🏺 ${recipe.name} готово!` });
    try {
      await tryEditAlchemyMenu(ctx);
    } catch {
      /* ignore */
    }
  });
}
