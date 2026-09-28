/** Очікувана відмова (немає ресурсів, кулдаун…): message показуємо гравцеві як є. */
export class GameError extends Error {
  /**
   * @param {number} status HTTP-статус
   * @param {string} code машинний код для клієнта
   * @param {string} message текст українською для тосту
   */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new GameError(400, "bad_request", message);
export const conflict = (code, message) => new GameError(409, code, message);
export const forbidden = () => new GameError(403, "forbidden", "Цей розділ тобі недоступний.");
