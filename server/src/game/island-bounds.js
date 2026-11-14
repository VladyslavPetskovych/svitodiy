/**
 * Межі рідного острова, куди можна щось ставити й де можна стояти, у пікселях арту.
 *
 * Сама мапа — 512×448 (MAP у miniapp/src/game/walk/layout.js), але помости кладуть і в море довкола:
 * до PLATFORM_REACH клітинок від краю мапи (там само — PLATFORM_REACH у layout.js, міняти разом!).
 * На помостах ставлять усе, як на суші, тож ці межі діють для декору, будівель, грядок,
 * місця пса й позицій мандрівників. Чи там справді суша чи помост, перевіряє рушій Mini App
 * (а помост — ще й сервер, decor.js → checkPlatform).
 */
export const MAP = { w: 512, h: 448 };
export const CELL = 8;
export const PLATFORM_REACH = 100;

const PAD = PLATFORM_REACH * CELL;
export const ISLAND = { x0: -PAD, y0: -PAD, x1: MAP.w + PAD, y1: MAP.h + PAD };

/** Чи точка (x, y) у межах острова з морем довкола; m — відступ від краю. */
export const onIsland = (x, y, m = 0) => x >= ISLAND.x0 + m && y >= ISLAND.y0 + m && x <= ISLAND.x1 - m && y <= ISLAND.y1 - m;
