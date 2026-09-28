import { Container, SectionTitle } from './ui.jsx'

/** Джерело — telegram-bot/src/chasodiy/arcContent.js (ARC_CATALOG). */
const ARCS = [
  { id: 'redemption', title: 'Redemption', text: 'Перетвори жаль на дисципліновану дію.' },
  { id: 'grinding', title: 'Grinding', text: 'Сталість, глибока робота й любов до процесу.' },
  { id: 'resilience', title: 'Resilience', text: 'Витривалість, спокійне відновлення, рівновага під тиском.' },
]

export default function Arcs() {
  return (
    <section id="arcs" className="py-16">
      <Container>
        <SectionTitle eyebrow="Арки розвитку" title="30 днів — одна тема">
          Бот кілька разів на день надсилає цитату й маленьку дію, що тримають фокус на обраній арці.
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          {ARCS.map((a) => (
            <figure key={a.id} className="group relative overflow-hidden rounded-2xl">
              <img
                src={`/img/arc-${a.id}.webp`}
                alt={`Обкладинка арки ${a.title}`}
                width="540"
                height="720"
                loading="lazy"
                className="aspect-[3/4] w-full object-cover transition duration-500 group-hover:scale-105"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-5 pt-16 text-white">
                <p className="text-sm text-white/80">{a.text}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  )
}
