// За замовчуванням — той самий домен: Netlify проксіює /api/* на сервер гри
// (netlify/edge-functions/api.js). Локально Vite проксіює /api на localhost:3000.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Помилка, текст якої можна показати гравцеві як є. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * @param {string} initData
 * @param {string} method
 * @param {string} path без /api, напр. "/fish/cast"
 * @param {object} [body]
 */
export async function request(initData, method, path, body) {
  let res
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        Authorization: `tma ${initData}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network', 'Немає зв’язку з сервером. Перевір інтернет.')
  }

  let data = null
  if (res.headers.get('content-type')?.includes('application/json')) {
    data = await res.json().catch(() => null)
  }
  if (!res.ok || !data) {
    if (res.status === 401) throw new ApiError(401, 'auth', 'Сесія Telegram застаріла — закрий і знову відкрий гру.')
    throw new ApiError(res.status, data?.error ?? 'server', data?.message ?? 'Сервер гри зараз недоступний.')
  }
  return data
}
