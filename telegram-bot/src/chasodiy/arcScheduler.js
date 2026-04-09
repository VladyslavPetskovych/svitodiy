import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ARC_CATALOG,
  ARC_DURATION_DAYS,
  getArcById,
  pickArcMessage,
} from "./arcContent.js";
import {
  bumpArcMessageCounter,
  disableArc,
  getArcState,
  getDueArcUsers,
  popArcDue,
  scheduleArcNext,
} from "./arcStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STOCK_PHRASES_DIR = path.join(__dirname, "../../assets/stockForPhrases");
const ARC_COVERS_DIR = path.join(__dirname, "../../assets/arcs");
const ARC_STOCK_DIRS = {
  redemption: [
    path.join(__dirname, "../../assets/stockForRedemption"),
    STOCK_PHRASES_DIR,
  ],
  grinding: [
    // Keep both spellings for compatibility with existing folders.
    path.join(__dirname, "../../assets/stockForGrindidng"),
    path.join(__dirname, "../../assets/stockForGrinding"),
    STOCK_PHRASES_DIR,
  ],
  resilience: [
    path.join(__dirname, "../../assets/stockForResilience"),
    STOCK_PHRASES_DIR,
  ],
};
const FIXED_INTERVAL_MS = Number(process.env.ARC_INTERVAL_MS || 0);
const MIN_INTERVAL_MS = Number(process.env.ARC_MIN_INTERVAL_MS || 6 * 60 * 60 * 1000);
const MAX_INTERVAL_MS = Number(process.env.ARC_MAX_INTERVAL_MS || 14 * 60 * 60 * 1000);

function listImagesFromDir(dirPath) {
  try {
    const files = fs.readdirSync(dirPath);
    return files
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((f) => path.join(dirPath, f));
  } catch {
    return [];
  }
}

function pickRandomStockImage(arcId) {
  const dirs = ARC_STOCK_DIRS[arcId] ?? [STOCK_PHRASES_DIR];
  /** @type {string[]} */
  let images = [];
  for (const d of dirs) {
    images = listImagesFromDir(d);
    if (images.length > 0) break;
  }
  if (images.length === 0) return null;
  const idx = Math.floor(Math.random() * images.length);
  return images[idx];
}

function nextDelayMs() {
  if (Number.isFinite(FIXED_INTERVAL_MS) && FIXED_INTERVAL_MS > 0) {
    return FIXED_INTERVAL_MS;
  }
  const min = Math.max(60_000, Math.floor(MIN_INTERVAL_MS));
  const max = Math.max(min, Math.floor(MAX_INTERVAL_MS));
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function getArcCoverPath(arcId) {
  const arc = getArcById(arcId);
  if (!arc?.coverFile) return null;
  const p = path.join(ARC_COVERS_DIR, arc.coverFile);
  return fs.existsSync(p) ? p : null;
}

function formatArcCaption(arc, dayNumber, messageCount) {
  const safeDay = Math.max(1, dayNumber);
  const { quote, action } = pickArcMessage(arc.id, safeDay, messageCount);
  const progressPct = Math.floor((Math.min(safeDay, ARC_DURATION_DAYS) / ARC_DURATION_DAYS) * 100);
  return (
    `${arc.emoji} <b>Arc: ${arc.title}</b> · Day <b>${safeDay}/${ARC_DURATION_DAYS}</b>\n\n` +
    `“${quote}”\n\n` +
    `🎯 <b>Micro action:</b> ${action}\n\n` +
    `📈 Progress: <b>${progressPct}%</b>\n` +
    `<i>${arc.summary}</i>`
  );
}

function formatCompletionCaption(arc) {
  return (
    `🏁 <b>Arc Complete: ${arc.title}</b>\n\n` +
    `30 days finished.\n${arc.completionLine}\n\n` +
    `Take a short review and begin your next arc.`
  );
}

async function sendArcMessage(telegram, userId, arcId, day, messageCount) {
  const arc = getArcById(arcId);
  if (!arc) return;
  const caption = formatArcCaption(arc, day, messageCount);
  const imagePath = pickRandomStockImage(arcId);
  if (imagePath) {
    await telegram.sendPhoto(userId, { source: fs.createReadStream(imagePath) }, { caption, parse_mode: "HTML" });
    return;
  }
  await telegram.sendMessage(userId, caption, { parse_mode: "HTML" });
}

export async function deliverArcNow(telegram, userId, arcId) {
  const state = await getArcState(userId, arcId);
  if (!state.enabled || state.done) return false;
  const messageCount = await bumpArcMessageCounter(userId, arcId);
  await sendArcMessage(telegram, userId, arcId, state.day, messageCount);
  return true;
}

/**
 * @param {import("telegraf").Telegraf} bot
 * @param {number} intervalMs
 */
export function startArcScheduler(bot, intervalMs = 60_000) {
  let busy = false;
  const arcIds = ARC_CATALOG.map((a) => a.id);

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const arcId of arcIds) {
        const dueUserIds = await getDueArcUsers(arcId, Date.now(), 100);
        for (const userIdStr of dueUserIds) {
          const userId = Number(userIdStr);
          await popArcDue(userId, arcId);
          const state = await getArcState(userId, arcId);
          if (!state.enabled) continue;

          if (state.done) {
            await disableArc(userId, arcId);
            try {
              const arc = getArcById(arcId);
              if (arc) {
                await bot.telegram.sendMessage(userId, formatCompletionCaption(arc), {
                  parse_mode: "HTML",
                });
              }
            } catch (err) {
              console.warn("[arc] completion message failed", arcId, userId, err.message);
            }
            continue;
          }

          try {
            const messageCount = await bumpArcMessageCounter(userId, arcId);
            await sendArcMessage(bot.telegram, userId, arcId, state.day, messageCount);
            await scheduleArcNext(userId, arcId, nextDelayMs());
          } catch (err) {
            console.warn("[arc] send failed", arcId, userId, err.message);
            await scheduleArcNext(userId, arcId, nextDelayMs());
          }
        }
      }
    } catch (err) {
      console.error("[arc tick]", err);
    } finally {
      busy = false;
    }
  };

  const id = setInterval(tick, intervalMs);
  tick();
  return () => clearInterval(id);
}
