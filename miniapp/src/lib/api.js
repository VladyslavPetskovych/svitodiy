const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Без VITE_API_URL профіль не завантажити — повтор запиту нічого не змінить. */
export const API_CONFIGURED = Boolean(API_URL)

/**
 * Профіль, баланс, статистика й інвентар поточного користувача.
 * Сервер сам визначає id з підписаного initData.
 * Кидає Error з повідомленням, яке можна показати людині.
 * @param {string} initData
 */
export async function fetchMe(initData) {
  // Без адреси API запит пішов би на сам Netlify і повернув би index.html замість JSON.
  if (!API_URL) throw new Error('Профіль ще не підключено — зазирни трохи згодом.')

  let res
  try {
    res = await fetch(`${API_URL}/api/me`, {
      headers: { Authorization: `tma ${initData}` },
    })
  } catch {
    throw new Error('Не вдалося зв’язатися з сервером. Перевір інтернет і спробуй ще.')
  }

  if (res.status === 401) throw new Error('Сесія Telegram застаріла — закрий і знову відкрий апку.')
  if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Сервер зараз недоступний. Спробуй трохи згодом.')
  }
  return res.json()
}
