import { Card, Container, SectionTitle } from './ui.jsx'

const SECTIONS = [
  {
    emoji: '⚔️',
    title: 'Часодій',
    text: 'Невелика РПГ: рибалка, інвентар, ресурси, алхімія і мапа островів. За улов — ✨ промінчики.',
    command: '/fish',
  },
  {
    emoji: '📚',
    title: 'Думосвіт',
    text: 'Іспанські слова з підказками й міні-квізами. Сам обираєш, як часто бот їх надсилає.',
    command: '/menu',
  },
  {
    emoji: '📜',
    title: 'Літописець',
    text: 'Список завдань із нагадуваннями: пишеш дату — бот нагадує саме тоді.',
    command: '/litopys',
  },
]

export default function Sections() {
  return (
    <section id="sections" className="py-16">
      <Container>
        <SectionTitle eyebrow="Розділи" title="Три світи в одному боті">
          Усе живе в чаті з ботом — без реєстрацій і окремих застосунків.
        </SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          {SECTIONS.map((s) => (
            <Card key={s.title} className="flex flex-col p-6 transition hover:-translate-y-1 hover:shadow-lg">
              <span className="flex size-12 items-center justify-center rounded-xl bg-surface-2 text-2xl">
                {s.emoji}
              </span>
              <h3 className="mt-4 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-2 flex-1 text-muted">{s.text}</p>
              <code className="mt-4 self-start rounded-md bg-surface-2 px-2 py-1 text-sm text-sea">{s.command}</code>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  )
}
