import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Telegraf } from "telegraf";
import { syncBotCommands } from "./botCommands.js";
import { registerCommandHandlers } from "./handlers/commands.js";
import { startDumosvitScheduler } from "./dumosvit/scheduler.js";
import { startLitopysScheduler } from "./litopys/scheduler.js";
import { startArcScheduler } from "./chasodiy/arcScheduler.js";
import { connectRedis, disconnectRedis } from "./redisClient.js";
import { restoreUserDataIfRedisEmpty, startUserBackupLoop } from "./userBackup.js";
import { recordBotError, recordBotStart } from "./admin/monitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

async function main() {
  await connectRedis();
  await recordBotStart();
  await restoreUserDataIfRedisEmpty();
  const stopBackupLoop = startUserBackupLoop();

  const bot = new Telegraf(token);
  // Без цього будь-яка помилка в обробнику (напр. користувач заблокував бота)
  // зупиняє polling і весь процес падає.
  bot.catch((err, ctx) => {
    console.error(`[telegram-bot] update ${ctx?.update?.update_id} failed:`, err);
    recordBotError(err);
  });
  registerCommandHandlers(bot);

  const stopDumosvit = startDumosvitScheduler(bot, 45_000);
  const stopLitopys = startLitopysScheduler(bot, 15_000);
  const stopArcs = startArcScheduler(bot, 60_000);

  await syncBotCommands(bot);

  const shutdown = async (signal) => {
    stopDumosvit();
    stopLitopys();
    stopArcs();
    await stopBackupLoop();
    await bot.stop(signal);
    await disconnectRedis();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  // У Telegraf 4.16 launch() резолвиться лише після зупинки бота,
  // тому обробники сигналів реєструємо до нього.
  await bot.launch(() => console.log("[telegram-bot] polling…"));
}

process.on("unhandledRejection", (err) => {
  console.error("[telegram-bot] unhandledRejection:", err);
  recordBotError(err);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
