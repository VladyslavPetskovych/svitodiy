import { motion } from 'motion/react'
import { useState } from 'react'
import { craftableCount, itemOf, nextGoal } from '../data.js'
import { useGame } from '../context.js'
import { Bar, ItemIcon, Paper, PxButton, Sheet } from '../ui.jsx'
import { GatherWidget } from './Island.jsx'

export default function Home() {
  const { state, catalog, items, go, switchTab } = useGame()
  const goal = nextGoal(catalog, items, state.inventory)
  const craftable = craftableCount(catalog, state.inventory)
  const activeArc = catalog.arcs.find((a) => state.arcs[a.id]?.enabled)

  const tiles = [
    { icon: '🎣', title: 'Рибалка', text: 'Закинь вудку', onClick: () => switchTab('fishing') },
    { icon: '🗺️', title: 'Мапа', text: 'Острови й пригоди', onClick: () => switchTab('map') },
    { icon: '🎒', title: 'Рюкзак', text: `${Object.keys(state.inventory).length} видів речей`, onClick: () => switchTab('backpack') },
    {
      icon: '🔮',
      title: 'Алхімія',
      text: craftable ? `Можна створити: ${craftable}` : 'Рецепти й гачки',
      badge: craftable,
      onClick: () => go('backpack', { tab: 'alchemy' }),
    },
    { icon: '📚', title: 'Думосвіт', text: 'Іспанська щодня', onClick: () => go('dumosvit') },
    { icon: '📜', title: 'Літописець', text: 'Завдання й нагадування', onClick: () => go('litopys') },
  ]

  return (
    <div className="flex flex-col gap-3">
      <IslandHero onFish={() => switchTab('fishing')} />
      <DailyReward />
      {state.job && <GatherWidget />}

      {goal && (
        <Paper className="p-2">
          <p className="font-pixel text-[10px] text-ink-soft">НАСТУПНА ЦІЛЬ</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="px-slot flex size-14 shrink-0 items-center justify-center">
              <ItemIcon item={goal.output} size={36} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">{goal.output.name}</p>
              <p className="text-xs text-ink-soft">
                {goal.missing.length
                  ? `Бракує: ${goal.missing.map((m) => `${m.item.emoji}×${m.need}`).join(' ')}`
                  : 'Усе є — можна створювати!'}
              </p>
            </div>
            <PxButton
              size="sm"
              variant={goal.missing.length ? 'paper' : 'green'}
              onClick={() => go('backpack', { tab: 'alchemy' })}
            >
              {goal.missing.length ? 'Рецепт' : 'Створити'}
            </PxButton>
          </div>
        </Paper>
      )}

      {activeArc && (
        <button type="button" onClick={() => go('arc', { id: activeArc.id })} className="text-left">
          <Paper className="flex items-center gap-3 p-2">
            <img src={`/game/art/arc-${activeArc.id}.webp`} alt="" className="h-16 w-12 rounded-sm object-cover" />
            <div className="flex-1">
              <p className="font-pixel text-[10px] text-ink-soft">АРКА РОЗВИТКУ</p>
              <p className="font-extrabold">
                {activeArc.emoji} {activeArc.title}
              </p>
              <Bar value={state.arcs[activeArc.id].day / catalog.arcDurationDays} className="mt-1" />
              <p className="mt-1 text-xs text-ink-soft">
                День {Math.min(state.arcs[activeArc.id].day, catalog.arcDurationDays)} з {catalog.arcDurationDays}
              </p>
            </div>
          </Paper>
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t, i) => (
          <motion.button
            key={t.title}
            type="button"
            onClick={t.onClick}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i }}
            className="text-left"
          >
            <Paper className="relative h-full p-2">
              <span className="text-3xl">{t.icon}</span>
              <p className="mt-1 font-extrabold">{t.title}</p>
              <p className="text-xs text-ink-soft">{t.text}</p>
              {t.badge > 0 && (
                <span className="absolute top-1 right-1 rounded-sm bg-good px-1.5 font-pixel text-[9px] leading-5 text-white">
                  {t.badge}
                </span>
              )}
            </Paper>
          </motion.button>
        ))}
      </div>

      <StatsCard />
    </div>
  )
}

function IslandHero({ onFish }) {
  const { state } = useGame()
  const name = state.user.firstName || 'Мандрівник'
  return (
    <div className="relative overflow-hidden rounded-sm border-4 border-wood-dark shadow-[0_6px_0_#0006]">
      <img src="/game/art/home.webp" alt="" className="aspect-16/11 w-full object-cover object-[50%_45%]" />
      <div className="water-shimmer pointer-events-none absolute inset-x-0 bottom-0 h-1/3" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-linear-to-t from-black/70 to-transparent p-3 pt-10">
        <div>
          <p className="font-pixel text-[10px] text-gold">ТВІЙ ОСТРІВ</p>
          <p className="text-lg font-extrabold text-cream drop-shadow">Острів {name}</p>
        </div>
        <PxButton size="md" onClick={onFish}>
          🎣 Рибалити
        </PxButton>
      </div>
    </div>
  )
}

