import { Input } from "telegraf";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ARC_CATALOG, ARC_DURATION_DAYS, getArcById } from "../chasodiy/arcContent.js";
import { deliverArcNow, getArcCoverPath } from "../chasodiy/arcScheduler.js";
import { disableArc, enableArc, getArcState } from "../chasodiy/arcStore.js";
import {
  CB_DV_INT_1,
  CB_DV_INT_2,
  CB_DV_INT_3,
  CB_DUMOSVIT_DISABLE,
  CB_DUMOSVIT_ENABLE,
  CB_DUMOSVIT_NOW,
  CB_DUMOSVIT_OK,
} from "../dumosvit/constants.js";
import {
  getDumosvitIntensity,
  intensityLabel,
  setDumosvitIntensity,
} from "../dumosvit/intensity.js";
import { deliverDumosvitToChat } from "../dumosvit/scheduler.js";
import {
  dumosvitIsScheduled,
  dumosvitScheduleNext,
  dumosvitUnschedule,
} from "../dumosvit/scheduleStore.js";
import { ALCHEMY_RECIPES, canCraft, getAlchemyRecipe } from "../data/alchemy.js";
import { rollCookDrops } from "../data/cookDrops.js";
import { CATCHES, getFishMeta } from "../data/fishTypes.js";
import { getRelicMeta } from "../data/relics.js";
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
  CB_CHAS_ARCS,
  CB_CHAS_BACK_MAIN,
  CB_CHAS_FISH,
  CB_CHAS_INV,
  CB_CHAS_MAP,
  CB_FISH_PANEL_BACK,
  CB_FISH_PANEL_INV,
  CB_INV_BACK_CHAS,
  CB_MAP_BACK_CHAS,
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
  addBalance,
  addRelicToInventory,
  addResourceToInventory,
  consumeResources,
  getBalance,
  getEquippedHook,
  getEquippedTalisman,
  getInventory,
  getPanelOwner,
  removeFishFromInventory,
  setEquippedHook,
  setEquippedTalisman,
  sellFishUnits,
} from "../userStore.js";
import { sendFishingPanel } from "./fishingPanel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORLD_MAP_PATH = path.join(__dirname, "../../assets/world-map-islands.png");
const JUNGLE_ISLAND_PATH = path.join(__dirname, "../../assets/island-jungle.png");
const JUNGLE_SNAKE_PATH = path.join(__dirname, "../../assets/jungle-snake.png");
const BLIZZARD_ISLAND_PATH = path.join(__dirname, "../../assets/island-blizzard.png");
const BLIZZARD_GOLEM_PATH = path.join(__dirname, "../../assets/blizzard-golem.png");
const ARC_MENU_RE = /^arc_menu_([a-z_]+)$/;
const ARC_START_RE = /^arc_start_([a-z_]+)$/;
const ARC_STOP_RE = /^arc_stop_([a-z_]+)$/;
const ARC_NOW_RE = /^arc_now_([a-z_]+)$/;
const ARC_BACK_TO_ONE = "arc_back_to_one";
const JUNGLE_EXPLORE_CB = "jungle_explore";
const JUNGLE_CHOP_WOOD_CB = "jungle_chop_wood";
const BLIZZARD_EXPLORE_CB = "blizzard_explore";
const BLIZZARD_MINE_ICE_CB = "blizzard_mine_ice";
const jungleWoodInProgress = new Set();
const blizzardIceInProgress = new Set();

const MAIN_MENU_INTRO =
  "Привіт! Керуй ботом кнопками нижче — на рахунку валюта <b>промінчики</b> ✨.";

const DUMOSVIT_MENU_TEXT =
  "📖 <b>Думосвіт</b>\n\n" +
  "Іспанська: <b>слова</b>, <b>фрази</b>, <b>тести</b> (обери переклад), іноді — <b>факти й граматика</b>. " +
  "Нагадування: обери інтенсивність нижче, потім увімкни таймер. " +
  "Після картки з відповіддю натисни <b>Окей</b>, щоб прибрати її з чату.";

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
      [{ text: "🗺 Карта плавань", callback_data: CB_CHAS_MAP }],
      [{ text: "🜂 Арки розвитку", callback_data: CB_CHAS_ARCS }],
      [{ text: "⬅ У головне меню", callback_data: CB_CHAS_BACK_MAIN }],
    ],
  };
}

