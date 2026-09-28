import { Container, SectionTitle } from './ui.jsx'

const FACTS = [
  ['🎣', '8 видів риби', 'від окуня з характером до легендарного золотого карася'],
  ['🪨', 'Ресурси й реліквії', 'мушлі, монети, гачки й талісмани, що змінюють улов'],
  ['⚗️', 'Алхімія', 'перетворюй знахідки на корисні предмети'],
  ['🗺️', 'Острови', 'твій острів і сусідні — джунглі та заметіль'],
]

export default function Chasodiy() {
  return (
    <section id="chasodiy" className="bg-surface-2/60 py-16">
      <Container className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <SectionTitle eyebrow="Часодій" title="Закидай вудку — світ відповість" />
          <ul className="grid gap-4 sm:grid-cols-2">
            {FACTS.map(([emoji, title, text]) => (
              <li key={title} className="flex gap-3">
                <span className="text-2xl">{emoji}</span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto w-full max-w-md pb-10 sm:pb-0">
          <img
            src="/img/map.webp"
            alt="Стара мапа з островами"
            width="1000"
            height="799"
            loading="lazy"
            className="w-full rotate-[-2deg] rounded-2xl shadow-xl"
          />
          <img
            src="/img/fishing.webp"
            alt="Рибалка на піксельному острові"
            width="800"
            height="880"
            loading="lazy"
            className="absolute -right-2 -bottom-4 w-2/5 rotate-[4deg] rounded-xl border-4 border-surface shadow-xl sm:-right-6 sm:-bottom-10"
          />
        </div>
      </Container>
    </section>
  )
}
