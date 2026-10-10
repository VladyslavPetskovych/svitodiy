/**
 * Єдина точка входу в модулі бота. Сервер не дублює ігрову логіку:
 * шанси, рецепти, ключі Redis і формули — ті самі, що в telegram-bot,
 * тож гра в Mini App і в чаті завжди поводяться однаково.
 *
 * У Docker обидві папки лежать поруч (/app/server, /app/telegram-bot) —
 * див. server/Dockerfile.
 */
export { connectRedis, getRedis } from "../../telegram-bot/src/redisClient.js";
export * from "../../telegram-bot/src/userStore.js";
export { rollCastOutcome } from "../../telegram-bot/src/fishing.js";
export { CATCHES, getFishMeta } from "../../telegram-bot/src/data/fishTypes.js";
export { RESOURCE_TYPES, getResourceMeta } from "../../telegram-bot/src/data/resources.js";
export { RELICS, getRelicMeta } from "../../telegram-bot/src/data/relics.js";
export { ALCHEMY_RECIPES, canCraft, getAlchemyRecipe } from "../../telegram-bot/src/data/alchemy.js";
export { FISHING_CHANCES } from "../../telegram-bot/src/data/fishingChances.js";
export { HOOK_FISH_SHIFT, TALISMAN_FISH_SHIFT } from "../../telegram-bot/src/data/fishingHooks.js";
export { COOK_DROP_WEIGHTS, rollCookDrops } from "../../telegram-bot/src/data/cookDrops.js";
export { hasAdminAccess, hasNastiaAccess, sharedHomeId } from "../../telegram-bot/src/specialAccess.js";
export {
  ARC_CATALOG,
  ARC_DURATION_DAYS,
  getArcById,
  pickArcMessage,
} from "../../telegram-bot/src/chasodiy/arcContent.js";
export {
  bumpArcMessageCounter,
  disableArc,
  enableArc,
  getArcState,
} from "../../telegram-bot/src/chasodiy/arcStore.js";
export {
  getDumosvitIntensity,
  intensityLabel,
  setDumosvitIntensity,
} from "../../telegram-bot/src/dumosvit/intensity.js";
export {
  dumosvitIsScheduled,
  dumosvitScheduleNext,
  dumosvitUnschedule,
} from "../../telegram-bot/src/dumosvit/scheduleStore.js";
export { pickDumosvitDelivery } from "../../telegram-bot/src/dumosvit/pickWord.js";
export { deleteQuizSession, getQuizSession } from "../../telegram-bot/src/dumosvit/quiz.js";
export {
  addTask,
  deleteTask,
  getTasks,
  markTaskDone,
} from "../../telegram-bot/src/litopys/store.js";
export {
  MAX_NOTES,
  MAX_NOTE_LEN,
  addNote,
  deleteNote,
  listNotes,
  updateNote,
} from "../../telegram-bot/src/nastia/boardStore.js";
export { buildMonitorReport, recordBotError } from "../../telegram-bot/src/admin/monitor.js";
export { buildContainersReport } from "../../telegram-bot/src/admin/docker.js";
export { buildProcessesReport } from "../../telegram-bot/src/admin/processes.js";
