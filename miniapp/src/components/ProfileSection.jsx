import { API_CONFIGURED } from '../lib/api.js'
import { BOT_URL } from '../lib/telegram.js'
import Inventory from './Inventory.jsx'
import ProfileCard from './ProfileCard.jsx'
import StatsGrid from './StatsGrid.jsx'
import { Button, ButtonLink, Card, Container, SectionTitle } from './ui.jsx'

/**
 * @param {{ inTelegram: boolean, user: object | null, data: object | null,
 *   error: string | null, onRetry: () => void }} props
 */
export default function ProfileSection({ inTelegram, user, data, error, onRetry }) {
  return (
    <section id="profile" className="py-16">
      <Container>
        <SectionTitle eyebrow="Профіль" title={inTelegram ? 'Твій острів' : 'Твій прогрес — у Telegram'} />

        {!inTelegram && (
          <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <span className="text-4xl">🏝️</span>
            <p className="flex-1 text-muted">
              Баланс, улов та інвентар видно, коли сайт відкрито через бота: натисни «Відкрити» в меню чату з @svitodiy_bot.
            </p>
            <ButtonLink href={BOT_URL}>Відкрити бота</ButtonLink>
          </Card>
        )}

        {inTelegram && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="flex flex-col gap-4">
              <ProfileCard user={user} balance={data?.balance} />
              {data && <StatsGrid stats={data.stats} />}
            </div>

            {error && (
              <Card className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                <span className="text-4xl">🌫️</span>
                <p className="text-muted">{error}</p>
                {API_CONFIGURED && (
                  <Button variant="ghost" onClick={onRetry}>
                    Спробувати ще
                  </Button>
                )}
              </Card>
            )}

            {!data && !error && <Skeleton />}

            {data && <Inventory inventory={data.inventory} equipped={data.equipped} />}
          </div>
        )}
      </Container>
    </section>
  )
}

function Skeleton() {
  return (
    <Card className="flex animate-pulse flex-col gap-3 p-6" aria-label="Завантаження">
      {[70, 90, 55, 80].map((w) => (
        <div key={w} className="h-5 rounded bg-surface-2" style={{ width: `${w}%` }} />
      ))}
    </Card>
  )
}
