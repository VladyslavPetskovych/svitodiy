/**
 * Конвеєр — налаштування без залежностей (їх беруть і decor.js, і belts.js — без кругових імпортів).
 * Сама логіка — у belts.js.
 *
 * cost — ціна однієї клітинки стрічки (8×8 px); gapMs — як часто з жолоба джерела сходить річ;
 * speed — клітинок за секунду; crate — приймальна скриня в кінці стрічки.
 */
export const BELT = {
  cost: { plank: 1 },
  max: 300,
  gapMs: 2000,
  speed: 2.5,
};

export const BELT_CRATE = { kind: "belt_crate", foot: [3, 2], cap: 60 };
