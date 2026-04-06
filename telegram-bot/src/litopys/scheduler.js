import {
  bumpReminderScore,
  dueReminderMembers,
  getTask,
  popReminderMember,
  stripRemindAt,
} from "./store.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** @param {{ title: string }} task */
function formatReminderCaption(task) {
  return (
    `🔔 <b>Літописець</b> — нагадування\n\n` +
    `${escapeHtml(task.title)}\n\n` +
    `<i>Відкрий «Мої завдання», щоб позначити виконаним.</i>`
  );
}

const RETRY_MS = 90_000;

/**
 * @param {import("telegraf").Telegraf} bot
 * @param {number} intervalMs
 */
export function startLitopysScheduler(bot, intervalMs = 15_000) {
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const due = await dueReminderMembers(Date.now(), 120);
      for (const { userId, taskId } of due) {
        const task = await getTask(userId, taskId);
        if (!task || task.done) {
          await popReminderMember(userId, taskId);
          continue;
        }
        let sent = false;
        try {
          await bot.telegram.sendMessage(userId, formatReminderCaption(task), {
            parse_mode: "HTML",
          });
          sent = true;
        } catch (err) {
          console.warn("[litopys] remind failed", userId, err.message);
          await bumpReminderScore(userId, taskId, Date.now() + RETRY_MS);
        }
        if (sent) {
          await popReminderMember(userId, taskId);
          await stripRemindAt(userId, taskId);
        }
      }
    } catch (e) {
      console.error("[litopys tick]", e);
    } finally {
      busy = false;
    }
  };

  const id = setInterval(tick, intervalMs);
  tick();
  return () => clearInterval(id);
}
