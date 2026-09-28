import { createContext, useContext } from 'react'

export const GameContext = createContext(null)

/** Стан гри й дії — див. GameProvider у store.jsx. */
export function useGame() {
  return useContext(GameContext)
}
