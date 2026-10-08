import { createContext, useContext, useEffect, useState } from 'react'

export const GameContext = createContext(null)

/** Стан гри й дії — див. GameProvider у store.jsx. */
export function useGame() {
  return useContext(GameContext)
}

/** Серверний час, що оновлюється раз на кілька секунд — для комори. */
export function useNow(ms = 2000) {
  const { serverNow } = useGame()
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms)
    return () => clearInterval(id)
  }, [serverNow, ms])
  return now
}
