export const BOT_URL = 'https://t.me/svitodiy_bot'

/** @returns {any | null} window.Telegram.WebApp або null поза Telegram */
export function getWebApp() {
  const wa = window.Telegram?.WebApp
  // SDK вантажиться і в браузері, але initData порожній — значить відкрито не з Telegram.
  return wa && wa.initData ? wa : null
}

export function initWebApp() {
  const wa = getWebApp()

  if (wa) {
    wa.ready()
    wa.expand()
    applyTheme(wa.colorScheme === 'dark')
    wa.onEvent('themeChanged', () => applyTheme(wa.colorScheme === 'dark'))
    return
  }

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  applyTheme(media.matches)
  media.addEventListener('change', (e) => applyTheme(e.matches))
}

function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark)

  // Шапка й фон Telegram у колір сайту, щоб не було смуги іншого кольору.
  const wa = getWebApp()
  if (!wa) return
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  try {
    wa.setHeaderColor(bg)
    wa.setBackgroundColor(bg)
  } catch {
    // Старі клієнти Telegram не вміють hex-кольори — лишаємо їхні стандартні.
  }
}
