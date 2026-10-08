import express from "express";
import { recordBotError } from "./bot.js";
import { adminReport, saveContact } from "./game/admin.js";
import { buildCatalog } from "./game/catalog.js";
import { cast, cookFish, craft, equip, sellAllFish, sellFish } from "./game/chasodiy.js";
import { claimDaily } from "./game/daily.js";
import { moveDecor, placeDecor, removeDecor } from "./game/decor.js";
import { GameError } from "./game/errors.js";
import { collectHome, upgradeBuilding } from "./game/homestead.js";
import { claimGather, explore, startGather } from "./game/islands.js";
import {
  answerQuiz,
  arcMessage,
  completeTask,
  createNote,
  createTask,
  editNote,
  getBoard,
  listTasks,
  nextDumosvitCard,
  removeNote,
  removeTask,
  setDumosvitSettings,
  startArc,
  stopArc,
} from "./game/journal.js";
import { displayName, getState, upsertProfile } from "./game/state.js";
import { rateLimit } from "./rateLimit.js";
import { requireTelegramUser } from "./telegramAuth.js";

/**
 * Обгортка: помилки GameError → 4xx з текстом для гравця, решта → 500.
 * withState — додати свіжий стан гравця до відповіді (після дій, що його змінюють).
 */
function handler(fn, { withState = true } = {}) {
  return async (req, res) => {
    try {
      const result = (await fn(req)) ?? {};
      if (withState) result.state = await getState(req.tgUser.id);
      res.json(result);
    } catch (err) {
      if (err instanceof GameError) {
        res.status(err.status).json({ error: err.code, message: err.message });
        return;
      }
      console.error(`[server] ${req.method} ${req.path} failed:`, err);
      recordBotError(err); // лічильник помилок для вкладки «Адмін · сервер»
      res.status(500).json({ error: "internal", message: "Щось пішло не так. Спробуй ще раз." });
    }
  };
}

/** @param {string} botToken */
export function buildApiRouter(botToken) {
  const api = express.Router();
  const catalog = buildCatalog();

  // Статичні дані гри — без авторизації, кешуються браузером.
  api.get("/catalog", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(catalog);
  });

  api.use(requireTelegramUser(botToken), rateLimit({ windowMs: 10_000, max: 40 }));

  const uid = (req) => req.tgUser.id;
  const body = (req) => req.body ?? {};

  // Стан гравця. Відкриття апки також оновлює профіль (ім'я, фото).
  const loadState = handler(async (req) => {
    await upsertProfile(req.tgUser);
  });
  api.get("/state", loadState);
  api.get("/me", loadState); // стара назва з першої версії апки

  // Номер із WebApp.requestContact → відкриває персональні розділи, як контакт у боті.
  api.post("/contact", handler((req) => saveContact(uid(req), body(req).response, botToken)));

  api.post("/daily/claim", handler((req) => claimDaily(uid(req))));

  // Часодій
  api.post("/fish/cast", handler((req) => cast(uid(req)).then((outcome) => ({ outcome }))));
  api.post("/fish/sell", handler((req) => sellFish(uid(req), body(req).fishId, body(req).count)));
  api.post("/fish/sell-all", handler((req) => sellAllFish(uid(req))));
  api.post("/fish/cook",handler((req) => cookFish(uid(req), body(req).fishId)));
  api.post("/equip", handler((req) => equip(uid(req), body(req).slot, body(req).relicId ?? null)));
  api.post("/alchemy/craft", handler((req) => craft(uid(req), body(req).recipeId)));

  // Рідний острів: будівлі й комора
  api.post("/home/collect", handler((req) => collectHome(uid(req))));
  api.post("/home/:id/upgrade", handler((req) => upgradeBuilding(uid(req), req.params.id)));

  // Пісочниця: декор на острові
  api.post("/home/deco", handler((req) => placeDecor(uid(req), body(req).kind, body(req).x, body(req).y)));
  api.post("/home/deco/:id/move", handler((req) => moveDecor(uid(req), req.params.id, body(req).x, body(req).y)));
  api.delete("/home/deco/:id", handler((req) => removeDecor(uid(req), req.params.id)));

  // Острови
  api.post("/islands/:id/explore", handler((req) => explore(uid(req), req.params.id)));
  api.post("/islands/:id/gather", handler((req) => startGather(uid(req), req.params.id)));
  api.post("/gather/claim", handler((req) => claimGather(uid(req))));

  // Думосвіт
  api.post("/dumosvit/settings", handler((req) => setDumosvitSettings(uid(req), body(req))));
  api.post("/dumosvit/next", handler((req) => nextDumosvitCard(uid(req)), { withState: false }));
  api.post("/dumosvit/answer", handler((req) => answerQuiz(uid(req), body(req).token, body(req).index)));

  // Літописець
  api.get("/tasks", handler((req) => listTasks(uid(req)), { withState: false }));
  api.post("/tasks", handler((req) => createTask(uid(req), body(req)), { withState: false }));
  api.post("/tasks/:id/done", handler((req) => completeTask(uid(req), req.params.id), { withState: false }));
  api.delete("/tasks/:id", handler((req) => removeTask(uid(req), req.params.id), { withState: false }));

  // Арки
  api.post("/arcs/:id/start", handler((req) => startArc(uid(req), req.params.id)));
  api.post("/arcs/:id/stop", handler((req) => stopArc(uid(req), req.params.id)));
  api.post("/arcs/:id/message", handler((req) => arcMessage(uid(req), req.params.id), { withState: false }));

  // Дошка «Настя» (доступ за номером телефону, як у боті)
  api.get("/board", handler((req) => getBoard(uid(req)), { withState: false }));
  api.post(
    "/board",
    handler((req) => createNote(uid(req), displayName(req.tgUser), body(req).text), { withState: false })
  );
  api.patch(
    "/board/:id",
    handler((req) => editNote(uid(req), displayName(req.tgUser), req.params.id, body(req).text), {
      withState: false,
    })
  );
  api.delete("/board/:id", handler((req) => removeNote(uid(req), req.params.id), { withState: false }));

  // Адмін · сервер (доступ за номером, як у боті). Звіт збирається 1–2 с.
  api.get(
    "/admin/:view",
    rateLimit({ windowMs: 60_000, max: 20 }),
    handler((req) => adminReport(uid(req), req.params.view, botToken), { withState: false })
  );

  return api;
}
