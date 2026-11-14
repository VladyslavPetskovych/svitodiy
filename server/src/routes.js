import express from "express";
import { recordBotError } from "./bot.js";
import { adminReport, saveContact } from "./game/admin.js";
import { buildCatalog } from "./game/catalog.js";
import { cast, cookFish, craft, equip, sellAllFish, sellFish } from "./game/chasodiy.js";
import { claimDaily } from "./game/daily.js";
import { layCables, removeCables } from "./game/cables.js";
import { smelt } from "./game/furnace.js";
import { moveDecor, placeDecor, removeDecor } from "./game/decor.js";
import { commandDog, feedDog, petDog } from "./game/dogs.js";
import { GameError } from "./game/errors.js";
import { moveInterior, placeInterior, removeInterior, setFloor } from "./game/interior.js";
import { craftRecipe, craftTool } from "./game/craft.js";
import { equipWear, getWearItem } from "./game/wardrobe.js";
import { buySeeds, clearPlot, harvestPlot, moveBed, placeBed, plantPlot, removeBed, sellCrops, tillPlot, waterPlot } from "./game/farm.js";
import { ackReset, collectHome, demolishBuilding, moveBuilding, placeBuilding, upgradeBuilding } from "./game/homestead.js";
import { gatherNode } from "./game/nodes.js";
import { collectRubber } from "./game/rubber.js";
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
  checkDumosvitText,
  finishDumosvitPairs,
  nextDumosvitCard,
  removeNote,
  removeTask,
  setDumosvitSettings,
  startArc,
  stopArc,
} from "./game/journal.js";
import { bumpIsland, leavePresence, postPresence, wearChanged } from "./game/presence.js";
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

  api.use(requireTelegramUser(botToken));

  const uid = (req) => req.tgUser.id;
  const body = (req) => req.body ?? {};

  // Хто ще на спільному острові. Опитується часто (до 2/с), тож має свій ліміт і стоїть
  // ДО загального — інакше з'їв би гравцеві весь ліміт на справжні дії. Redis не чіпає.
  const presenceLimit = rateLimit({ windowMs: 10_000, max: 40 });
  api.post("/presence", presenceLimit, handler((req) => postPresence(req.tgUser, req.body), { withState: false }));
  api.delete("/presence", presenceLimit, handler((req) => leavePresence(uid(req)), { withState: false }));

  api.use(rateLimit({ windowMs: 10_000, max: 40 }));

  /**
   * Дія змінює спільний острів (будівлі, декор, город, хата, пси, ресурси) — підняти його версію,
   * щоб інші мешканці підхопили зміну. До getState у handler — тож сам гравець уже «бачив» нову версію.
   */
  const island = (fn) => async (req) => {
    const result = await fn(req);
    await bumpIsland(uid(req));
    return result;
  };

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
  api.post("/home/collect", handler(island((req) => collectHome(uid(req)))));
  api.post("/home/:id/upgrade", handler(island((req) => upgradeBuilding(uid(req), req.params.id))));
  // Будівлі, які гравець ставить сам: поставити, перенести, розібрати (з поверненням усього витраченого).
  api.post("/home/reset/ack", handler((req) => ackReset(uid(req))));
  api.post("/home/:id/place", handler(island((req) => placeBuilding(uid(req), req.params.id, body(req).x, body(req).y))));
  api.post("/home/:id/move", handler(island((req) => moveBuilding(uid(req), req.params.id, body(req).x, body(req).y))));
  api.delete("/home/building/:id", handler(island((req) => demolishBuilding(uid(req), req.params.id))));

  // Пісочниця: декор на острові
  api.post("/home/deco", handler(island((req) => placeDecor(uid(req), body(req).kind, body(req).x, body(req).y))));
  api.post("/home/deco/:id/move", handler(island((req) => moveDecor(uid(req), req.params.id, body(req).x, body(req).y))));
  api.delete("/home/deco/:id", handler(island((req) => removeDecor(uid(req), req.params.id))));

  // Електрика: кабелі під землею (за один запит — смуга клітинок, як тягнеш пальцем)
  api.post("/home/cables", handler(island((req) => layCables(uid(req), body(req).cells))));
  api.delete("/home/cables", handler(island((req) => removeCables(uid(req), body(req).cells))));
  // Електропіч: переплавити (скло, мідь, залізо) за енергію з акумуляторів своєї мережі
  api.post("/home/furnace/:id/smelt", handler(island((req) => smelt(uid(req), req.params.id, body(req).recipe, body(req).count))));

  // Пісочниця в хатинці: меблі й речі на стінах
  api.post("/home/interior", handler(island((req) => placeInterior(uid(req), body(req)))));
  api.post("/home/interior/:id/move", handler(island((req) => moveInterior(uid(req), req.params.id, body(req)))));
  api.delete("/home/interior/:id", handler(island((req) => removeInterior(uid(req), req.params.id))));
  api.post("/home/floor", handler(island((req) => setFloor(uid(req), body(req)))));

  /** Перевдягся — сусіди по спільному острову побачать новий одяг з наступним опитуванням. */
  const dressed = (req) => (result) => {
    wearChanged(uid(req));
    return result;
  };
  // Шафа: пошити / купити одяг (одразу вдягається) і перевдягтися в своє
  api.post("/wear/get", handler((req) => getWearItem(uid(req), body(req).item, body(req).how).then(dressed(req))));
  api.post("/wear/equip", handler((req) => equipWear(uid(req), body(req).slot, body(req).item ?? null).then(dressed(req))));

  // Город: грядки, насіння, урожай
  api.post("/farm/:plot/till", handler(island((req) => tillPlot(uid(req), req.params.plot))));
  api.post("/farm/:plot/plant", handler(island((req) => plantPlot(uid(req), req.params.plot, body(req).crop))));
  api.post("/farm/:plot/water", handler(island((req) => waterPlot(uid(req), req.params.plot))));
  api.post("/farm/:plot/harvest", handler(island((req) => harvestPlot(uid(req), req.params.plot))));
  api.post("/farm/:plot/clear", handler(island((req) => clearPlot(uid(req), req.params.plot))));
  api.post("/farm/seeds", handler((req) => buySeeds(uid(req), body(req).crop, body(req).count)));
  api.post("/farm/sell", handler((req) => sellCrops(uid(req), body(req).crop, body(req).count)));
  api.post("/farm/beds", handler(island((req) => placeBed(uid(req), body(req).x, body(req).y))));
  api.post("/farm/beds/:plot/move", handler(island((req) => moveBed(uid(req), req.params.plot, body(req).x, body(req).y))));
  api.delete("/farm/beds/:plot", handler(island((req) => removeBed(uid(req), req.params.plot))));

  // Виживання: дерева й каміння на острові, верстат
  api.post("/island/nodes/:id/gather", handler(island((req) => gatherNode(uid(req), req.params.id))));
  // Острів Хуртовини: розкопати замет лопатою, розбити брилу, підняти хмиз
  api.post("/winter/nodes/:id/gather", handler(island((req) => gatherNode(uid(req), req.params.id, "winter"))));
  // Гевея: зібрати каучук із чашки.
  api.post("/home/rubber/:id/collect", handler(island((req) => collectRubber(uid(req), req.params.id))));
  api.post("/craft/tool", handler((req) => craftTool(uid(req), body(req).tool)));
  api.post("/craft/recipe", handler((req) => craftRecipe(uid(req), body(req).recipe, body(req).count)));

  // Пси-компаньйони
  api.post("/dogs/:id/feed", handler(island((req) => feedDog(uid(req), req.params.id, body(req).item))));
  api.post("/dogs/:id/pet", handler(island((req) => petDog(uid(req), req.params.id))));
  api.post("/dogs/:id/command", handler(island((req) => commandDog(uid(req), req.params.id, body(req)))));

  // Острови
  api.post("/islands/:id/explore", handler((req) => explore(uid(req), req.params.id)));
  api.post("/islands/:id/gather", handler((req) => startGather(uid(req), req.params.id)));
  api.post("/gather/claim", handler((req) => claimGather(uid(req))));

  // Думосвіт
  api.post("/dumosvit/settings", handler((req) => setDumosvitSettings(uid(req), body(req))));
  api.post("/dumosvit/next", handler((req) => nextDumosvitCard(uid(req), body(req).mode), { withState: false }));
  api.post("/dumosvit/answer", handler((req) => answerQuiz(uid(req), body(req).token, body(req).index)));
  api.post("/dumosvit/check", handler((req) => checkDumosvitText(uid(req), body(req).token, body(req).text)));
  api.post("/dumosvit/pairs", handler((req) => finishDumosvitPairs(uid(req), body(req).token, body(req).results)));

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
