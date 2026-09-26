/** Спільне форматування для звітів розділу «Адмін». */

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fmtBytes(bytes) {
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtDuration(sec) {
  if (!Number.isFinite(sec)) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} д ${h} год`;
  if (h > 0) return `${h} год ${m} хв`;
  return `${m} хв`;
}

export function fmtTime(date) {
  return new Date(date).toLocaleString("uk-UA", {
    timeZone: process.env.TZ || "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 🟢 < warn ≤ 🟡 < bad ≤ 🔴 */
export function light(percent, warn = 70, bad = 90) {
  if (percent == null) return "⚪️";
  if (percent >= bad) return "🔴";
  if (percent >= warn) return "🟡";
  return "🟢";
}

export function bar(percent) {
  const filled = Math.round(Math.min(100, Math.max(0, percent)) / 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Telegram обрізає повідомлення довші за 4096 символів. */
export function fitTelegram(text, limit = 4000) {
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf("\n", limit - 20);
  return text.slice(0, cut > 0 ? cut : limit - 20) + "\n…(обрізано)";
}
