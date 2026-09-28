import crypto from "crypto";

/** initData старше доби вважаємо простроченим — інакше вкрадений рядок живе вічно. */
const MAX_AGE_SEC = 24 * 3600;

/**
 * Перевіряє підпис initData з Telegram Mini App.
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * @param {string} initData — сирий рядок window.Telegram.WebApp.initData
 * @param {string} botToken
 * @returns {{ id: number, first_name?: string, last_name?: string, username?: string,
 *   language_code?: string, is_premium?: boolean, photo_url?: string } | null}
 */
export function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "null");
    return user && Number.isInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}

/**
 * Express middleware: `Authorization: tma <initData>` → req.tgUser.
 * @param {string} botToken
 */
export function requireTelegramUser(botToken) {
  return (req, res, next) => {
    const [scheme, initData] = (req.get("authorization") ?? "").split(" ");
    const user = scheme === "tma" ? verifyInitData(initData, botToken) : null;
    if (!user) {
      res.status(401).json({ error: "invalid_init_data" });
      return;
    }
    req.tgUser = user;
    next();
  };
}
