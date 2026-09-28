import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, request } from './api.js'
import { GameContext } from './context.js'
import { buildItemIndex } from './data.js'
import { haptic } from './tg.js'

let toastSeq = 0
const loadError = (e) => (e instanceof ApiError ? e.message : 'Не вдалося завантажити гру.')

/**
 * Стан гри: каталог, стан гравця, навігація, тости й вікно нагороди.
 * Сервер повертає свіжий `state` після кожної дії — клієнт нічого не рахує сам.
 */
export function GameProvider({ wa, children }) {
  const initData = wa.initData
  const [catalog, setCatalog] = useState(null)
  const [state, setState] = useState(null)
  const [fatal, setFatal] = useState(null)
  const [toasts, setToasts] = useState([])
  const [rewardPopup, setRewardPopup] = useState(null)
  const [nav, setNav] = useState({ tab: 'home', stack: [] })

  // Різниця годинників телефона й сервера — таймери заготівлі рахуємо за серверним часом.
  const clockOffset = useRef(0)
  const applyState = useCallback((s) => {
    clockOffset.current = s.serverTime - Date.now()
    setState(s)
  }, [])
  const serverNow = useCallback(() => Date.now() + clockOffset.current, [])

  const fetchGame = useCallback(
    () => Promise.all([request(initData, 'GET', '/catalog'), request(initData, 'GET', '/state')]),
    [initData]
  )
  const onLoaded = useCallback(
    ([cat, st]) => {
      setCatalog(cat)
      applyState(st.state)
    },
    [applyState]
  )

  useEffect(() => {
    let ignore = false
    fetchGame().then(
      (res) => !ignore && onLoaded(res),
      (e) => !ignore && setFatal(loadError(e))
    )
    return () => {
      ignore = true
    }
  }, [fetchGame, onLoaded])

  const reload = useCallback(() => {
    setFatal(null)
    fetchGame().then(onLoaded, (e) => setFatal(loadError(e)))
  }, [fetchGame, onLoaded])

  const toast = useCallback((text, kind = 'info') => {
    const id = ++toastSeq
    setToasts((t) => [...t.slice(-2), { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  /**
   * Виклик API. Повертає відповідь або null (помилку вже показано тостом).
   * @param {{ silent?: boolean }} [opts]
   */
  const act = useCallback(
    async (method, path, body, opts = {}) => {
      try {
        const res = await request(initData, method, path, body)
        if (res.state) applyState(res.state)
        return res
      } catch (e) {
        if (!opts.silent) {
          haptic('error')
          toast(e instanceof ApiError ? e.message : 'Щось пішло не так.', 'error')
        }
        return null
      }
    },
    [initData, toast, applyState]
  )

  // Фонове оновлення, коли гравець повертається в апку (нагадування, бот міг змінити стан).
  const lastSync = useRef(0)
  useEffect(() => {
    lastSync.current = Date.now()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSync.current > 15_000) {
        lastSync.current = Date.now()
        act('GET', '/state', undefined, { silent: true })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [act])

  const navApi = useMemo(
    () => ({
      switchTab: (tab) => {
        haptic('select')
        setNav({ tab, stack: [] })
      },
      go: (screen, params = {}) => {
        haptic('light')
        setNav((n) => ({ ...n, stack: [...n.stack, { screen, params }] }))
      },
      back: () => setNav((n) => ({ ...n, stack: n.stack.slice(0, -1) })),
    }),
    []
  )

  const items = useMemo(() => (catalog ? buildItemIndex(catalog) : null), [catalog])

  const value = {
    wa,
    catalog,
    items,
    state,
    serverNow,
    fatal,
    reload,
    act,
    toast,
    toasts,
    reward: setRewardPopup,
    rewardPopup,
    nav,
    ...navApi,
  }
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
