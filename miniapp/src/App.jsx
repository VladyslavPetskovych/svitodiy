import Arcs from './components/Arcs.jsx'
import Chasodiy from './components/Chasodiy.jsx'
import Footer from './components/Footer.jsx'
import Header from './components/Header.jsx'
import Hero from './components/Hero.jsx'
import PlayInTelegram from './components/PlayInTelegram.jsx'
import Sections from './components/Sections.jsx'

/** Лендинг для звичайного браузера. У Telegram замість нього відкривається гра (src/game). */
export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <PlayInTelegram />
        <Sections />
        <Chasodiy />
        <Arcs />
      </main>
      <Footer />
    </>
  )
}
