import { BOT_URL } from '../lib/telegram.js'
import { Container } from './ui.jsx'

const YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="border-t border-line py-8 text-sm text-muted">
      <Container className="flex flex-col items-center justify-between gap-2 sm:flex-row">
        <p className="font-pixel text-xs text-text">
          <span className="text-accent">✦</span> Світодій
        </p>
        <p>
          © {YEAR} ·{' '}
          <a href={BOT_URL} className="text-sea hover:underline">
            @svitodiy_bot
          </a>
        </p>
      </Container>
    </footer>
  )
}
