import { BOT_URL } from '../lib/telegram.js'
import { ButtonLink, Container } from './ui.jsx'

const NAV = [
  ['#profile', 'Профіль'],
  ['#sections', 'Розділи'],
  ['#chasodiy', 'Часодій'],
  ['#arcs', 'Арки'],
]

export default function Header({ inTelegram }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <Container className="flex h-16 items-center gap-6">
        <a href="#top" className="flex items-center gap-2 font-pixel text-sm">
          <span className="text-accent">✦</span> Світодій
        </a>
        <nav className="ml-auto hidden gap-6 text-sm font-medium text-muted md:flex">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} className="transition hover:text-text">
              {label}
            </a>
          ))}
        </nav>
        {/* У Telegram бот і так відкритий — кнопка зайва. */}
        {!inTelegram && (
          <ButtonLink href={BOT_URL} className="ml-auto px-4 py-2 text-sm md:ml-0">
            Відкрити бота
          </ButtonLink>
        )}
      </Container>
    </header>
  )
}
