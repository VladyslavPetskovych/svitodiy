import { BOT_URL } from '../lib/telegram.js'
import { ButtonLink, Container } from './ui.jsx'

export default function Hero({ inTelegram, firstName }) {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* М'яке «небо» за островом */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_75%_40%,color-mix(in_oklab,var(--sea)_22%,transparent),transparent)]" />
      <Container className="relative grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
        <div>
          <p className="font-pixel text-[10px] leading-relaxed text-accent uppercase sm:text-xs">
            {firstName ? `Привіт, ${firstName}!` : 'Бот у Telegram'}
          </p>
          <h1 className="mt-3 font-pixel text-3xl leading-tight sm:text-5xl">Світодій</h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            Маленький світ у Telegram: рибалка на власному острові, іспанські слова щодня і завдання, про які бот
            нагадає вчасно.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {inTelegram ? (
              <ButtonLink href="#profile">Мій профіль</ButtonLink>
            ) : (
              <ButtonLink href={BOT_URL}>Почати в Telegram</ButtonLink>
            )}
            <ButtonLink href="#sections" variant="ghost">
              Що вміє бот
            </ButtonLink>
          </div>
        </div>
        <img
          src="/img/island.webp"
          alt="Піксельний острів з хатинкою посеред моря"
          width="1100"
          height="1100"
          className="mx-auto w-full max-w-md animate-float rounded-3xl shadow-2xl shadow-sea/20"
        />
      </Container>
    </section>
  )
}
