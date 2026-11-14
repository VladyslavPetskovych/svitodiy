import {
  addBalance,
  buildContainersReport,
  buildMonitorReport,
  addResourceToInventory,
  buildProcessesReport,
  getRedis,
  hasAdminAccess,
  RESOURCE_TYPES,
  setUserPhone,
  touchUser,
} from "../bot.js";
import { verifySignedParams } from "../telegramAuth.js";
import { badRequest, forbidden } from "./errors.js";

/* ───────── Адмін · сервер ─────────
 * Ті самі звіти, що в боті (telegram-bot/src/admin), — HTML з <b>/<i>/<code>,
 * увесь текст усередині вже екранований. Для getMe вистачає токена бота. */

function telegramApi(botToken) {
  return {
    async getMe() {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.description ?? `HTTP ${res.status}`);
      return data.result;
    },
  };
}

const VIEWS = {
  server: (token) => buildMonitorReport(telegramApi(token), { processTitle: "🧩 <b>API-сервер Mini App</b>" }),
  docker: () => buildContainersReport(),
  procs: () => buildProcessesReport(),
};

export async function adminReport(userId, view, botToken) {
  if (!(await hasAdminAccess(userId))) throw forbidden();
  const build = Object.hasOwn(VIEWS, view) ? VIEWS[view] : null;
  if (!build) throw badRequest("Невідома вкладка.");
  return { view, html: await build(botToken), at: Date.now() };
}

/* ───────── Номер телефону ─────────
 * Персональні розділи відкриваються за номером (specialAccess.js). У боті номер
 * приходить контактом у чат; в апці — через WebApp.requestContact, відповідь
 * якого Telegram підписує так само, як initData. */

export async function saveContact(userId, signed, botToken) {
  const params = verifySignedParams(signed, botToken);
  let contact = null;
  try {
    contact = JSON.parse(params?.get("contact") ?? "null");
  } catch {
    /* нижче — badRequest */
  }
  if (!contact?.phone_number || contact.user_id !== userId) {
    throw badRequest("Не вдалося підтвердити номер. Спробуй ще раз.");
  }
  await touchUser(userId);
  await setUserPhone(userId, contact.phone_number);
  return {};
}


/* ───────── Стартовий запас адміна ─────────
 * Разові подарунки на адмінський номер (ADMIN_PHONES у specialAccess.js). Кожен має свій
 * прапорець у Redis, тож нараховується рівно раз; щоб видати ще раз — новий id.
 * Видаються при першому відкритті Mini App після деплою. */

const ADMIN_GRANTS = [
  {
    id: "resources-1000-v1",
    give: (userId) => Promise.all(RESOURCE_TYPES.map((res) => addResourceToInventory(userId, res.id, 1000))),
  },
  { id: "balance-1000-v1", give: (userId) => addBalance(userId, 1000) }, // +1000 ✨ промінчиків
  // Мідь для тестування електропечі: 100 злиточків (новий id — видасться ще раз).
  { id: "copper-100-v2", give: (userId) => addResourceToInventory(userId, "copper_ingot", 100) },
];

export async function grantAdminResources(userId) {
  if (!(await hasAdminAccess(userId))) return;
  const r = getRedis();
  for (const g of ADMIN_GRANTS) {
    const first = await r.set(`svitodiy:admingrant:${userId}:${g.id}`, "1", { NX: true });
    if (first === "OK") await g.give(userId);
  }
}
