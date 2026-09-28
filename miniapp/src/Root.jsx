import { lazy, Suspense } from 'react'
import App from './App.jsx'

// Гра вантажиться окремим чанком — лендинг у браузері лишається легким.
const GameApp = lazy(() => import('./game/GameApp.jsx'))

/** У Telegram — гра, у звичайному браузері — лендинг. */
export default function Root({ wa }) {
  if (!wa) return <App />
  return (
    <Suspense fallback={<div className="game-root h-dvh bg-sea-800" />}>
      <GameApp wa={wa} />
    </Suspense>
  )
}
