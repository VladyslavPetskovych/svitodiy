/**
 * Простий ліміт запитів на гравця (у пам'яті процесу).
 * Ставиться після requireTelegramUser, тож ключ — перевірений id з Telegram.
 * @param {{ windowMs: number, max: number }} opts
 */
export function rateLimit({ windowMs, max }) {
  /** @type {Map<number, { start: number, count: number }>} */
  const hits = new Map();

  // Щоб Map не ріс вічно — прибираємо старі вікна.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, h] of hits) if (now - h.start > windowMs) hits.delete(id);
  }, windowMs * 6);
  sweep.unref?.();

  return (req, res, next) => {
    const id = req.tgUser.id;
    const now = Date.now();
    const h = hits.get(id);
    if (!h || now - h.start > windowMs) {
      hits.set(id, { start: now, count: 1 });
      return next();
    }
    if (++h.count > max) {
      res.status(429).json({ error: "rate_limited", message: "Забагато дій підряд — перепочинь кілька секунд." });
      return;
    }
    next();
  };
}
