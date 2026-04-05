/** Валюта: ✨ «промінчики» — м’яке сяйво за улов. */
export const CURRENCY_EMOJI = "✨";
export const CURRENCY_LABEL = "промінчики";

export function formatBalanceHtml(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${CURRENCY_EMOJI} <b>${n}</b> ${CURRENCY_LABEL}`;
}

export function formatBalanceShort(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${CURRENCY_EMOJI} ${n}`;
}
