import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  REDEMPTION_DURATION_DAYS,
  pickRedemptionMessage,
} from "./redemptionContent.js";
import {
  disableRedemptionArc,
  getDueRedemptionUsers,
  getRedemptionState,
  popRedemptionDue,
  scheduleRedemptionNext,
} from "./redemptionStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REDEMPTION_IMAGE_PATH = path.join(__dirname, "../../assets/arcs/redemption.png");

function formatRedemptionCaption(dayNumber) {
  const safeDay = Math.max(1, dayNumber);
  const { quote, action } = pickRedemptionMessage(safeDay);
  return (
    `🜂 <b>Arc: Redemption</b> · Day <b>${safeDay}/${REDEMPTION_DURATION_DAYS}</b>\n\n` +
    `“${quote}”\n\n` +
    `🎯 <b>Micro action:</b> ${action}\n\n` +
    `<i>Keep going. Your new identity is built daily.</i>`
  );
}

function formatCompletionCaption() {
  return (
    `🏁 <b>Arc Complete: Redemption</b>\n\n` +
    `30 days finished. You proved that discipline can rewrite your story.\n\n` +
    `Take a breath, review your progress, and start the next chapter.`
  );
}

async function sendRedemptionMessage(telegram, userId, day) {
  const caption = formatRedemptionCaption(day);
  if (fs.existsSync(REDEMPTION_IMAGE_PATH)) {
    await telegram.sendPhoto(
      userId,
      { source: fs.createReadStream(REDEMPTION_IMAGE_PATH) },
      { caption, parse_mode: "HTML" }
    );
    return;
  }
  await telegram.sendMessage(userId, caption, { parse_mode: "HTML" });
}

export async function deliverRedemptionNow(telegram, userId) {
  const state = await getRedemptionState(userId);
  if (!state.enabled || state.done) return false;
  await sendRedemptionMessage(telegram, userId, state.day);
  return true;
}

/**
 * @param {import("telegraf").Telegraf} bot
 * @param {number} intervalMs
 */
export function startRedemptionScheduler(bot, intervalMs = 60_000) {
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const dueUserIds = await getDueRedemptionUsers(Date.now(), 100);
      for (const userIdStr of dueUserIds) {
        const userId = Number(userIdStr);
        await popRedemptionDue(userId);
        const state = await getRedemptionState(userId);
        if (!state.enabled) continue;

        if (state.done) {
          await disableRedemptionArc(userId);
          try {
            await bot.telegram.sendMessage(userId, formatCompletionCaption(), {
              parse_mode: "HTML",
            });
          } catch (err) {
            console.warn("[redemption] completion message failed", userId, err.message);
          }
          continue;
        }

        try {
          await sendRedemptionMessage(bot.telegram, userId, state.day);
          await scheduleRedemptionNext(userId);
        } catch (err) {
          console.warn("[redemption] send failed", userId, err.message);
          await scheduleRedemptionNext(userId);
        }
      }
    } catch (err) {
      console.error("[redemption tick]", err);
    } finally {
      busy = false;
    }
  };

  const id = setInterval(tick, intervalMs);
  tick();
  return () => clearInterval(id);
}
