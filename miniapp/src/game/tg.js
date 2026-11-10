import { useEffect, useRef } from 'react'

/** Колір фону гри — такий самий ставимо шапці й низу Telegram. */
export const GAME_BG = '#0f2a3d'

export function getWebApp() {
  const wa = window.Telegram?.WebApp
  return wa && wa.initData ? wa : null
}

/** Налаштування Telegram під гру: на весь екран, без випадкового закриття свайпом. */
export function setupGameWebApp(wa) {
  wa.ready()
  wa.expand()
  const call = (fn, ...args) => {
    try {
      wa[fn]?.(...args)
    } catch {
      // старі клієнти Telegram не знають нових методів — не страшно
    }
  }
  call('setHeaderColor', GAME_BG)
  call('setBackgroundColor', GAME_BG)
  call('setBottomBarColor', GAME_BG)
  call('disableVerticalSwipes')
}

/** Вібровідгук. kind: light | medium | heavy | rigid | soft | success | error | warning | select */
export function haptic(kind = 'light') {
  const h = window.Telegram?.WebApp?.HapticFeedback
  if (!h) return
  try {
    if (kind === 'select') h.selectionChanged()
    else if (['success', 'error', 'warning'].includes(kind)) h.notificationOccurred(kind)
    else h.impactOccurred(kind)
  } catch {
    /* ignore */
  }
}

/*
 * Кнопка «Назад» Telegram. Обробники складаються в стек: відкрита шторка
 * реєструє свій і закривається першою, далі — екрани навігації.
 */
const backStack = []
let backBound = false

function syncBackButton() {
  const bb = window.Telegram?.WebApp?.BackButton
  if (!bb) return
  if (!backBound) {
    bb.onClick(() => backStack.at(-1)?.current?.())
    backBound = true
  }
  if (backStack.length) bb.show()
  else bb.hide()
}

/** Поки active — «Назад» у Telegram викликає fn. */
export function useBackButton(active, fn) {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  })
  useEffect(() => {
    if (!active) return
    backStack.push(ref)
    syncBackButton()
    return () => {
      backStack.splice(backStack.indexOf(ref), 1)
      syncBackButton()
    }
  }, [active])
}

/**
 * Справжній повний екран Telegram (Bot API 8.0), поки active: без шапки Telegram, лише кнопки
 * «закрити/меню» поверх гри. Лише на телефонах — на ПК це розгорнуло б усе вікно.
 * Виходимо з повного екрана лише якщо самі в нього зайшли.
 */
export function useTelegramFullscreen(active) {
  useEffect(() => {
    const wa = window.Telegram?.WebApp
    if (!active || !wa?.requestFullscreen || !['ios', 'android', 'android_x'].includes(wa.platform)) return
    if (wa.isVersionAtLeast && !wa.isVersionAtLeast('8.0')) return
    if (wa.isFullscreen) return
    let entered = false
    try {
      wa.requestFullscreen()
      entered = true
    } catch {
      /* старий клієнт — лишаємось у звичайному режимі */
    }
    return () => {
      try {
        if (entered && wa.isFullscreen) wa.exitFullscreen()
      } catch {
        /* ignore */
      }
    }
  }, [active])
}
