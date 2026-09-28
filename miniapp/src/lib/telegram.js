/** @returns {any | null} window.Telegram.WebApp або null поза Telegram */
export function getWebApp() {
  const wa = window.Telegram?.WebApp
  // SDK вантажиться і в браузері, але initData порожній — значить відкрито не з Telegram.
  return wa && wa.initData ? wa : null
}

export function initWebApp() {
  const wa = getWebApp()
  if (!wa) return
  wa.ready()
  wa.expand()
}