function DailyReward() {
  const { state, catalog, act, reward } = useGame()
  const [open, setOpen] = useState(false)
  const { claimedToday, streak, todayIndex } = state.daily
  const rewards = catalog.config.dailyRewards

  const claim = async () => {
    const res = await act('POST', '/daily/claim')
    if (!res) return
    setOpen(false)
    reward({
      title: 'Щоденна нагорода',
      icon: '🎁',
      subtitle: `+${res.reward} ✨`,
      lines: [`Серія: ${res.streak} ${res.streak === 1 ? 'день' : 'дні(в)'} поспіль. Повертайся завтра!`],
      tone: res.streak % rewards.length === 0 ? 'epic' : 'good',
    })
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.97 }}
        className="text-left"
        animate={claimedToday ? {} : { rotate: [0, -1.2, 1.2, 0] }}
        transition={claimedToday ? {} : { duration: 0.6, repeat: Infinity, repeatDelay: 2.4 }}
      >
        <Paper className="flex items-center gap-3 p-2">
          <span className="text-4xl">{claimedToday ? '📦' : '🎁'}</span>
          <div className="flex-1">
            <p className="font-extrabold">{claimedToday ? 'Нагороду забрано' : 'Щоденна нагорода чекає!'}</p>
            <p className="text-xs text-ink-soft">
              {claimedToday
                ? `Серія ${streak} дн. Завтра: +${rewards[(todayIndex + 1) % rewards.length]} ✨`
                : `Сьогодні: +${rewards[todayIndex]} ✨ · день ${todayIndex + 1} з ${rewards.length}`}
            </p>
          </div>
          {!claimedToday && <span className="size-3 animate-pulse rounded-full bg-bad" />}
        </Paper>
      </motion.button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Щоденна нагорода">
        <p className="mb-3 text-center text-sm text-ink-soft">Заходь щодня — нагорода росте. Пропуск дня обнуляє серію.</p>
        <div className="grid grid-cols-7 gap-1">
          {rewards.map((r, i) => {
            const done = claimedToday ? i <= todayIndex : i < todayIndex
            const current = i === todayIndex && !claimedToday
            return (
              <div
                key={i}
                className={`px-slot flex flex-col items-center py-1 ${current ? 'animate-pulse' : ''}`}
                style={current ? { boxShadow: '0 0 0 2px #ffcf3f, 0 0 10px #ffcf3f' } : undefined}
              >
                <span className="font-pixel text-[8px] text-ink-soft">Д{i + 1}</span>
                <span className="text-lg">{done ? '✅' : i === rewards.length - 1 ? '💎' : '✨'}</span>
                <span className="font-pixel text-[9px]">{r}</span>
              </div>
            )
          })}
        </div>
        <PxButton variant="green" size="lg" className="mt-4 w-full" disabled={claimedToday} onClick={claim}>
          {claimedToday ? 'Повертайся завтра' : `Забрати +${rewards[todayIndex]} ✨`}
        </PxButton>
      </Sheet>
    </>
  )
}

function StatsCard() {
  const { state, items } = useGame()
  const s = state.stats
  const rows = [
    ['🎣', 'Закидів', s.casts],
    ['🐟', 'Риби', s.catches],
    ['📦', 'Ресурсів', s.resourceFinds],
    ['🏺', 'Реліквій', s.relicFinds],
  ]
  const hook = state.equipped.hook && itemOf(items, state.equipped.hook)
  const talisman = state.equipped.talisman && itemOf(items, state.equipped.talisman)
  return (
    <Paper className="p-2">
      <p className="font-pixel text-[10px] text-ink-soft">ЖУРНАЛ РИБАЛКИ</p>
      <div className="mt-2 grid grid-cols-4 gap-1 text-center">
        {rows.map(([icon, label, n]) => (
          <div key={label} className="rounded-sm bg-parch-dark/50 py-1.5">
            <p className="text-lg">{icon}</p>
            <p className="font-pixel text-[11px]">{n}</p>
            <p className="text-[10px] text-ink-soft">{label}</p>
          </div>
        ))}
      </div>
      {(hook || talisman) && (
        <p className="mt-2 text-xs text-ink-soft">
          Вдягнуто: {[hook, talisman].filter(Boolean).map((x) => `${x.emoji} ${x.name}`).join(' · ')}
        </p>
      )}
    </Paper>
  )
}
