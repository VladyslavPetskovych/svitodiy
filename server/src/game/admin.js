import {
  buildContainersReport,
  buildMonitorReport,
  buildProcessesReport,
  hasAdminAccess,
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