function arcsListKeyboard() {
  const rows = ARC_CATALOG.map((arc) => [
    { text: `${arc.emoji} ${arc.title}`, callback_data: `arc_menu_${arc.id}` },
  ]);
  rows.push([{ text: "⬅ Часодій", callback_data: CB_MENU_CHASODIY }]);
  return { inline_keyboard: rows };
}

function arcDetailKeyboard(arcId, enabled) {
  const rows = [];
  if (enabled) {
    rows.push([{ text: "⏸ Зупинити арку", callback_data: `arc_stop_${arcId}` }]);
    rows.push([{ text: "📩 Надіслати фразу зараз", callback_data: `arc_now_${arcId}` }]);
  } else {
    rows.push([{ text: "▶ Почати 30-денну арку", callback_data: `arc_start_${arcId}` }]);
  }
  rows.push([{ text: "⬅ До арок", callback_data: ARC_BACK_TO_ONE }]);
  rows.push([{ text: "⬅ Часодій", callback_data: CB_MENU_CHASODIY }]);
  return { inline_keyboard: rows };
}

function mapKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🌴 Острів Джунглі", callback_data: "map_sail_jungle" }],
      [{ text: "❄️ Острів Хуртовина", callback_data: "map_sail_blizzard" }],
      [{ text: "🏜 Острів Пустеля", callback_data: "map_sail_desert" }],
      [{ text: "⬅ Часодій", callback_data: CB_MAP_BACK_CHAS }],
    ],
  };
}

function jungleIslandKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧭 Розвідка", callback_data: JUNGLE_EXPLORE_CB }],
      [{ text: "🪵 Добути дерево", callback_data: JUNGLE_CHOP_WOOD_CB }],
      [{ text: "⬅ До карти", callback_data: CB_CHAS_MAP }],
    ],
  };
}

function blizzardIslandKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧭 Розвідка", callback_data: BLIZZARD_EXPLORE_CB }],
      [{ text: "🧊 Добути лід", callback_data: BLIZZARD_MINE_ICE_CB }],
      [{ text: "⬅ До карти", callback_data: CB_CHAS_MAP }],
    ],
  };
}

function jungleIslandCaption() {
  return (
    `🌴 <b>Острів Джунглів</b>\n\n` +
    `Тут густі хащі й багато деревини.\n` +
    `Обери дію нижче: розвідка або заготівля дерева.`
  );
}

function blizzardIslandCaption() {
  return (
    `❄️ <b>Острів Хуртовини</b>\n\n` +
    `Сніг, лід і крижаний вітер.\n` +
    `Обери дію: розвідка або добич льоду.`
  );
}

