import { BOT_URL } from '../lib/telegram.js'
import { ButtonLink, Card, Container, SectionTitle } from './ui.jsx'

export default function PlayInTelegram() {
  return (
    <section id="profile" className="py-16">
      <Container>
        <SectionTitle eyebrow="Гра" title="Повна гра — у Telegram" />
        <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
          <span className="text-4xl">🏝️</span>
          <p className="flex-1 text-muted">
            Рибалка з анімаціями, рюкзак, алхімія, острови, щоденні нагороди й твій прогрес відкриваються з кнопки «Відкрити» в
            чаті з @svitodiy_bot.
          </p>
          <ButtonLink href={BOT_URL}>Грати</ButtonLink>
        </Card>
      </Container>
    </section>
  )
}
