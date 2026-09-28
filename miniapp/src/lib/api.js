const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/**
 * Профіль, баланс, статистика й інвентар поточного користувача.
 * Сервер сам визначає id з підписаного initData.
 * @param {string} initData
 */
export async function fetchMe(initData) {
  const res = await fetch(`${API_URL}/api/me`, {
    headers: { Authorization: `tma ${initData}` },
  })
  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Сесія Telegram недійсна — перевідкрий апку' : `Помилка сервера (${res.status})`)
  }
  return res.json()
}
