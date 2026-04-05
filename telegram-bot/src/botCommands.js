/**
 * Команди в меню Telegram (після «/» у чаті з ботом).
 * @see https://core.telegram.org/bots/api#setmycommands
 */
const COMMANDS = [
  { command: "start", description: "Запуск бота і привітання" },
  { command: "menu", description: "Головне меню з фото" },
  { command: "fish", description: "Риболовля (Часодій)" },
  { command: "inv", description: "Інвентар і продаж риби" },
];

/**
 * @param {import("telegraf").Telegraf} bot
 */
export async function syncBotCommands(bot) {
  try {
    await bot.telegram.setMyCommands(COMMANDS);
    console.log("[telegram-bot] setMyCommands:", COMMANDS.map((c) => `/${c.command}`).join(", "));
  } catch (e) {
    console.warn("[telegram-bot] setMyCommands не вдалося:", e.message);
  }
}
