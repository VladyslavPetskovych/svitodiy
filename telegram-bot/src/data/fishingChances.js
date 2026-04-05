/**
 * Баланс рибалки: ймовірності одного закиду.
 * Сума всіх значень має дорівнювати 1.0.
 *
 * Порядок перевірки в коді: реліквія → ресурси (з води) → риба → порожньо.
 */
export const FISHING_CHANCES = {
  /** Рідкісна реліквія */
  relic: 0.04,
  /** Ресурси з води (гілка, камінь, мушля) */
  resource: 0.12,
  /** Риба (з урахуванням ваги виду в fishTypes) */
  fish: 0.38,
  /** Порожній закид */
  miss: 0.46,
};

export function sumFishingChances() {
  return Object.values(FISHING_CHANCES).reduce((a, b) => a + b, 0);
}
