import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { itemOf } from '../data.js'
import { useGame } from '../context.js'
import { haptic } from '../tg.js'
import { Bar, Paper, PxButton, ScreenTitle } from '../ui.jsx'

const MONSTER_ART = { snake: '/game/art/snake.webp', golem: '/game/art/golem.webp' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function Island({ id }) {
  const { catalog, state, act, reward, items } = useGame()
  const island = catalog.islands.find((i) => i.id === id)
  const [exploring, setExploring] = useState(false)
  if (!island) return null

  const resource = itemOf(items, island.gather.resourceId)
  const jobHere = state.job?.island === id
  const jobElsewhere = state.job && !jobHere

  const explore = async () => {
    setExploring(true)
    haptic('medium')
    const [res] = await Promise.all([act('POST', `/islands/${id}/explore`), sleep(900)])
    setExploring(false)
    if (!res) return
    const e = res.event
    if (e.kind === 'calm') {
      reward({ title: 'Розвідка', icon: '🧭', lines: [e.text], tone: 'calm', actions: [{ label: 'Далі', variant: 'green' }] })
      return
    }
    const titles = { snake: 'Засідка в джунглях!', golem: 'Напад сніговика-голема!' }
    const texts = {
      win: `${e.monster.name} атакує — але ти перемагаєш у сутичці!`,
      lose: `${e.monster.name} виявився сильнішим. Довелося відступити.`,
      wiped: 'Через від’ємний баланс ✨ бій програно автоматично. Ресурси й спорядження втрачено.',
    }
    reward({
      title: titles[e.monster.id] ?? 'Бій!',
      image: MONSTER_ART[e.monster.id],
      subtitle: e.result === 'win' ? `Перемога! +${e.delta} ✨` : e.result === 'lose' ? `Поразка ${e.delta} ✨` : 'Усе втрачено',
      lines: [texts[e.result]],
      tone: e.result === 'win' ? 'good' : 'bad',
      actions: [{ label: e.result === 'win' ? 'Ура!' : 'Зализати рани', variant: e.result === 'win' ? 'green' : 'paper' }],
    })
  }

  const gather = async () => {
    haptic('medium')
    await act('POST', `/islands/${id}/gather`)
  }

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle title={`${island.emoji} ${island.name}`} subtitle={island.description} />

      <motion.div
        className="relative overflow-hidden rounded-sm border-4 border-wood-dark shadow-[0_6px_0_#0006]"
        animate={exploring ? { x: [0, -3, 3, -2, 0] } : {}}
        transition={{ duration: 0.4, repeat: exploring ? Infinity : 0 }}
      >
        <img src={`/game/art/island-${id}.webp`} alt="" className="aspect-square w-full object-cover" />
        <div className="water-shimmer pointer-events-none absolute inset-x-0 bottom-0 h-1/3" />
        {exploring && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <motion.span
              className="text-6xl"
              animate={{ rotate: [0, 20, -20, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            >
              🧭
            </motion.span>
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-2 gap-2">
        <Paper className="flex flex-col gap-2 p-2">
          <p className="font-extrabold">🧭 Розвідка</p>
          <p className="flex-1 text-xs text-ink-soft">
            Шанс зустріти: {island.monster.name.toLowerCase()}. Перемога +{catalog.config.fightStake} ✨, поразка −
            {catalog.config.fightStake} ✨.
          </p>
          <PxButton variant="blue" disabled={exploring} onClick={explore}>
            {exploring ? 'Йдемо…' : 'Розвідати'}
          </PxButton>
        </Paper>
        <Paper className="flex flex-col gap-2 p-2">
          <p className="font-extrabold">
            {resource.emoji} {island.gather.label}
          </p>
          <p className="flex-1 text-xs text-ink-soft">
            {Math.round(island.gather.durationMs / 1000)} с роботи → +1 {resource.name.toLowerCase()}.
          </p>
          <PxButton variant="green" disabled={!!state.job} onClick={gather}>
            {jobHere ? 'Працюю…' : jobElsewhere ? 'Зайнято' : 'Почати'}
          </PxButton>
        </Paper>
      </div>

      {state.job && <GatherWidget />}
    </div>
  )
}

/** Картка активної заготівлі з таймером і кнопкою «Забрати». */
export function GatherWidget() {
  const { state, catalog, act, reward, items, serverNow } = useGame()
  const job = state.job
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 250)
    return () => clearInterval(t)
  }, [serverNow])
  if (!job) return null

  const island = catalog.islands.find((i) => i.id === job.island)
  const resource = itemOf(items, job.resourceId)
  const total = job.endsAt - job.startedAt
  const left = Math.max(0, job.endsAt - now)
  const done = left === 0

  const claim = async () => {
    const res = await act('POST', '/gather/claim')
    if (!res) return
    reward({
      title: 'Заготівлю завершено!',
      icon: resource.emoji,
      subtitle: `+1 ${resource.name}`,
      lines: [`У рюкзаку: ×${res.reward.total}`],
      tone: 'good',
    })
  }

  return (
    <Paper className="flex items-center gap-3 p-2">
      <motion.span
        className="text-3xl"
        animate={done ? { scale: [1, 1.2, 1] } : { rotate: [0, -25, 0] }}
        transition={{ duration: done ? 0.8 : 0.5, repeat: Infinity }}
      >
        {done ? resource.emoji : island.id === 'jungle' ? '🪓' : '⛏️'}
      </motion.span>
      <div className="flex-1">
        <p className="text-sm font-extrabold">{done ? `${resource.name} готова!` : `${island.gather.verb}…`}</p>
        <Bar value={1 - left / total} tone={done ? 'gold' : ''} className="mt-1" />
        <p className="mt-1 text-xs text-ink-soft">{done ? island.name : `Ще ${Math.ceil(left / 1000)} с · ${island.name}`}</p>
      </div>
      <PxButton size="sm" variant="green" disabled={!done} onClick={claim}>
        Забрати
      </PxButton>
    </Paper>
  )
}