function buildArcProgressBar(day, total) {
  const safeTotal = Math.max(1, total);
  const safeDay = Math.max(0, Math.min(day, safeTotal));
  const filled = Math.round((safeDay / safeTotal) * 10);
  return `${"🟩".repeat(filled)}${"⬜".repeat(10 - filled)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildProgressBar(done, total) {
  const fill = "🟩".repeat(done);
  const empty = "⬜".repeat(Math.max(0, total - done));
  return `${fill}${empty}`;
}

function jungleWoodProgressCaption(doneSteps, totalSteps) {
  const secondsDone = doneSteps * 5;
  const pct = Math.floor((secondsDone / 30) * 100);
  return (
    `🪓 <b>Добування дерева</b>\n\n` +
    `${buildProgressBar(doneSteps, totalSteps)} <b>${pct}%</b>\n` +
    `Минуло: <b>${secondsDone}/30 c</b>\n\n` +
    `Тримай курс — колода майже готова.`
  );
}

function blizzardIceProgressCaption(doneSteps, totalSteps) {
  const secondsDone = doneSteps * 5;
  const pct = Math.floor((secondsDone / 30) * 100);
  return (
    `⛏ <b>Добування льоду</b>\n\n` +
    `${buildProgressBar(doneSteps, totalSteps)} <b>${pct}%</b>\n` +
    `Минуло: <b>${secondsDone}/30 c</b>\n\n` +
    `Ще трохи — і брила льоду твоя.`
  );
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
  const int = await getDumosvitIntensity(chatId);
  const rows = [];
  rows.push([
    {
      text: int === 1 ? "✅ 🐢 Рідко" : "🐢 Рідко",
      callback_data: CB_DV_INT_1,
    },
    {
      text: int === 2 ? "✅ 🐇 Норма" : "🐇 Норма",
      callback_data: CB_DV_INT_2,
    },
    {
      text: int === 3 ? "✅ ⚡ Часто" : "⚡ Часто",
      callback_data: CB_DV_INT_3,
    },
  ]);
  if (on) {
    rows.push([
      { text: "⏹ Вимкнути нагадування", callback_data: CB_DUMOSVIT_DISABLE },
    ]);
  } else {
    rows.push([
      {
        text: "▶ Увімкнути нагадування",
        callback_data: CB_DUMOSVIT_ENABLE,
      },
    ]);
  }
  rows.push([{ text: "📩 Картка зараз", callback_data: CB_DUMOSVIT_NOW }]);
  rows.push([{ text: "⬅ У головне меню", callback_data: CB_MENU_MAIN }]);
  return { inline_keyboard: rows };
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
    `🔮 <b>Алхімія</b> — з ресурсів створюєш реліквії, ресурси й гачки для рибалки.\n` +
    `🗺 <b>Карта</b> — обери острів для майбутніх пригод.\n` +
    `🜂 <b>Арки</b> — особистісні 30-денні сюжетні цикли росту.`;
  try {
    await editMenuBody(ctx, cap, chasodiyMenuKeyboard());
  } catch {
    await ctx.reply(cap, {
      parse_mode: "HTML",
      reply_markup: chasodiyMenuKeyboard(),
    });
  }
}

async function openWorldMap(ctx) {
  const cap =
    `🗺 <b>Карта морів</b>\n\n` +
    `Три острови поруч: <b>Джунглі</b>, <b>Хуртовина</b>, <b>Пустеля</b>.\n` +
    `Обери куди плисти — далі додамо події та бої.`;
  const imagePath = fs.existsSync(WORLD_MAP_PATH) ? WORLD_MAP_PATH : MAIN_MENU_IMAGE_PATH;
  await ctx.replyWithPhoto(Input.fromLocalFile(imagePath), {
    caption: cap,
    parse_mode: "HTML",
    reply_markup: mapKeyboard(),
  });
}

async function openJungleIsland(ctx) {
  const imagePath = fs.existsSync(JUNGLE_ISLAND_PATH) ? JUNGLE_ISLAND_PATH : WORLD_MAP_PATH;
  await ctx.replyWithPhoto(Input.fromLocalFile(imagePath), {
    caption: jungleIslandCaption(),
    parse_mode: "HTML",
    reply_markup: jungleIslandKeyboard(),
  });
}

async function openBlizzardIsland(ctx) {
  const imagePath = fs.existsSync(BLIZZARD_ISLAND_PATH) ? BLIZZARD_ISLAND_PATH : WORLD_MAP_PATH;
  await ctx.replyWithPhoto(Input.fromLocalFile(imagePath), {
    caption: blizzardIslandCaption(),
    parse_mode: "HTML",
    reply_markup: blizzardIslandKeyboard(),
  });
}

async function tryEditArcsMenu(ctx) {
  const text =
    `🜂 <b>Арки розвитку</b>\n\n` +
    `Обери одну з 3 арок по 30 днів.\n`;
  try {
    await editMenuBody(ctx, text, arcsListKeyboard());
  } catch {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: arcsListKeyboard() });
  }
}

async function tryEditArcDetailMenu(ctx, arcId) {
  const userId = ctx.from?.id;
  if (userId == null) return;
  const arc = getArcById(arcId);
  if (!arc) return;
  const state = await getArcState(userId, arcId);
  const shownDay = state.startedAtMs > 0 ? Math.min(state.day, ARC_DURATION_DAYS) : 1;
  const dayLine = `Day <b>${shownDay}/${ARC_DURATION_DAYS}</b>`;
  const progressBar = buildArcProgressBar(shownDay, ARC_DURATION_DAYS);
  const progressPct = Math.floor((shownDay / ARC_DURATION_DAYS) * 100);
  const statusLine = state.enabled && !state.done ? "🟢 Active" : "⚪ Inactive";
  const text =
    `${arc.emoji} <b>Arc: ${arc.title}</b>\n\n` +
    `${arc.summary}\n\n` +
    `Status: ${statusLine}\n` +
    `${dayLine}\n` +
    `${progressBar} <b>${progressPct}%</b>`;
  const kb = arcDetailKeyboard(arcId, state.enabled && !state.done);
  const msg = ctx.callbackQuery?.message;
  const coverPath = getArcCoverPath(arcId);
  if (msg && "photo" in msg) {
    try {
      if (coverPath) {
        await ctx.editMessageMedia(
          {
            type: "photo",
            media: Input.fromLocalFile(coverPath),
            caption: text,
            parse_mode: "HTML",
          },
          { reply_markup: kb }
        );
      } else {
        await ctx.editMessageCaption(text, {
          parse_mode: "HTML",
          reply_markup: kb,
        });
      }
      return;
    } catch {
      /* fallback to sending new message */
    }
  }
  if (coverPath) {
    await ctx.replyWithPhoto(Input.fromLocalFile(coverPath), {
      caption: text,
      parse_mode: "HTML",
      reply_markup: kb,
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  }
}

async function tryEditAlchemyMenu(ctx) {
  const uid = ctx.from?.id;
  if (uid == null) return;
  const inv = await getInventory(uid);
  let cap =
    `🔮 <b>Алхімія</b>\n\n` +
    `Витрачаєш ресурси з <b>📦 Ресурси</b> і отримуєш <b>🏺 реліквії</b> або <b>📦 нові ресурси</b> ` +
    `(наприклад кусочок срібла для гачків).\n\n`;
  for (const rec of ALCHEMY_RECIPES) {
    let out = "";
    if (rec.relicId) {
      const rm = getRelicMeta(rec.relicId);
      out = rm ? ` → 🏺 ${rm.emoji} ${rm.name}` : " → 🏺 реліквія";
    } else if (rec.resourceId) {
      const rm = getResourceMeta(rec.resourceId);
      out = rm ? ` → 📦 ${rm.emoji} ${rm.name}` : " → 📦 ресурс";
    }
    cap += `${rec.emoji} <b>${rec.name}</b>${out}\n`;
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
  const int = await getDumosvitIntensity(chatId);
  const text =
    `${DUMOSVIT_MENU_TEXT}\n\n` +
    `<b>Частота нагадувань:</b> ${intensityLabel(int)}\n\n` +
    `На рахунку: ${formatBalanceHtml(bal)}`;
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

  const hasSilverHook = (inv.relic_hook_silver ?? 0) > 0;
  const hasGoldHook = (inv.relic_hook_gold ?? 0) > 0;
  if (hasSilverHook || hasGoldHook) {
    const hookRow = [];
    if (hasSilverHook) hookRow.push({ text: "🪝 Вдягнути срібний", callback_data: "ie_hook_silver" });
    if (hasGoldHook) hookRow.push({ text: "🔱 Вдягнути золотий", callback_data: "ie_hook_gold" });
    hookRow.push({ text: "⭕ Зняти гачок", callback_data: "ie_hook_none" });
    rows.push(hookRow);
  }

  const hasPearl = (inv.relic_pearl_talisman ?? 0) > 0;
  const hasAngler = (inv.relic_angler_charm ?? 0) > 0;
  if (hasPearl || hasAngler) {
    const talRow = [];
    if (hasPearl) talRow.push({ text: "🦪 Вдягнути перламутр", callback_data: "ie_tal_pearl" });
    if (hasAngler) talRow.push({ text: "🧿 Вдягнути амулет", callback_data: "ie_tal_angler" });
    talRow.push({ text: "⭕ Зняти талісман", callback_data: "ie_tal_none" });
    rows.push(talRow);
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
  const cap = formatInventoryCaption(inv, formatBalanceHtml(bal), {
    equippedHook: await getEquippedHook(userId),
    equippedTalisman: await getEquippedTalisman(userId),
  });
  await editMenuBody(ctx, cap, inventoryKeyboard(inv));
}

async function refreshInventoryScreen(ctx, userId) {
  const inv = await getInventory(userId);
  const bal = await getBalance(userId);
  const cap = formatInventoryCaption(inv, formatBalanceHtml(bal), {
    equippedHook: await getEquippedHook(userId),
    equippedTalisman: await getEquippedTalisman(userId),
  });
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
  const cap = formatInventoryCaption(inv, formatBalanceHtml(bal), {
    equippedHook: await getEquippedHook(userId),
    equippedTalisman: await getEquippedTalisman(userId),
  });
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
const INV_EQUIP_RE = /^ie_(hook|tal)_([a-z_]+)$/;
const MAP_SAIL_RE = /^map_sail_(jungle|blizzard|desert)$/;

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

  bot.action(CB_CHAS_MAP, async (ctx) => {
    await ctx.answerCbQuery();
    await openWorldMap(ctx);
  });

  bot.action(CB_CHAS_ARCS, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditArcsMenu(ctx);
  });

  bot.action(ARC_MENU_RE, async (ctx) => {
    const arcId = ctx.match[1];
    await ctx.answerCbQuery();
    await tryEditArcDetailMenu(ctx, arcId);
  });

  bot.action(ARC_BACK_TO_ONE, async (ctx) => {
    await ctx.answerCbQuery();
    await tryEditArcsMenu(ctx);
  });

  bot.action(ARC_START_RE, async (ctx) => {
    const arcId = ctx.match[1];
    const userId = ctx.from?.id;
    if (userId == null) {
      await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
      return;
    }
    const arc = getArcById(arcId);
    if (!arc) {
      await ctx.answerCbQuery({ text: "Невідома арка.", show_alert: true });
      return;
    }
    const started = await enableArc(userId, arcId);
    await ctx.answerCbQuery({ text: started ? `Арка ${arc.title} стартувала` : "Арка вже активна" });
    if (started) {
      try {
        await deliverArcNow(ctx.telegram, userId, arcId);
      } catch {
        /* ignore */
      }
    }
    await tryEditArcDetailMenu(ctx, arcId);
  });

  bot.action(ARC_STOP_RE, async (ctx) => {
    const arcId = ctx.match[1];
    const userId = ctx.from?.id;
    if (userId == null) {
      await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
      return;
    }
    await disableArc(userId, arcId);
    await ctx.answerCbQuery({ text: "Арку зупинено" });
    await tryEditArcDetailMenu(ctx, arcId);
  });

  bot.action(ARC_NOW_RE, async (ctx) => {
    const arcId = ctx.match[1];
    const userId = ctx.from?.id;
    if (userId == null) {
      await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
      return;
    }
    try {
      const ok = await deliverArcNow(ctx.telegram, userId, arcId);
      await ctx.answerCbQuery({ text: ok ? "Надсилаю цитату" : "Арка не активна", show_alert: !ok });
    } catch {
      await ctx.answerCbQuery({ text: "Не вдалося надіслати зараз.", show_alert: true });
    }
  });

  bot.action(CB_MAP_BACK_CHAS, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      await ctx.deleteMessage();
    } catch {
      /* ignore */
    }
    await tryEditChasodiyMenu(ctx);
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

  bot.action(INV_EQUIP_RE, async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) {
      await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
      return;
    }
    const slot = ctx.match[1];
    const variant = ctx.match[2];
    const inv = await getInventory(userId);

    if (slot === "hook") {
      if (variant === "none") {
        await setEquippedHook(userId, null);
        await ctx.answerCbQuery({ text: "Гачок знято" });
      } else if (variant === "silver") {
        if ((inv.relic_hook_silver ?? 0) < 1) {
          await ctx.answerCbQuery({ text: "Немає срібного гачка.", show_alert: true });
          return;
        }
        await setEquippedHook(userId, "relic_hook_silver");
        await ctx.answerCbQuery({ text: "🪝 Срібний гачок вдягнуто" });
      } else if (variant === "gold") {
        if ((inv.relic_hook_gold ?? 0) < 1) {
          await ctx.answerCbQuery({ text: "Немає золотого гачка.", show_alert: true });
          return;
        }
        await setEquippedHook(userId, "relic_hook_gold");
        await ctx.answerCbQuery({ text: "🔱 Золотий гачок вдягнуто" });
      } else {
        await ctx.answerCbQuery({ text: "Невідомий гачок.", show_alert: true });
        return;
      }
    } else {
      if (variant === "none") {
        await setEquippedTalisman(userId, null);
        await ctx.answerCbQuery({ text: "Талісман знято" });
      } else if (variant === "pearl") {
        if ((inv.relic_pearl_talisman ?? 0) < 1) {
          await ctx.answerCbQuery({ text: "Немає перламутрового талісмана.", show_alert: true });
          return;
        }
        await setEquippedTalisman(userId, "relic_pearl_talisman");
        await ctx.answerCbQuery({ text: "🦪 Перламутр вдягнуто" });
      } else if (variant === "angler") {
        if ((inv.relic_angler_charm ?? 0) < 1) {
          await ctx.answerCbQuery({ text: "Немає амулета рибалки.", show_alert: true });
          return;
        }
        await setEquippedTalisman(userId, "relic_angler_charm");
        await ctx.answerCbQuery({ text: "🧿 Амулет вдягнуто" });
      } else {
        await ctx.answerCbQuery({ text: "Невідомий талісман.", show_alert: true });
        return;
      }
    }

    try {
      await refreshInventoryScreen(ctx, userId);
    } catch {
      /* ignore */
    }
  });

  bot.action(MAP_SAIL_RE, async (ctx) => {
    const island = ctx.match[1];
    const labels = {
      jungle: "🌴 Джунглі",
      blizzard: "❄️ Хуртовина",
      desert: "🏜 Пустеля",
    };
    await ctx.answerCbQuery({ text: `Курс: ${labels[island]}` });
    if (island === "jungle") {
      await openJungleIsland(ctx);
      return;
    }
    if (island === "blizzard") {
      await openBlizzardIsland(ctx);
      return;
    }
    await ctx.reply(
      `⛵ Ти тримаєш курс на ${labels[island]}.\n` +
        `Скоро тут будуть події, бої та унікальний лут острова.`
    );
  });

  bot.action(JUNGLE_EXPLORE_CB, async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) {
      await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
      return;
    }

    await ctx.answerCbQuery({ text: "Розвідка..." });
    const snakeAttack = Math.random() < 0.25;
    if (!snakeAttack) {
      await ctx.reply(
        "🧭 Ти проходиш хащами Джунглів.\nЗнайшов сліди старого табору. Тут точно є ресурси."
      );
      return;
    }

    const winFight = Math.random() < 0.5;
    if (winFight) {
      const newBalance = await addBalance(userId, 10);
      const cap =
        "🐍 <b>Засідка в джунглях!</b>\n\n" +
        "Тебе атакувала змія, але ти переміг у сутичці.\n" +
        "✨ <b>+10 промінчиків</b>\n" +
        `💰 Баланс: <b>${newBalance}</b>`;
      if (fs.existsSync(JUNGLE_SNAKE_PATH)) {
        await ctx.replyWithPhoto(Input.fromLocalFile(JUNGLE_SNAKE_PATH), {
          caption: cap,
          parse_mode: "HTML",
        });
      } else {
        await ctx.reply(cap, { parse_mode: "HTML" });
      }
      return;
    }

    const curBalance = await getBalance(userId);
    const penalty = Math.min(10, curBalance);
    const newBalance = penalty > 0 ? await addBalance(userId, -penalty) : curBalance;
    const cap =
      "🐍 <b>Засідка в джунглях!</b>\n\n" +
      "Змія вкусила тебе, довелося відступити.\n" +
      `✨ <b>-${penalty} промінчиків</b>\n` +
      `💰 Баланс: <b>${newBalance}</b>`;
    if (fs.existsSync(JUNGLE_SNAKE_PATH)) {
      await ctx.replyWithPhoto(Input.fromLocalFile(JUNGLE_SNAKE_PATH), {
        caption: cap,
        parse_mode: "HTML",
      });
    } else {
      await ctx.reply(cap, { parse_mode: "HTML" });
    }
  });

  bot.action(JUNGLE_CHOP_WOOD_CB, async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) {
      await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
      return;
    }
    if (jungleWoodInProgress.has(userId)) {
      await ctx.answerCbQuery({
        text: "Заготівля вже триває. Дочекайся завершення.",
        show_alert: true,
      });
      return;
    }

    jungleWoodInProgress.add(userId);
    await ctx.answerCbQuery({ text: "Починаю рубати дерево..." });

    const msg = ctx.callbackQuery?.message;
    const canEditCaption = !!msg && "photo" in msg;
    const totalSteps = 6;

    try {
      if (canEditCaption) {
        await ctx.editMessageCaption(jungleWoodProgressCaption(0, totalSteps), {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [] },
        });
      }

      for (let step = 1; step <= totalSteps; step++) {
        await sleep(5000);
        if (!canEditCaption) continue;
        await ctx.editMessageCaption(jungleWoodProgressCaption(step, totalSteps), {
          parse_mode: "HTML",
          reply_markup: step === totalSteps ? jungleIslandKeyboard() : { inline_keyboard: [] },
        });
      }

      const totalLogs = await addResourceToInventory(userId, "log", 1);
      await ctx.reply(
        `✅ Заготівля завершена!\n🪵 +1 колода додана в інвентар.\nУсього колод: <b>${totalLogs}</b>.`,
        { parse_mode: "HTML" }
      );
    } finally {
      jungleWoodInProgress.delete(userId);
    }
  });

  bot.action(BLIZZARD_EXPLORE_CB, async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) {
      await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
      return;
    }

    await ctx.answerCbQuery({ text: "Розвідка..." });
    const golemAttack = Math.random() < 0.25;
    if (!golemAttack) {
      await ctx.reply(
        "🧭 Ти розвідуєш льодяні печери Хуртовини.\nЗнайшов безпечну стежку між заметами."
      );
      return;
    }

    const winFight = Math.random() < 0.5;
    if (winFight) {
      const newBalance = await addBalance(userId, 10);
      const cap =
        "☃️ <b>Напад сніговика-голема!</b>\n\n" +
        "Ти розбив крижаний панцир і переміг.\n" +
        "✨ <b>+10 промінчиків</b>\n" +
        `💰 Баланс: <b>${newBalance}</b>`;
      if (fs.existsSync(BLIZZARD_GOLEM_PATH)) {
        await ctx.replyWithPhoto(Input.fromLocalFile(BLIZZARD_GOLEM_PATH), {
          caption: cap,
          parse_mode: "HTML",
        });
      } else {
        await ctx.reply(cap, { parse_mode: "HTML" });
      }
      return;
    }

    const curBalance = await getBalance(userId);
    const penalty = Math.min(10, curBalance);
    const newBalance = penalty > 0 ? await addBalance(userId, -penalty) : curBalance;
    const cap =
      "☃️ <b>Напад сніговика-голема!</b>\n\n" +
      "Голем збив тебе крижаним ударом.\n" +
      `✨ <b>-${penalty} промінчиків</b>\n` +
      `💰 Баланс: <b>${newBalance}</b>`;
    if (fs.existsSync(BLIZZARD_GOLEM_PATH)) {
      await ctx.replyWithPhoto(Input.fromLocalFile(BLIZZARD_GOLEM_PATH), {
        caption: cap,
        parse_mode: "HTML",
      });
    } else {
      await ctx.reply(cap, { parse_mode: "HTML" });
    }
  });

  bot.action(BLIZZARD_MINE_ICE_CB, async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) {
      await ctx.answerCbQuery({ text: "Немає профілю.", show_alert: true });
      return;
    }
    if (blizzardIceInProgress.has(userId)) {
      await ctx.answerCbQuery({
        text: "Добування вже триває. Дочекайся завершення.",
        show_alert: true,
      });
      return;
    }

    blizzardIceInProgress.add(userId);
    await ctx.answerCbQuery({ text: "Починаю добувати лід..." });

    const msg = ctx.callbackQuery?.message;
    const canEditCaption = !!msg && "photo" in msg;
    const totalSteps = 6;

    try {
      if (canEditCaption) {
        await ctx.editMessageCaption(blizzardIceProgressCaption(0, totalSteps), {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [] },
        });
      }

      for (let step = 1; step <= totalSteps; step++) {
        await sleep(5000);
        if (!canEditCaption) continue;
        await ctx.editMessageCaption(blizzardIceProgressCaption(step, totalSteps), {
          parse_mode: "HTML",
          reply_markup: step === totalSteps ? blizzardIslandKeyboard() : { inline_keyboard: [] },
        });
      }

      const totalIce = await addResourceToInventory(userId, "ice_block", 1);
      await ctx.reply(
        `✅ Добування завершено!\n🧊 +1 брила льоду додана в інвентар.\nУсього брил льоду: <b>${totalIce}</b>.`,
        { parse_mode: "HTML" }
      );
    } finally {
      blizzardIceInProgress.delete(userId);
    }
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

  bot.action(CB_DV_INT_1, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) {
      await ctx.answerCbQuery({ text: "Немає чату.", show_alert: true });
      return;
    }
    await setDumosvitIntensity(chatId, 1);
    await ctx.answerCbQuery({ text: "🐢 Рідко" });
    await tryEditDumosvitMenu(ctx);
  });

  bot.action(CB_DV_INT_2, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) {
      await ctx.answerCbQuery({ text: "Немає чату.", show_alert: true });
      return;
    }
    await setDumosvitIntensity(chatId, 2);
    await ctx.answerCbQuery({ text: "🐇 Норма" });
    await tryEditDumosvitMenu(ctx);
  });

  bot.action(CB_DV_INT_3, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) {
      await ctx.answerCbQuery({ text: "Немає чату.", show_alert: true });
      return;
    }
    await setDumosvitIntensity(chatId, 3);
    await ctx.answerCbQuery({ text: "⚡ Часто" });
    await tryEditDumosvitMenu(ctx);
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
    await deliverDumosvitToChat(ctx.telegram, chatId);
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
    if (recipe.relicId && recipe.resourceId) {
      await ctx.answerCbQuery({ text: "Помилка рецепта.", show_alert: true });
      return;
    }
    if (recipe.relicId) {
      await addRelicToInventory(userId, recipe.relicId, 1);
      await ctx.answerCbQuery({ text: `🏺 ${recipe.name} готово!` });
    } else if (recipe.resourceId) {
      await addResourceToInventory(userId, recipe.resourceId, 1);
      await ctx.answerCbQuery({ text: `📦 ${recipe.name} готово!` });
    } else {
      await ctx.answerCbQuery({ text: "Невідомий вихід рецепта.", show_alert: true });
      return;
    }
    try {
      await tryEditAlchemyMenu(ctx);
    } catch {
      /* ignore */
    }
  });
}
