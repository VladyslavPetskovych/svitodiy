import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Telegraf } from "telegraf";
import { syncBotCommands } from "./botCommands.js";
import { registerCommandHandlers } from "./handlers/commands.js";
import { startDumosvitScheduler } from "./dumosvit/scheduler.js";
import { startLitopysScheduler } from "./litopys/scheduler.js";
import { connectRedis, disconnectRedis } from "./redisClient.js";

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

  const bot = new Telegraf(token);
  registerCommandHandlers(bot);

  const stopDumosvit = startDumosvitScheduler(bot, 45_000);
  const stopLitopys = startLitopysScheduler(bot, 30_000);

  await syncBotCommands(bot);

  await bot.launch();
  console.log("[telegram-bot] polling…");

  const shutdown = async (signal) => {
    stopDumosvit();
    stopLitopys();
    await bot.stop(signal);
    await disconnectRedis();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
