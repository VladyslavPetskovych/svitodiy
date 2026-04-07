import { CATCHES, getFishMeta } from "./data/fishTypes.js";
import { RESOURCE_TYPES, isResourceId } from "./data/resources.js";
import { getRelicMeta } from "./data/relics.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {Record<string, number>} inv
 */
export function formatInventoryCaption(inv, balanceHtml, opts = {}) {
  const equippedHook = opts.equippedHook ?? null;
  const equippedTalisman = opts.equippedTalisman ?? null;
  let text = `🎒 <b>Інвентар</b>\n💰 ${balanceHtml}\n`;

  text += `\n<b>🐟 Риба</b>\n`;
  const fishLines = [];
  for (const fish of CATCHES) {
    const n = inv[fish.id] ?? 0;
    if (n > 0) fishLines.push(`• ${fish.emoji} ${escapeHtml(fish.name)} — ×${n}`);
  }
  text += fishLines.length > 0 ? `${fishLines.join("\n")}\n` : `• <i>порожньо</i>\n`;

  text += `\n<b>📦 Ресурси</b>\n`;
  const resLines = [];
  for (const r of RESOURCE_TYPES) {
    const n = inv[r.id] ?? 0;
    if (n > 0) resLines.push(`• ${r.emoji} ${escapeHtml(r.name)} — ×${n}`);
  }
  text += resLines.length > 0 ? `${resLines.join("\n")}\n` : `• <i>порожньо</i>\n`;

  text += `\n<b>🏺 Реліквії</b>\n`;
  const relicLines = [];
  for (const [k, n] of Object.entries(inv)) {
    if (n > 0 && k.startsWith("relic_")) {
      const meta = getRelicMeta(k);
      relicLines.push(
        `• ${meta?.emoji ?? "🏺"} ${escapeHtml(meta?.name ?? k)} — ×${n}`
      );
    }
  }
  text += relicLines.length > 0 ? `${relicLines.join("\n")}\n` : `• <i>порожньо</i>\n`;

  text += `\n<b>🛡 Вдягнуто</b>\n`;
  const eqLines = [];
  if (equippedHook) {
    const m = getRelicMeta(equippedHook);
    eqLines.push(`• 🪝 ${m?.emoji ?? "🏺"} ${escapeHtml(m?.name ?? equippedHook)}`);
  }
  if (equippedTalisman) {
    const m = getRelicMeta(equippedTalisman);
    eqLines.push(`• 🧿 ${m?.emoji ?? "🏺"} ${escapeHtml(m?.name ?? equippedTalisman)}`);
  }
  text += eqLines.length > 0 ? `${eqLines.join("\n")}\n` : `• <i>нічого</i>\n`;

  text += `\n<b>🧰 Можна вдягнути</b>\n`;
  const wearable = [
    "relic_hook_silver",
    "relic_hook_gold",
    "relic_pearl_talisman",
    "relic_angler_charm",
  ];
  const wearLines = [];
  for (const id of wearable) {
    const n = inv[id] ?? 0;
    if (n < 1) continue;
    const m = getRelicMeta(id);
    wearLines.push(`• ${m?.emoji ?? "🏺"} ${escapeHtml(m?.name ?? id)} — ×${n}`);
  }
  text += wearLines.length > 0 ? `${wearLines.join("\n")}\n` : `• <i>порожньо</i>\n`;

  const unknown = [];
  for (const [k, n] of Object.entries(inv)) {
    if (n < 1) continue;
    if (getFishMeta(k) || isResourceId(k) || k.startsWith("relic_")) continue;
    unknown.push(`• <code>${escapeHtml(k)}</code> — ×${n}`);
  }
  if (unknown.length > 0) {
    text += `\n<b>❔ Інше</b>\n${unknown.join("\n")}\n`;
  }

  return text;
}
