import { registerLitopysTextMiddleware } from "../litopys/textMiddleware.js";
import { touchUser } from "../userStore.js";
import { registerFishingHandlers } from "./fishingPanel.js";
import { registerMenuHandlers, replyMainMenu } from "./menuHandlers.js";

/**
 * @param {import("telegraf").Telegraf} bot
 */
export function registerCommandHandlers(bot) {
  registerLitopysTextMiddleware(bot);
  registerMenuHandlers(bot);
  registerFishingHandlers(bot);

  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (userId != null) {
      await touchUser(userId);
    }
    await replyMainMenu(ctx, { withIntro: true });
  });
}
