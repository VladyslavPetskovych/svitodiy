import { useCallback, useEffect, useState } from 'react'
import Arcs from './components/Arcs.jsx'
import Chasodiy from './components/Chasodiy.jsx'
import Footer from './components/Footer.jsx'
import Header from './components/Header.jsx'
import Hero from './components/Hero.jsx'
import ProfileSection from './components/ProfileSection.jsx'
import Sections from './components/Sections.jsx'
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

  // Поки API відповідає, показуємо ім'я/фото з initDataUnsafe — вони є одразу.
  const tgUser = wa?.initDataUnsafe?.user
  const user =
    data?.user ??
    (tgUser && {
      id: tgUser.id,
      firstName: tgUser.first_name ?? '',
      lastName: tgUser.last_name ?? '',
      username: tgUser.username ?? '',
      photoUrl: tgUser.photo_url ?? '',
      isPremium: !!tgUser.is_premium,
    })

  return (
    <>
      <Header inTelegram={!!wa} />
      <main>
        <Hero inTelegram={!!wa} firstName={user?.firstName} />
        <ProfileSection inTelegram={!!wa} user={user} data={data} error={error} onRetry={retry} />
        <Sections />
        <Chasodiy />
        <Arcs />
      </main>
      <Footer />
    </>
  )
}
