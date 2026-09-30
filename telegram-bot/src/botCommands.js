/**
 * Команди в меню Telegram (після «/» у чаті з ботом).
 * @see https://core.telegram.org/bots/api#setmycommands
 */
const COMMANDS = [
  { command: "start", description: "Запуск бота і привітання" },
  { command: "menu", description: "Головне меню з фото" },
  { command: "fish", description: "Риболовля (Часодій)" },
  { command: "inv", description: "Інвентар і продаж риби" },
  { command: "litopys", description: "Літописець — завдання й нагадування" },
  { command: "phone", description: "Поділитися номером (особисті розділи)" },
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
  await syncMiniAppButton(bot);
}

/**
 * Кнопка біля поля вводу, що відкриває Mini App. Telegram приймає лише https-URL.
 * @param {import("telegraf").Telegraf} bot
 */
async function syncMiniAppButton(bot) {
  const url = process.env.MINIAPP_URL;
  try {
    await bot.telegram.setChatMenuButton({
      menuButton: url
        ? { type: "web_app", text: "🎮 Грати", web_app: { url } }
        : { type: "commands" },
    });
    console.log("[telegram-bot] menu button:", url ?? "commands");
  } catch (e) {
    console.warn("[telegram-bot] setChatMenuButton не вдалося:", e.message);
  }
}
