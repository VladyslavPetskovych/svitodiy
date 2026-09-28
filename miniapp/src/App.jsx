import { useCallback, useEffect, useState } from 'react'
import Inventory from './components/Inventory.jsx'
import ProfileCard from './components/ProfileCard.jsx'
import StatsGrid from './components/StatsGrid.jsx'
import { fetchMe } from './lib/api.js'
import { getWebApp } from './lib/telegram.js'

export default function App() {
  const wa = getWebApp()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    if (!wa) return
    fetchMe(wa.initData).then(setData, (e) => setError(e.message))
  }, [wa])

  const retry = () => {
    setError(null)
    load()
  }

  useEffect(() => {
    load()
  }, [load])

  if (!wa) {
    return (
      <Screen>
        <p className="text-center text-tg-hint">Відкрий цю сторінку через бота в Telegram 🙂</p>
      </Screen>
    )
  }

  // Поки API відповідає, показуємо ім'я/фото з initDataUnsafe — вони є одразу.
  const tgUser = wa.initDataUnsafe?.user
  const user = data?.user ?? {
    id: tgUser?.id,
    firstName: tgUser?.first_name ?? '',
    lastName: tgUser?.last_name ?? '',
    username: tgUser?.username ?? '',
    photoUrl: tgUser?.photo_url ?? '',
    isPremium: !!tgUser?.is_premium,
  }

  return (
    <Screen>
      <ProfileCard user={user} balance={data?.balance} />

      {error && (
        <div className="rounded-2xl bg-tg-section p-4 text-center">
          <p className="text-tg-destructive">{error}</p>
          <button
            onClick={retry}
            className="mt-3 rounded-xl bg-tg-button px-4 py-2 font-medium text-tg-button-text active:opacity-80"
          >
            Спробувати ще
          </button>
        </div>
      )}

      {!data && !error && <p className="text-center text-tg-hint">Завантаження…</p>}

      {data && (
        <>
          <StatsGrid stats={data.stats} />
          <Inventory inventory={data.inventory} equipped={data.equipped} />
        </>
      )}
    </Screen>
  )
}

function Screen({ children }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-4">{children}</main>
}
